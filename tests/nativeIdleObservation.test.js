import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { observeNativeIdleWake } from '../e2e/native-idle.mjs';

const blank = { id: 'keeper', type: 'page', url: 'about:blank' };
const worker = { id: 'reused-host', type: 'service_worker', url: 'chrome-extension://test/scripts/service_worker.js' };
function options(overrides) {
  let at = 30_000;
  return { wakeAt: 30_060, lastApiAt: 0,
    unloadTimeout: 50, wakeTimeout: 40, pollInterval: 5, idleConfirmMs: 10,
    now: () => at, pauseFor: async ms => { at += ms; }, ...overrides };
}

async function discovery(t, reply) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });
    response.setHeader('content-type', 'application/json');
    if (request.url !== '/json/list' || request.method !== 'GET') {
      response.statusCode = 500; response.end('Unexpected mutation'); return;
    }
    const result = reply(requests.length);
    response.statusCode = result.status ?? 200;
    response.end(JSON.stringify(result.targets));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    const closed = once(server, 'close');
    server.close(); server.closeAllConnections();
    await closed;
  });
  return { endpoint: `http://127.0.0.1:${server.address().port}`, requests };
}

test('HTTP lifecycle model observes sustained absence then alarm wake even when Chromium reuses the target ID', async t => {
  let config;
  const api = await discovery(t, read => ({ targets: [blank,
    ...(read === 1 || config.now() >= config.wakeAt ? [worker] : [])] }));
  config = options();
  const samples = [];
  const result = await observeNativeIdleWake(api.endpoint, worker.url, { ...config,
    onSample: sample => samples.push(sample) });
  assert.equal(result.target.id, worker.id);
  assert.ok(result.idleAt < config.wakeAt && result.wakeObservedAt >= config.wakeAt);
  assert.ok(samples.filter(sample => !sample.workers.length).length >= 2);
  assert.ok(api.requests.every(request => request.method === 'GET' && request.url === '/json/list'),
    'HTTP observation never attaches, evaluates, stops, starts or reloads the worker');
});

test('HTTP lifecycle model rejects a continuously running debugger-pinned worker', async t => {
  const api = await discovery(t, () => ({ targets: [blank, worker] }));
  await assert.rejects(observeNativeIdleWake(api.endpoint, worker.url, options()), /never unloaded/);
});

test('HTTP lifecycle model rejects disappearance before the native idle window', async t => {
  const api = await discovery(t, () => ({ targets: [blank] }));
  await assert.rejects(observeNativeIdleWake(api.endpoint, worker.url, options({ lastApiAt: 30_000 })),
    /before the native idle window/);
});

test('HTTP lifecycle model rejects a wake before the expected alarm', async t => {
  const api = await discovery(t, read => ({ targets: read < 6 ? [blank] : [blank, worker] }));
  await assert.rejects(observeNativeIdleWake(api.endpoint, worker.url, options({ wakeAt: 30_500 })),
    /woke before the expected native alarm/);
});

test('HTTP lifecycle model rejects absence without a subsequent alarm wake', async t => {
  const api = await discovery(t, () => ({ targets: [blank] }));
  await assert.rejects(observeNativeIdleWake(api.endpoint, worker.url, options()), /did not wake/);
});

test('HTTP lifecycle model rejects a wake delayed until a competing alarm', async t => {
  const api = await discovery(t, () => ({ targets: [blank] }));
  await assert.rejects(observeNativeIdleWake(api.endpoint, worker.url,
    options({ wakeBefore: 30_085 })), /next competing alarm/);
});

test('HTTP lifecycle model rejects extension pages and loss of the keeper window', async t => {
  const page = { id: 'options', type: 'page', url: 'chrome-extension://test/options/options.html' };
  const api = await discovery(t, read => ({ targets: read === 1 ? [blank, page] : [] }));
  await assert.rejects(observeNativeIdleWake(api.endpoint, worker.url, options()), /non-blank page/);
  await assert.rejects(observeNativeIdleWake(api.endpoint, worker.url, options()), /lost the keeper/);
});

test('HTTP lifecycle model propagates discovery errors without treating them as an unloaded worker', async t => {
  const api = await discovery(t, () => ({ status: 503, targets: [] }));
  await assert.rejects(observeNativeIdleWake(api.endpoint, worker.url, options()), /HTTP 503/);
  assert.equal(api.requests.length, 1);
});
