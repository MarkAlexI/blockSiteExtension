import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { observeColdWorker, evaluateColdProducer } from '../e2e/native-cold-message.mjs';

const producer = { id: 'producer', type: 'page', url: 'http://cold.bd-e2e.test/' };
const identity = { id: producer.id, url: producer.url };
const worker = { id: 'worker', type: 'service_worker', url: 'chrome-extension://test/scripts/service_worker.js' };
function config() {
  let at = 30_000;
  return { producer: identity, lastApiAt: 0, earliestAlarm: 90_000,
    now: () => at, pause: async () => { at += 1000; } };
}
async function discovery(t, reply) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });
    const result = reply(requests.length, server.address().port);
    response.writeHead(result.status ?? 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(result.targets));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { const closed = once(server, 'close'); server.close(); server.closeAllConnections(); await closed; });
  return { endpoint: `http://127.0.0.1:${server.address().port}`, requests };
}

test('HTTP cold-message model returns sustained absence before any message or worker attach', async t => {
  const api = await discovery(t, read => ({ targets: [producer, ...(read === 1 ? [worker] : [])] }));
  const evidence = await observeColdWorker(api.endpoint, worker.url, config());
  assert.deepEqual(evidence, { idleAt: 31_000, stoppedAt: 32_000 });
  assert.equal(api.requests.every(request => request.method === 'GET' && request.url === '/json/list'), true);
});

test('HTTP cold-message model rejects pinned workers, early unload and pre-message wake', async t => {
  const pinned = await discovery(t, () => ({ targets: [producer, worker] }));
  await assert.rejects(observeColdWorker(pinned.endpoint, worker.url, config()), /never automatically unloaded/);
  const early = await discovery(t, () => ({ targets: [producer] }));
  await assert.rejects(observeColdWorker(early.endpoint, worker.url, { ...config(), lastApiAt: 30_000 }), /default native idle/);
  const wake = await discovery(t, read => ({ targets: [producer, ...(read === 2 ? [] : [worker])] }));
  await assert.rejects(observeColdWorker(wake.endpoint, worker.url, config()), /woke before the first/);
});

test('HTTP cold-message model rejects extension views, replaced producer and insufficient alarm window', async t => {
  for (const pages of [[], [{ ...producer, id: 'replacement' }], [producer, { id: 'ui', type: 'page', url: 'chrome-extension://test/index.html' }]]) {
    const api = await discovery(t, () => ({ targets: pages }));
    await assert.rejects(observeColdWorker(api.endpoint, worker.url, config()), /original content producer/);
  }
  const api = await discovery(t, () => ({ targets: [producer] }));
  await assert.rejects(observeColdWorker(api.endpoint, worker.url, { ...config(), earliestAlarm: 60_000 }), /leave time/);
  await assert.rejects(observeColdWorker(api.endpoint, worker.url, { ...config(), lastApiAt: 0,
    now: (() => { let reads = 0; return () => reads++ < 3 ? 30_000 : 80_000; })() }), /deadline precedes/);
});

test('HTTP cold-message model propagates discovery failure instead of accepting idle', async t => {
  const api = await discovery(t, () => ({ status: 503, targets: [] }));
  await assert.rejects(observeColdWorker(api.endpoint, worker.url, config()), /HTTP 503/);
});

function socketModel(response) {
  const calls = [];
  class Socket extends EventTarget {
    constructor(url) { super(); calls.push({ url }); queueMicrotask(() => this.dispatchEvent(new Event('open'))); }
    send(value) {
      calls.push(JSON.parse(value));
      queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(response) })));
    }
    close() { calls.push({ closed: true }); }
  }
  return { Socket, calls };
}
test('page-only CDP model sends one evaluation to the original producer and returns its first replies', async t => {
  const api = await discovery(t, (_, port) => ({ targets: [{ ...producer, webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/producer` }] }));
  const packet = { replies: [{ id: 'first', response: { success: true } }] };
  const model = socketModel({ id: 1, result: { result: { value: packet } } });
  assert.deepEqual(await evaluateColdProducer(api.endpoint, identity, 'trigger()', model), packet);
  assert.deepEqual(model.calls.slice(1), [{ id: 1, method: 'Runtime.evaluate',
    params: { expression: 'trigger()', awaitPromise: true, returnByValue: true } }, { closed: true }]);
});

test('page-only CDP model rejects worker/browser endpoints and propagates evaluate exceptions', async t => {
  for (const suffix of ['/devtools/browser/producer', '/devtools/service_worker/producer']) {
    const api = await discovery(t, (_, port) => ({ targets: [{ ...producer, webSocketDebuggerUrl: `ws://127.0.0.1:${port}${suffix}` }] }));
    const model = socketModel({});
    await assert.rejects(evaluateColdProducer(api.endpoint, identity, 'trigger()', model), /page-only CDP target/);
    assert.deepEqual(model.calls, [], 'no non-page debugger is connected');
  }
  const api = await discovery(t, (_, port) => ({ targets: [{ ...producer, webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/page/producer` }] }));
  for (const response of [{ id: 1, error: { message: 'native rejection' } },
    { id: 1, result: { exceptionDetails: { text: 'content failed' } } }, { id: 1, result: {} }]) {
    await assert.rejects(evaluateColdProducer(api.endpoint, identity, 'trigger()', socketModel(response)), /evaluation failed|no first-reply/);
  }
});
