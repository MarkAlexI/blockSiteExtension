import { targetsAt } from './native-launch.mjs';

// Test-only, native CDP reads. No Runtime evaluation, autoplay change, debugger
// pause, synthetic ended event or audio warm-up is used by this recorder.
export async function observeNativeAudioClock({ browser, endpoint, offscreenUrl }, {
  Socket = globalThis.WebSocket, getTargets = targetsAt, now = Date.now,
  intervalMs = 100, commandTimeoutMs = 750, onPlaying = async () => {}
} = {}) {
  const owner = new URL(endpoint), sound = new URL(offscreenUrl);
  if (owner.protocol !== 'http:' || owner.hostname !== '127.0.0.1' || !owner.port ||
      owner.username || owner.password || owner.pathname !== '/' || owner.search || owner.hash ||
      sound.protocol !== 'chrome-extension:' || !/^[a-p]{32}$/.test(sound.hostname) ||
      sound.pathname !== '/scripts/sound-offscreen.html' || sound.search || sound.hash ||
      typeof Socket !== 'function') throw new Error('Audio clock requires the owned native browser and exact offscreen URL');
  const state = { scope: 'native CDP WebAudio clock; not speaker output or ended-event proof',
    targets: [], errors: [], dropped: 0 };
  const sessions = new Map(), jobs = new Set();
  let stopped = false, discovery;
  const append = (rows, value, limit = 256) => {
    if (rows.length < limit) rows.push(value); else state.dropped++;
  };
  const error = (stage, value) => append(state.errors, { stage, at: now(), error: String(value) }, 30);
  const track = promise => {
    jobs.add(promise);
    void promise.finally(() => jobs.delete(promise)).catch(() => {});
    return promise;
  };
  async function attach(info) {
    const record = { targetId: info.targetId, targetType: info.type, createdAt: now(),
      connected: false, domainEnabled: false, destroyedAt: null, contexts: [], events: [], samples: [] };
    append(state.targets, record, 8);
    const session = { record, socket: null, timer: null, pending: new Map(), next: 0, reading: false,
      contextIds: new Set(), notified: new Set(), disposed: false };
    sessions.set(info.targetId, session);
    const dispose = () => {
      if (session.disposed) return;
      session.disposed = true;
      clearInterval(session.timer);
      for (const pending of session.pending.values()) {
        clearTimeout(pending.timer); pending.reject(new Error('Native audio target connection closed'));
      }
      session.pending.clear();
      session.socket?.close();
    };
    session.dispose = dispose;
    try {
      const target = (await getTargets(endpoint)).find(target => target.id === info.targetId && target.url === offscreenUrl);
      if (!target?.webSocketDebuggerUrl) throw new Error('Offscreen CDP endpoint not available at target discovery');
      const url = new URL(target.webSocketDebuggerUrl);
      if (url.protocol !== 'ws:' || url.host !== owner.host || url.username || url.password || url.search || url.hash ||
          url.pathname !== `/devtools/page/${info.targetId}`) throw new Error('Offscreen CDP endpoint differs from the owned target');
      if (stopped || session.disposed) return;
      const socket = session.socket = new Socket(url.href);
      const send = (method, params = {}) => new Promise((resolve, reject) => {
        if (stopped || session.disposed) { reject(new Error('Audio clock recorder is closed')); return; }
        const id = ++session.next;
        const timer = setTimeout(() => {
          session.pending.delete(id); reject(new Error(`${method} diagnostic deadline`));
        }, commandTimeoutMs);
        session.pending.set(id, { resolve, reject, timer });
        try { socket.send(JSON.stringify({ id, method, params })); }
        catch (failure) { clearTimeout(timer); session.pending.delete(id); reject(failure); }
      });
      socket.addEventListener('message', event => {
        if (stopped || session.disposed) return;
        let message;
        try { message = JSON.parse(String(event.data)); }
        catch (failure) { error('decode native CDP message', failure); return; }
        if (message.id !== undefined) {
          const pending = session.pending.get(message.id);
          if (!pending) return;
          clearTimeout(pending.timer); session.pending.delete(message.id);
          if (message.error) pending.reject(new Error(message.error.message || 'Native WebAudio command failed'));
          else pending.resolve(message.result);
          return;
        }
        const { method, params } = message;
        if (typeof method !== 'string' || !method.startsWith('WebAudio.')) return;
        append(record.events, { at: now(), method, params });
        if (method === 'WebAudio.contextCreated' || method === 'WebAudio.contextChanged') {
          const context = params?.context;
          if (!context?.contextId) return;
          const previous = record.contexts.find(row => row.contextId === context.contextId);
          if (!previous && record.contexts.length >= 8) { state.dropped++; return; }
          if (previous) Object.assign(previous, context); else append(record.contexts, { ...context }, 8);
          if (context.contextType === 'realtime' && context.contextState !== 'closed') session.contextIds.add(context.contextId);
          else session.contextIds.delete(context.contextId);
          if (context.contextState === 'running' && !session.notified.has(context.contextId)) {
            session.notified.add(context.contextId);
            track(Promise.resolve().then(() => onPlaying({ targetId: info.targetId, contextId: context.contextId, at: now() }))
              .catch(failure => error('in-flight native audio output', failure)));
          }
        } else if (method === 'WebAudio.contextWillBeDestroyed') session.contextIds.delete(params?.contextId);
      });
      socket.addEventListener('error', () => {
        if (!stopped && !session.disposed) error('native audio socket', 'WebSocket transport error');
        dispose();
      });
      socket.addEventListener('close', dispose);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Offscreen native CDP connection deadline')), commandTimeoutMs);
        const opened = () => { clearTimeout(timer); record.connected = true; resolve(); };
        const failed = () => { clearTimeout(timer); reject(new Error('Offscreen native CDP connection failed')); };
        socket.addEventListener('open', opened, { once: true });
        socket.addEventListener('error', failed, { once: true });
        socket.addEventListener('close', failed, { once: true });
      });
      if (stopped || session.disposed) return;
      await send('WebAudio.enable'); record.domainEnabled = true;
      const sample = async () => {
        if (stopped || session.disposed || session.reading) return;
        session.reading = true;
        try {
          for (const contextId of session.contextIds) {
            try {
              const result = await send('WebAudio.getRealtimeData', { contextId });
              if (!Number.isFinite(result?.realtimeData?.currentTime)) throw new Error('Native audio clock returned no finite currentTime');
              append(record.samples, { at: now(), contextId, ...result.realtimeData });
            } catch (failure) {
              if (!stopped && !session.disposed && session.contextIds.has(contextId)) error('sample native audio clock', failure);
            }
          }
        } finally { session.reading = false; }
      };
      session.timer = setInterval(() => track(sample()), intervalMs);
      await sample();
    } catch (failure) {
      if (!stopped && !session.disposed) error('attach offscreen WebAudio observer', failure);
      dispose();
    }
  }
  const found = ({ targetInfo }) => {
    if (stopped) return;
    const existing = sessions.get(targetInfo?.targetId);
    if (existing && targetInfo.url !== offscreenUrl) {
      existing.record.scopeChangedAt = now(); existing.dispose?.(); return;
    }
    if (targetInfo?.url !== offscreenUrl || existing) return;
    if (sessions.size >= 8) { state.dropped++; return; }
    track(attach(targetInfo));
  };
  const destroyed = ({ targetId }) => {
    const session = sessions.get(targetId);
    if (session) { session.record.destroyedAt = now(); session.dispose?.(); }
  };
  async function close() {
    if (stopped) return;
    stopped = true;
    for (const session of sessions.values()) session.dispose?.();
    if (discovery) {
      discovery.off('Target.targetCreated', found); discovery.off('Target.targetInfoChanged', found);
      discovery.off('Target.targetDestroyed', destroyed);
      // Detaching only our session unregisters its target discovery. Do not
      // change the Playwright client's target settings or close a native page.
      let timer;
      try { await Promise.race([discovery.detach(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Audio discovery detach deadline')), commandTimeoutMs);
      })]); } catch (failure) { error('detach audio discovery', failure); }
      finally { clearTimeout(timer); }
    }
    // Host queries already have their own 2s limits. Preserve their result in
    // the attachment even when native playback has finished in under a second.
    let timer;
    try { await Promise.race([Promise.allSettled([...jobs]), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Audio diagnostic jobs cleanup deadline')), 2250);
    })]); } catch (failure) { error('finish in-flight audio diagnostics', failure); }
    finally { clearTimeout(timer); }
  }
  try {
    let timer;
    try {
      discovery = await Promise.race([browser.newBrowserCDPSession().then(session => {
        if (stopped) { void session.detach().catch(() => {}); throw new Error('Audio discovery arrived after cleanup'); }
        return session;
      }), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Audio discovery connection deadline')), commandTimeoutMs);
      })]);
    } finally { clearTimeout(timer); }
    discovery.on('Target.targetCreated', found); discovery.on('Target.targetInfoChanged', found);
    discovery.on('Target.targetDestroyed', destroyed);
    try {
      await Promise.race([discovery.send('Target.setDiscoverTargets', { discover: true }), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Audio target discovery deadline')), commandTimeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  } catch (failure) { error('start native audio discovery', failure); await close(); }
  return { read: () => structuredClone(state), close };
}
