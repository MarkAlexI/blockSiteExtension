import assert from 'node:assert/strict';
import { targetsAt } from './native-launch.mjs';

// HTTP target discovery is passive: all Playwright/CDP transports must already
// be disconnected. Keep precisely the ordinary HTTP content producer, with
// no extension UI, worker session, readiness ping or forced worker stop.
export async function observeColdWorker(endpoint, workerUrl, { producer, lastApiAt, earliestAlarm,
  now = Date.now, pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
  idleConfirmMs = 1000, onSample = () => {} }) {
  assert.ok(earliestAlarm - now() > 45_000, 'native alarms leave time for idle and first messages');
  const deadline = now() + 45_000;
  let absentAt = null;
  while (now() < deadline) {
    const targets = await targetsAt(endpoint);
    const at = now();
    const pages = targets.filter(target => target.type === 'page');
    assert.deepEqual(pages.map(({ id, url }) => ({ id, url })), [producer], 'only the original content producer remains');
    const workers = targets.filter(target => target.type === 'service_worker' && target.url === workerUrl);
    onSample({ at, pages: pages.map(({ id, url }) => ({ id, url })), workers: workers.map(target => target.id) });
    assert.ok(workers.length <= 1, 'one native extension worker');
    assert.ok(at < earliestAlarm - 15_000, 'first-message deadline precedes every native alarm');
    if (!workers.length) {
      assert.ok(at - lastApiAt >= 25_000, 'default native idle interval');
      absentAt ??= at;
      if (at - absentAt >= idleConfirmMs) return { idleAt: absentAt, stoppedAt: at };
    } else if (absentAt !== null) throw new Error('Worker woke before the first content message');
    await pause(200);
  }
  throw new Error('Worker never automatically unloaded before the first-message window');
}

// Attach ONLY to the already stopped cycle's HTTP page after absence has been
// proven. A page Runtime.evaluate triggers its existing isolated content script;
// never attach to the browser/worker or invoke ServiceWorker/Target commands.
export async function evaluateColdProducer(endpoint, producer, expression, { Socket = globalThis.WebSocket } = {}) {
  assert.equal(typeof Socket, 'function', 'native page CDP requires Node 22 WebSocket');
  const target = (await targetsAt(endpoint)).find(target => target.type === 'page' && target.id === producer.id && target.url === producer.url);
  assert.ok(target?.webSocketDebuggerUrl, 'the original producer has a page-only CDP endpoint');
  const url = new URL(target.webSocketDebuggerUrl);
  const owner = new URL(endpoint);
  assert.equal(url.host, owner.host, 'page endpoint belongs to the fixture browser');
  assert.equal(url.pathname, `/devtools/page/${producer.id}`, 'page-only CDP target');
  const socket = new Socket(url.href);
  try {
    return await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('Cold producer page evaluation did not finish')), 17_000);
      const fail = error => { clearTimeout(deadline); reject(error); };
      socket.addEventListener('error', () => fail(new Error('Cold producer page CDP transport failed')));
      socket.addEventListener('close', () => fail(new Error('Cold producer page CDP transport closed before its reply')));
      socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate',
        params: { expression, awaitPromise: true, returnByValue: true } })));
      socket.addEventListener('message', event => {
        let message;
        try { message = JSON.parse(event.data); } catch (error) { fail(error); return; }
        if (message.id !== 1) return;
        if (message.error || message.result?.exceptionDetails) {
          fail(new Error(`Cold producer page evaluation failed: ${JSON.stringify(message.error || message.result.exceptionDetails)}`)); return;
        }
        if (!Object.hasOwn(message.result?.result || {}, 'value')) {
          fail(new Error('Cold producer page returned no first-reply packet')); return;
        }
        clearTimeout(deadline); resolve(message.result.result.value);
      });
    });
  } finally { socket.close(); }
}
