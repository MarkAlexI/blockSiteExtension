import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { nativeChromiumArgs, prepareNativePages, targetsAt } from '../e2e/native-launch.mjs';
import { requiresNativeInstallReadiness } from '../e2e/native-install.mjs';

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

async function devtools(t, initial, { stallListReads = 0, listStatus = 200, listBody } = {}) {
  const targets = new Map(initial.map(target => [target.id, target]));
  const requests = [];
  let secondRead;
  const polled = new Promise(resolve => { secondRead = resolve; });
  let reads = 0;
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });
    response.setHeader('content-type', 'application/json');
    if (request.url === '/json/list') {
      if (++reads === 2) secondRead();
      if (reads <= stallListReads) return; // Browser is listening but not yet serving target discovery.
      response.statusCode = listStatus;
      response.end(listBody ?? JSON.stringify([...targets.values()]));
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
  return { endpoint: `http://127.0.0.1:${server.address().port}`, targets, requests, polled,
    async discoverTargets() {
      requests.push({ method: 'GET', url: '/json/list' });
      return [...targets.values()];
    } };
}

const blank = { id: 'blank', type: 'page', url: 'about:blank' };
const keeper = { id: 'created-blank', type: 'page', url: 'about:blank' };
const worker = { id: 'worker', type: 'service_worker', url: 'chrome-extension://test/scripts/service_worker.js' };
const installTitle = 'Site Blocker';
const options = { id: 'options', type: 'page', url: 'chrome-extension://test/options/options.html', title: installTitle };

test('startup discovery survives one stalled read within the existing setup deadline without replaying mutations', async t => {
  const api = await devtools(t, [blank, worker, options], { stallListReads: 1 });
  const result = await prepareNativePages(api.endpoint, { waitForInstall: true, installTitle, timeout: 2500 });
  assert.deepEqual(result.installReady, { id: options.id, title: installTitle, expectedTitle: installTitle });
  assert.deepEqual(result.remainingTargets, [worker, keeper]);
  assert.equal(result.targetDiscovery.transientFailures.length, 1);
  assert.equal(result.targetDiscovery.transientFailures[0].name, 'TimeoutError');
  assert.deepEqual(api.requests.slice(0, 2), [
    { method: 'GET', url: '/json/list' }, { method: 'GET', url: '/json/list' }
  ]);
  assert.equal(api.requests.filter(r => r.url === '/json/new?about:blank').length, 1);
  assert.equal(api.requests.filter(r => r.url === '/json/close/blank').length, 1);
  assert.equal(api.requests.filter(r => r.url === '/json/close/options').length, 1);
});

test('startup discovery exhausts its original total budget without clearing pages or starting a scenario', async t => {
  const api = await devtools(t, [blank, worker, options], { stallListReads: Infinity });
  await assert.rejects(prepareNativePages(api.endpoint, { waitForInstall: true, installTitle, timeout: 150 }),
    error => {
      assert.match(error.message, /startup target discovery exceeded the setup deadline/);
      assert.equal(error.nativeReadiness.phase, 'target-discovery');
      assert.equal(error.nativeReadiness.budgetMs, 150);
      assert.equal(error.nativeReadiness.attempts, 1);
      assert.equal(error.cause.name, 'TimeoutError');
      return true;
    });
  assert.ok(api.requests.every(request => request.url === '/json/list'));
  assert.deepEqual([...api.targets.values()], [blank, worker, options]);
});

test('startup discovery does not mask HTTP or malformed-protocol failures as temporary readiness', async t => {
  for (const failure of [{ listStatus: 500 }, { listBody: 'invalid JSON' }, { listBody: '{}' }]) {
    const api = await devtools(t, [blank, worker, options], failure);
    await assert.rejects(prepareNativePages(api.endpoint, { waitForInstall: true, installTitle, timeout: 500 }));
    assert.deepEqual(api.requests, [{ method: 'GET', url: '/json/list' }]);
    assert.deepEqual([...api.targets.values()], [blank, worker, options]);
  }
});

test('strict target observers outside startup retain one request without continuation', async t => {
  const api = await devtools(t, [blank, worker, options], { stallListReads: 1 });
  await assert.rejects(targetsAt(api.endpoint, { timeout: 30 }), { name: 'TimeoutError' });
  assert.deepEqual(api.requests, [{ method: 'GET', url: '/json/list' }]);
  assert.deepEqual([...api.targets.values()], [blank, worker, options]);
});

test('fresh native setup waits for the real post-initialization install page before clearing tabs', async t => {
  const api = await devtools(t, [blank, worker]);
  const preparing = prepareNativePages(api.endpoint, { waitForInstall: true, installTitle, timeout: 2000 });
  await api.polled;
  assert.equal(api.requests.every(request => request.url === '/json/list'), true,
    'neither page cleanup nor CDP attach starts at the earlier migration marker');
  api.targets.set(options.id, options);
  const result = await preparing;
  assert.equal(result.installObserved, true);
  assert.deepEqual(result.installReady, { id: options.id, title: installTitle, expectedTitle: installTitle });
  assert.deepEqual(result.closedTargets, [{ id: blank.id, url: blank.url }, { id: options.id, url: options.url }]);
  assert.deepEqual(result.remainingTargets, [worker, keeper]);
});

test('fresh native setup keeps the install view while its native translation is pending', async t => {
  const loading = { ...options, title: 'Options page for BlockDistraction' };
  const api = await devtools(t, [blank, worker, loading]);
  const preparing = prepareNativePages(api.endpoint, { waitForInstall: true, installTitle, timeout: 2000 });
  await api.polled;
  assert.equal(api.requests.every(request => request.url === '/json/list'), true,
    'the post-initialization target alone must not allow premature page cleanup');
  assert.deepEqual([...api.targets.values()], [blank, worker, loading]);
  api.targets.set(options.id, options);
  const result = await preparing;
  assert.deepEqual(result.installReady, { id: options.id, title: installTitle, expectedTitle: installTitle });
  assert.deepEqual(result.remainingTargets, [worker, keeper]);
});

test('a CLI-loaded native restart keeps its new install view until localization completes', async t => {
  const loading = { ...options, title: 'Options page for BlockDistraction' };
  const api = await devtools(t, [blank, worker, loading]);
  const waitForInstall = requiresNativeInstallReadiness({ installed: true, args: ['--load-extension=/owned/runtime'] });
  const preparing = prepareNativePages(api.endpoint, { waitForInstall, installTitle, timeout: 2000 });
  await api.polled;
  assert.ok(api.requests.every(request => request.url === '/json/list'),
    'a seeded profile must not cause early cleanup of a new command-line installation');
  assert.deepEqual([...api.targets.values()], [blank, worker, loading]);
  api.targets.set(options.id, options);
  const result = await preparing;
  assert.deepEqual(result.installReady, { id: options.id, title: installTitle, expectedTitle: installTitle });
  assert.deepEqual(result.remainingTargets, [worker, keeper]);
});

test('a CLI-loaded restart with empty native localization fails before hiding its install page', async t => {
  const untranslated = { ...options, title: 'header' };
  const api = await devtools(t, [blank, worker, untranslated]);
  const waitForInstall = requiresNativeInstallReadiness({ installed: true, args: ['--load-extension=/owned/runtime'] });
  await assert.rejects(prepareNativePages(api.endpoint, { waitForInstall, installTitle }), /install localization failed/);
  assert.deepEqual([...api.targets.values()], [blank, worker, untranslated]);
  assert.deepEqual(api.requests, [{ method: 'GET', url: '/json/list' }]);
});

test('a native translation key fails fresh setup without closing or reloading the install view', async t => {
  const untranslated = { ...options, title: 'header' };
  const api = await devtools(t, [blank, worker, untranslated]);
  await assert.rejects(prepareNativePages(api.endpoint, { waitForInstall: true, installTitle }),
    /install localization failed before page cleanup.*"title":"header"/);
  assert.deepEqual(api.requests, [{ method: 'GET', url: '/json/list' }]);
  assert.deepEqual([...api.targets.values()], [blank, worker, untranslated]);
});

test('an uncompleted native translation times out without weakening readiness or clearing pages', async t => {
  const loading = { ...options, title: 'Options page for BlockDistraction' };
  const api = await devtools(t, [blank, worker, loading]);
  let elapsed = 0;
  await assert.rejects(prepareNativePages(api.endpoint, { waitForInstall: true, installTitle, timeout: 200,
    now: () => elapsed, sleep: async ms => { elapsed += ms; }, discoverTargets: api.discoverTargets }),
    /install localization not completed/);
  assert.equal(elapsed, 200);
  assert.equal(api.requests.length, 2);
  assert.equal(api.requests.every(request => request.url === '/json/list'), true);
  assert.deepEqual([...api.targets.values()], [blank, worker, loading]);
});

test('native restart clears restored Options and Popup through browser HTTP endpoints before CDP attach', async t => {
  const popup = { id: 'popup', type: 'page', url: 'chrome-extension://test/index.html' };
  const restored = { ...options, title: 'header' };
  const api = await devtools(t, [blank, restored, popup, worker]);
  const result = await prepareNativePages(api.endpoint);
  assert.equal(result.installReady, null, 'the fresh-install barrier never depends on a restored renderer');
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
  let elapsed = 0;
  await assert.rejects(prepareNativePages(api.endpoint, { waitForInstall: true, installTitle, timeout: 200,
    now: () => elapsed, sleep: async ms => { elapsed += ms; }, discoverTargets: api.discoverTargets }),
    /install page not observed/);
  assert.equal(elapsed, 200);
  assert.equal(api.requests.length, 2);
  assert.equal(api.requests.every(request => request.url === '/json/list'), true);
  assert.deepEqual([...api.targets.values()], [blank, worker]);
});

test('native startup session restoration preserves all original targets without creating or closing any tab', async t => {
  const active = { id: 'old-active', type: 'page', url: 'http://127.0.0.1:40000/active' };
  const background = { id: 'old-background', type: 'page', url: 'http://localhost:40000/background' };
  const api = await devtools(t, [active, background, worker]);
  const result = await prepareNativePages(api.endpoint, { restoreSession: true });
  assert.deepEqual([...api.targets.values()], [active, background, worker]);
  assert.deepEqual(api.requests, [{ method: 'GET', url: '/json/list' }]);
  assert.deepEqual(result.remainingTargets, [active, background, worker]);
  assert.equal(result.preserved, true);
});

test('fresh install cannot use the startup-restore path to bypass readiness', async t => {
  const api = await devtools(t, [blank, worker]);
  await assert.rejects(prepareNativePages(api.endpoint, { restoreSession: true, waitForInstall: true, installTitle }),
    /already installed profile/);
  assert.deepEqual(api.requests, []);
});

test('native session restoration relaunches the owned profile without a replacement startup URL', () => {
  const args = nativeChromiumArgs({ profile: '/tmp/isolated profile', port: 12345, headless: false, restoreSession: true });
  assert.equal(args.filter(arg => arg === '--restore-last-session').length, 1);
  assert.equal(args.includes('about:blank'), false);
  assert.equal(args.find(arg => arg.startsWith('--user-data-dir=')), '--user-data-dir=/tmp/isolated profile');
});
