import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { observeNativeAudioClock } from '../e2e/native-audio-clock.mjs';
import { readNativeAudioOutput } from '../e2e/native-audio-output.mjs';

const ID = 'a'.repeat(32), TARGET = 'B'.repeat(32);
const URL = `chrome-extension://${ID}/scripts/sound-offscreen.html`;
const endpoint = 'http://127.0.0.1:8123';
const context = { contextId: 'native-context', contextType: 'realtime', contextState: 'running',
  callbackBufferSize: 512, maxOutputChannelCount: 2, sampleRate: 44100 };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(read, check) {
  const deadline = Date.now() + 2000;
  for (;;) { const value = read(); if (check(value)) return value;
    assert.ok(Date.now() < deadline, 'native observer reached the expected state'); await tick(); }
}

function fixture({ stalled = false, unsupported = false, malformed = false, neverReply = false, foreign = false } = {}) {
  const discovery = new EventEmitter(), calls = [], sockets = [];
  let detached = 0, samples = 0, host = 0;
  discovery.send = async (method, params) => { calls.push({ method, params }); };
  discovery.detach = async () => { detached++; };
  class Socket extends EventTarget {
    constructor(url) { super(); this.url = url; this.closed = false; sockets.push(this);
      queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
    message(value) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(value) })); }
    send(packet) {
      const { id, method, params } = JSON.parse(packet); calls.push({ method, params });
      queueMicrotask(() => {
        if (this.closed) return;
        if (method === 'WebAudio.enable') {
          if (unsupported) { this.message({ id, error: { message: 'WebAudio domain unavailable' } }); return; }
          this.message({ id, result: {} });
          this.message({ method: 'WebAudio.contextCreated', params: { context } });
          this.message({ method: 'WebAudio.contextChanged', params: { context } });
          this.message({ method: 'WebAudio.audioNodeCreated', params: { node: { contextId: context.contextId, nodeId: 'oscillator', nodeType: 'Oscillator' } } });
        } else {
          assert.equal(method, 'WebAudio.getRealtimeData');
          if (!neverReply) this.message({ id, result: malformed ? {} : { realtimeData: {
            currentTime: stalled ? 0 : ++samples * 0.25, renderCapacity: 0.03, callbackIntervalMean: 0.01, callbackIntervalVariance: 0
          } } });
        }
      });
    }
    close() { if (!this.closed) { this.closed = true; this.dispatchEvent(new Event('close')); } }
  }
  return { discovery, calls, sockets, detached: () => detached, host: () => host,
    announce(url = URL, targetId = TARGET) { discovery.emit('Target.targetCreated', { targetInfo: { url, targetId, type: 'other' } }); },
    destroy() { discovery.emit('Target.targetDestroyed', { targetId: TARGET }); },
    config: { browser: { newBrowserCDPSession: async () => discovery }, endpoint, offscreenUrl: URL },
    dependencies: { Socket, intervalMs: 2, commandTimeoutMs: 50,
      getTargets: async () => [{ id: TARGET, url: URL, webSocketDebuggerUrl: `ws://${foreign ? 'other.example:8123' : '127.0.0.1:8123'}/devtools/page/${TARGET}` }],
      onPlaying: async () => { host++; } } };
}

for (const stalled of [false, true]) test(`native CDP records ${stalled ? 'stalled' : 'advancing'} audio time without evaluating or changing playback`, async () => {
  const f = fixture({ stalled }), observer = await observeNativeAudioClock(f.config, f.dependencies);
  try {
    f.announce();
    const state = await until(observer.read, value => value.targets[0]?.samples.length >= 3);
    assert.equal(state.targets[0].connected, true); assert.equal(state.targets[0].domainEnabled, true);
    assert.equal(state.targets[0].contexts[0].sampleRate, 44100);
    assert.deepEqual(state.targets[0].samples.slice(0, 3).map(x => x.currentTime), stalled ? [0, 0, 0] : [0.25, 0.5, 0.75]);
    assert.equal(f.host(), 1, 'one host capture per context, including repeated running events');
    assert.deepEqual([...new Set(f.calls.map(x => x.method))].sort(),
      ['Target.setDiscoverTargets', 'WebAudio.enable', 'WebAudio.getRealtimeData'].sort());
    f.announce(); await tick(); assert.equal(f.sockets.length, 1);
    f.destroy(); assert.ok(observer.read().targets[0].destroyedAt); assert.equal(f.sockets[0].closed, true);
  } finally { await observer.close(); }
  assert.equal(f.detached(), 1);
  assert.equal(f.discovery.listenerCount('Target.targetCreated'), 0);
});

test('the recorder rejects foreign endpoints and ignores every non-owned offscreen target', async () => {
  const f = fixture();
  for (const config of [{ ...f.config, endpoint: 'http://personal.example:8123' },
    { ...f.config, offscreenUrl: `chrome-extension://${ID}/options/options.html` }])
    await assert.rejects(observeNativeAudioClock(config, f.dependencies), /owned native browser/);
  assert.deepEqual(f.calls, []);
  const observer = await observeNativeAudioClock(f.config, f.dependencies);
  try {
    f.announce(`chrome-extension://${ID}/scripts/service_worker.js`);
    f.announce(`chrome-extension://${'b'.repeat(32)}/scripts/sound-offscreen.html`);
    f.announce('https://example.test/'); await tick();
    assert.deepEqual(observer.read().targets, []); assert.equal(f.sockets.length, 0);
  } finally { await observer.close(); }
});

test('a mismatched discovered WebSocket cannot receive an observer command', async () => {
  const f = fixture({ foreign: true }), observer = await observeNativeAudioClock(f.config, f.dependencies);
  try { f.announce(); await until(observer.read, value => value.errors.length > 0);
    assert.equal(f.sockets.length, 0); assert.equal(f.calls.length, 1);
  } finally { await observer.close(); }
});

test('navigation away from the owned offscreen URL closes its observer without changing the target', async () => {
  const f = fixture(), observer = await observeNativeAudioClock(f.config, f.dependencies);
  try {
    f.announce(); await until(observer.read, state => state.targets[0]?.samples.length > 0);
    f.discovery.emit('Target.targetInfoChanged', { targetInfo: { targetId: TARGET, url: 'https://example.test/' } });
    assert.equal(f.sockets[0].closed, true); assert.ok(observer.read().targets[0].scopeChangedAt);
    const calls = f.calls.length; f.announce(); await tick();
    assert.equal(f.calls.length, calls); assert.equal(f.sockets.length, 1);
  } finally { await observer.close(); }
});

test('missing WebAudio support and malformed clock replies stay explicit instead of inventing timing evidence', async () => {
  for (const options of [{ unsupported: true }, { malformed: true }]) {
    const f = fixture(options), observer = await observeNativeAudioClock(f.config, f.dependencies);
    try { f.announce(); const value = await until(observer.read, state => state.errors.length > 0);
      assert.equal(value.targets[0].samples.length, 0);
      if (options.unsupported) assert.equal(value.targets[0].domainEnabled, false);
    } finally { await observer.close(); }
  }
});

test('closing the recorder cancels an unanswered clock read and permits independent browser cleanup', async () => {
  const f = fixture({ neverReply: true }), observer = await observeNativeAudioClock(f.config, f.dependencies);
  f.announce(); await until(() => f.calls, value => value.some(x => x.method === 'WebAudio.getRealtimeData'));
  await observer.close(); await observer.close();
  assert.equal(f.sockets[0].closed, true); assert.equal(f.detached(), 1);
  assert.deepEqual(observer.read().errors, []);
});

test('late discovery setup is detached after its own deadline and cannot observe another target', async () => {
  let resolve, detached = 0;
  const pending = new Promise(done => { resolve = done; });
  const observer = await observeNativeAudioClock({ browser: { newBrowserCDPSession: () => pending }, endpoint, offscreenUrl: URL },
    { commandTimeoutMs: 10, Socket: fixture().dependencies.Socket });
  assert.match(observer.read().errors[0].error, /discovery connection deadline/);
  resolve({ detach: async () => { detached++; } }); await tick();
  assert.equal(detached, 1); await observer.close();
});

test('cleanup waits for an already-started bounded host capture before the attachment is read', async () => {
  const f = fixture(); let resolve, finished = false;
  const capture = new Promise(done => { resolve = done; });
  f.dependencies.onPlaying = async () => { await capture; finished = true; };
  const observer = await observeNativeAudioClock(f.config, f.dependencies);
  f.announce(); await until(observer.read, state => state.targets[0]?.samples.length > 0);
  let closed = false; const closing = observer.close().then(() => { closed = true; });
  await tick(); assert.equal(closed, false); resolve(); await closing;
  assert.equal(finished, true);
});

test('in-flight PulseAudio detail reads are finite and never mutate the output sink', async () => {
  const calls = [];
  const output = await readNativeAudioOutput({ detailed: true, run: async (command, args, options) => {
    calls.push({ command, args, options });
    if (args.join(' ') === 'list sink-inputs') return { stdout: 'Corked: yes\nBuffer Latency: 2000000 usec', stderr: '' };
    if (args.join(' ') === 'info') throw new Error('host unavailable');
    return { stdout: 'native output', stderr: '' };
  } });
  assert.deepEqual(calls.map(x => x.args), [['info'], ['list', 'short', 'sinks'], ['list', 'short', 'sink-inputs'], ['list', 'sink-inputs']]);
  assert.ok(calls.every(x => x.command === 'pactl' && x.options.timeout === 2000));
  assert.match(output[0].error, /host unavailable/); assert.match(output[3].stdout, /Corked: yes/);
});
