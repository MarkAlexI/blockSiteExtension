import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { nativeChromiumArgs, prepareNativePages } from '../e2e/native-launch.mjs';

test('native visibility launch and restart use the same explicit isolated profile', () => {
  const config = { profile: '/tmp/isolated profile', port: 12345, headless: false, args: ['--load-extension=/tmp/extension'] };
  const first = nativeChromiumArgs(config);
  const restarted = nativeChromiumArgs({ ...config, port: 12346 });
  assert.equal(first.filter(arg => arg.startsWith('--user-data-dir=')).length, 1);
  assert.equal(first.find(arg => arg.startsWith('--user-data-dir=')), '--user-data-dir=/tmp/isolated profile');
  assert.equal(restarted.find(arg => arg.startsWith('--user-data-dir=')), first.find(arg => arg.startsWith('--user-data-dir=')));
  assert.ok(first.includes('--remote-debugging-port=12345'));
  assert.ok(restarted.includes('--remote-debugging-port=12346'));
  assert.ok(first.includes('--disable-component-extensions-with-background-pages'));
  assert.ok(first.includes('--disable-default-apps'));
  assert.equal(first.at(-1), 'about:blank');
  assert.equal(first.includes('--headless=new'), false);
  assert.equal(nativeChromiumArgs({ ...config, headless: true }).includes('--headless=new'), true);
});

async function devtools(t, initial) {
  const targets = new Map(initial.map(target => [target.id, target]));
  const requests = [];
  let secondRead;
  const polled = new Promise(resolve => { secondRead = resolve; });
  let reads = 0;
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });
    response.setHeader('content-type', 'application/json');
    if (request.url === '/json/list') {
      response.end(JSON.stringify([...targets.values()]));
      if (++reads === 2) secondRead();
    } else if (request.url === '/json/new?about:blank' && request.method === 'PUT') {
      const target = { id: 'created-blank', type: 'page', url: 'about:blank' };
      targets.set(target.id, target);
      response.end(JSON.stringify(target));
    } else if (request.url.startsWith('/json/close/')) {
      targets.delete(decodeURIComponent(request.url.slice('/json/close/'.length)));
      response.end('Target is closing');
    } else {
      response.statusCode = 500; response.end('Unexpected command');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    const closed = once(server, 'close');
    server.close(); server.closeAllConnections();
    await closed;
  });
  return { endpoint: `http://127.0.0.1:${server.address().port}`, targets, requests, polled };
}

const blank = { id: 'blank', type: 'page', url: 'about:blank' };
const keeper = { id: 'created-blank', type: 'page', url: 'about:blank' };
const worker = { id: 'worker', type: 'service_worker', url: 'chrome-extension://test/scripts/service_worker.js' };
const options = { id: 'options', type: 'page', url: 'chrome-extension://test/options/options.html' };

test('fresh native setup waits for the real post-initialization install page before clearing tabs', async t => {
  const api = await devtools(t, [blank, worker]);
  const preparing = prepareNativePages(api.endpoint, { waitForInstall: true, timeout: 2000 });
  await api.polled;
  assert.equal(api.requests.every(request => request.url === '/json/list'), true,
    'neither page cleanup nor CDP attach starts at the earlier migration marker');
  api.targets.set(options.id, options);
  const result = await preparing;
  assert.equal(result.installObserved, true);
  assert.deepEqual(result.closedTargets, [{ id: blank.id, url: blank.url }, { id: options.id, url: options.url }]);
  assert.deepEqual(result.remainingTargets, [worker, keeper]);
});

test('native restart clears restored Options and Popup through browser HTTP endpoints before CDP attach', async t => {
  const popup = { id: 'popup', type: 'page', url: 'chrome-extension://test/index.html' };
  const api = await devtools(t, [blank, options, popup, worker]);
  const result = await prepareNativePages(api.endpoint);
  assert.deepEqual(result.remainingTargets, [worker, keeper]);
  assert.deepEqual(result.closedTargets.map(target => target.id), ['blank', 'options', 'popup']);
  assert.equal(api.requests.some(request => request.url.includes('worker') || request.url.includes('/devtools/')), false,
    'setup never depends on a restored renderer or changes the worker target');
});

test('native setup creates a keeper blank tab before closing the last restored page', async t => {
  const api = await devtools(t, [options, worker]);
  const result = await prepareNativePages(api.endpoint);
  assert.equal(result.remainingTargets.some(target => target.type === 'page' && target.url === 'about:blank'), true);
  const create = api.requests.findIndex(request => request.url === '/json/new?about:blank');
  const close = api.requests.findIndex(request => request.url.startsWith('/json/close/'));
  assert.ok(create >= 0 && create < close, 'the browser never loses its last window');
  assert.equal(api.requests[create].method, 'PUT');
});

test('missing install completion is a setup failure, without clearing pages or rerunning a scenario', async t => {
  const api = await devtools(t, [blank, worker]);
  await assert.rejects(prepareNativePages(api.endpoint, { waitForInstall: true, timeout: 100 }),
    /install page not observed/);
  assert.equal(api.requests.every(request => request.url === '/json/list'), true);
  assert.deepEqual([...api.targets.values()], [blank, worker]);
});
