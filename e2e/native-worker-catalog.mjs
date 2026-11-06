import assert from 'node:assert/strict';
import { readNativeI18n, requireNativeI18n } from './native-i18n.mjs';

// Only a worker already running at the native onInstalled barrier is observed.
// Close this worker-only CDP transport before any page cleanup or scenario;
// session restore and cold/idle observations never enter this prerequisite.
export async function requireWorkerCatalogBeforeCleanup(endpoint, readiness,
  { testInfo, Socket = globalThis.WebSocket } = {}) {
  if (!readiness.installReady) return null;
  const installPage = readiness.targets.find(target => target.id === readiness.installReady.id);
  assert.ok(installPage, 'localized native install view still exists before cleanup');
  const pageUrl = new URL(installPage.url);
  assert.equal(pageUrl.protocol, 'chrome-extension:');
  const id = pageUrl.hostname;
  assert.match(id, /^[a-p]{32}$/);
  const workerUrl = new URL('/scripts/service_worker.js', pageUrl).href;
  const workers = readiness.targets.filter(target => target.type === 'service_worker' && target.url === workerUrl);
  assert.equal(workers.length, 1, 'one already running worker belongs to the localized install view');
  const target = workers[0];
  const url = new URL(target.webSocketDebuggerUrl);
  assert.equal(url.protocol, 'ws:');
  assert.equal(url.host, new URL(endpoint).host, 'worker CDP belongs to the owned browser');
  assert.equal(url.pathname, `/devtools/page/${target.id}`);
  assert.equal(typeof Socket, 'function', 'native worker prerequisite requires Node 22 WebSocket');

  return requireNativeI18n({ id, testInfo }, { async evaluate() {
    const socket = new Socket(url.href);
    return new Promise((resolve, reject) => {
      let settled = false, replied = false, value;
      const finish = error => {
        if (settled) return; settled = true; clearTimeout(timer);
        if (error) { socket.close(); reject(error); } else resolve(value);
      };
      const timer = setTimeout(() => finish(new Error('Native worker catalog prerequisite timed out')),
        readiness.timeout);
      socket.addEventListener('error', () => finish(new Error('Native worker catalog transport failed')));
      socket.addEventListener('close', () => finish(replied ? null : new Error('Native worker catalog transport closed before its reply')));
      socket.addEventListener('open', () => {
        if (!settled) socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate',
          params: { expression: `(${readNativeI18n.toString()})()`, returnByValue: true } }));
      });
      socket.addEventListener('message', event => {
        if (settled || replied) return;
        let packet;
        try { packet = JSON.parse(event.data); } catch (error) { finish(error); return; }
        if (packet.id !== 1) return;
        if (packet.error || packet.result?.exceptionDetails) {
          finish(new Error(`Native worker catalog evaluation failed: ${JSON.stringify(packet.error || packet.result.exceptionDetails)}`)); return;
        }
        if (!packet.result?.result?.value || typeof packet.result.result.value !== 'object') {
          finish(new Error('Native worker catalog evaluation returned no snapshot')); return;
        }
        value = packet.result.result.value; replied = true;
        socket.close(); // Resolve only after Chrome confirms disconnection.
      });
    });
  } }, 'native-worker-i18n-before-cleanup');
}
