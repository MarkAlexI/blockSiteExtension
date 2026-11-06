import assert from 'node:assert/strict';
import { readNativeI18n, requireNativeI18n } from './native-i18n.mjs';

// Only an already exposed worker is observed, before the onInstalled UI wait.
// Close this worker-only CDP transport before any page cleanup or scenario;
// session restore and cold/idle observations never enter this prerequisite.
export async function requireWorkerCatalogBeforeCleanup(endpoint, readiness,
  { testInfo, Socket = globalThis.WebSocket } = {}) {
  if (!readiness.waitForInstall) return null;
  const workers = readiness.targets.filter(target => target.type === 'service_worker' &&
    /^chrome-extension:\/\/[a-p]{32}\/scripts\/service_worker\.js$/.test(target.url));
  assert.equal(workers.length, 1, 'one already exposed extension worker supplies native install readiness');
  const target = workers[0];
  const id = new URL(target.url).hostname;
  const url = new URL(target.webSocketDebuggerUrl);
  assert.equal(url.protocol, 'ws:');
  assert.equal(url.host, new URL(endpoint).host, 'worker CDP belongs to the owned browser');
  assert.equal(url.pathname, `/devtools/page/${target.id}`);
  assert.equal(typeof Socket, 'function', 'native worker prerequisite requires Node 22 WebSocket');

  return requireNativeI18n({ id, testInfo }, { async evaluate() {
    const socket = new Socket(url.href);
    return new Promise((resolve, reject) => {
      let settled = false, replied = false, value;
      let context = null, scriptLoaded = false, runtimeEnabled = false, resumed = false, evaluating = false;
      const finish = error => {
        if (settled) return; settled = true; clearTimeout(timer);
        if (error) {
          error.nativeReadiness = { phase: 'worker-catalog', targetId: target.id, url: target.url,
            context, scriptLoaded, runtimeEnabled, resumed, evaluating, replied };
          socket.close(); reject(error);
        } else resolve(value);
      };
      const send = (id, method, params = {}) => socket.send(JSON.stringify({ id, method, params }));
      const evaluate = () => {
        if (settled || evaluating || !runtimeEnabled || !resumed || !scriptLoaded || !context) return;
        evaluating = true;
        send(3, 'Runtime.evaluate', { expression: `(${readNativeI18n.toString()})()`,
          contextId: context.id, returnByValue: true });
      };
      const timer = setTimeout(() => finish(new Error('Native worker catalog prerequisite timed out')),
        readiness.timeout);
      socket.addEventListener('error', () => finish(new Error('Native worker catalog transport failed')));
      socket.addEventListener('close', () => finish(replied ? null : new Error('Native worker catalog transport closed before its reply')));
      socket.addEventListener('open', () => {
        if (settled) return;
        // Match Chromium 151 / Playwright's worker bootstrap: a V8 context can
        // precede extension bindings and module imports. The script-loaded
        // event is replayed on attach if execution already finished.
        send(1, 'Runtime.enable');
        send(2, 'Runtime.runIfWaitingForDebugger');
      });
      socket.addEventListener('message', event => {
        if (settled || replied) return;
        let packet;
        try { packet = JSON.parse(event.data); } catch (error) { finish(error); return; }
        if (packet.method === 'Runtime.executionContextCreated') {
          const candidate = packet.params?.context;
          if (candidate?.auxData?.isDefault === false) return;
          if (!Number.isInteger(candidate?.id)) { finish(new Error('Native worker supplied no execution context id')); return; }
          if (context && context.id !== candidate.id) { finish(new Error('Native worker exposed multiple default contexts')); return; }
          context = { id: candidate.id, uniqueId: candidate.uniqueId, origin: candidate.origin };
          evaluate(); return;
        }
        if ((packet.method === 'Runtime.executionContextDestroyed' && packet.params?.executionContextId === context?.id) ||
            packet.method === 'Runtime.executionContextsCleared') {
          finish(new Error('Native worker execution context was destroyed before catalog observation completed')); return;
        }
        if (packet.method === 'Inspector.workerScriptLoaded') { scriptLoaded = true; evaluate(); return; }
        if (![1, 2, 3].includes(packet.id)) return;
        if (packet.error || packet.result?.exceptionDetails) {
          finish(new Error(`Native worker catalog evaluation failed: ${JSON.stringify(packet.error || packet.result.exceptionDetails)}`)); return;
        }
        if (packet.id === 1) { runtimeEnabled = true; evaluate(); return; }
        if (packet.id === 2) { resumed = true; evaluate(); return; }
        if (!packet.result?.result?.value || typeof packet.result.result.value !== 'object') {
          finish(new Error('Native worker catalog evaluation returned no snapshot')); return;
        }
        value = packet.result.result.value; replied = true;
        socket.close(); // Resolve only after Chrome confirms disconnection.
      });
    });
  } }, 'native-worker-i18n-before-cleanup');
}
