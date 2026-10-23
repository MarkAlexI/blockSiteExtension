import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { connectPreparedNativeBrowser } from '../e2e/native-connection.mjs';

const blank = { id: 'blank', type: 'page', url: 'about:blank' };
const options = { id: 'options', type: 'page', url: 'chrome-extension://test/options/options.html', title: 'Site Blocker' };
const worker = { id: 'worker', type: 'service_worker', url: 'chrome-extension://test/scripts/service_worker.js' };

async function nativeModel(t, initial = [blank, options, worker]) {
  const targets = new Map(initial.map(target => [target.id, target]));
  const connections = [], requests = [], events = [], observations = [];
  let reads = 0, resolvePolled;
  const polled = new Promise(resolve => { resolvePolled = resolve; });
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });
    response.setHeader('content-type', 'application/json');
    if (request.url === '/json/list') {
      observations.push({ connected: connections.some(browser => browser.isConnected()),
        targets: [...targets.values()] });
      response.end(JSON.stringify([...targets.values()]));
      if (++reads === 2) resolvePolled();
    } else if (connections.some(browser => browser.isConnected())) {
      // A protocol-model guard: page cleanup belongs between CDP clients.
      // It does not assert that native Chrome always fails with an attached one.
      response.writeHead(409); response.end('CDP client still attached during target mutation');
    } else if (request.url === '/json/new?about:blank' && request.method === 'PUT') {
      const keeper = { ...blank, id: 'keeper' };
      targets.set(keeper.id, keeper);
      events.push('create keeper');
      response.end(JSON.stringify(keeper));
    } else if (request.url.startsWith('/json/close/')) {
      const id = decodeURIComponent(request.url.slice('/json/close/'.length));
      targets.delete(id); events.push(`close target ${id}`);
      response.end('Target is closing');
    } else {
      response.writeHead(500); response.end('Unexpected command');
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    const closed = once(server, 'close');
    server.close(); server.closeAllConnections();
    await closed;
  });
  const owner = { endpoint: `http://127.0.0.1:${server.address().port}`,
    webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/browser/owned-process' };
  const browserType = { async connectOverCDP(url, config) {
    assert.equal(url, owner.webSocketDebuggerUrl, 'all clients attach to the same owned process');
    assert.deepEqual(config, { noDefaults: true, isLocal: true });
    const number = connections.length + 1;
    let connected = true;
    const browser = { isConnected: () => connected, async close() {
      connected = false; events.push(`disconnect ${number}`);
    } };
    connections.push(browser); events.push(`connect ${number}`);
    return browser;
  } };
  return { owner, browserType, targets, requests, connections, events, observations, polled };
}

test('persistent installation observes localized readiness before disconnect, then cleans up and attaches a fresh client', async t => {
  const model = await nativeModel(t);
  const browser = await connectPreparedNativeBrowser(model.browserType, model.owner, {
    install: async installer => {
      assert.equal(installer, model.connections[0]);
      assert.equal(installer.isConnected(), true);
      assert.deepEqual([...model.targets.values()], [blank, options, worker]);
      model.events.push('install complete');
    },
    prepareOptions: { waitForInstall: true, installTitle: options.title },
    onPrepared: prepared => {
      assert.equal(prepared.installReady.id, options.id);
      assert.equal(model.connections.every(client => !client.isConnected()), true);
      model.events.push('prepared evidence');
    }
  });
  assert.equal(browser, model.connections[1]);
  assert.equal(browser.isConnected(), true);
  assert.equal(model.observations[0].connected, true,
    'native readiness is observed while the installer can still handle newly attached targets');
  assert.deepEqual(model.events, ['connect 1', 'install complete', 'disconnect 1', 'create keeper',
    'close target blank', 'close target options', 'prepared evidence', 'connect 2']);
  assert.deepEqual([...model.targets.values()], [worker, { ...blank, id: 'keeper' }]);
});

for (const pendingTitle of [null, 'Options page for BlockDistraction']) {
  test(`persistent metadata cannot disconnect the installer before native Options readiness (${pendingTitle})`, async t => {
    const initial = [blank, worker];
    if (pendingTitle) initial.push({ ...options, title: pendingTitle });
    const model = await nativeModel(t, initial);
    let installs = 0;
    const preparing = connectPreparedNativeBrowser(model.browserType, model.owner, {
      install: async () => { installs++; },
      prepareOptions: { waitForInstall: true, installTitle: options.title, timeout: 2000 }
    });
    await model.polled;
    const connectedWhilePending = model.connections[0].isConnected();
    const pendingRequests = model.requests.slice();
    model.targets.set(options.id, options);
    const browser = await preparing;
    assert.equal(connectedWhilePending, true, 'metadata alone does not release the installer');
    assert.equal(pendingRequests.every(request => request.url === '/json/list'), true,
      'pending readiness only observes targets, without cleanup or a second install');
    assert.equal(installs, 1);
    assert.equal(model.connections.length, 2);
    assert.equal(browser, model.connections[1]);
    assert.equal(model.connections[0].isConnected(), false);
    assert.deepEqual([...model.targets.values()], [worker, { ...blank, id: 'keeper' }]);
  });
}

test('a missing persistent install page fails with one install and one disconnect, without cleanup or scenario attach', async t => {
  const model = await nativeModel(t, [blank, worker]);
  let installs = 0;
  await assert.rejects(connectPreparedNativeBrowser(model.browserType, model.owner, {
    install: async () => { installs++; },
    prepareOptions: { waitForInstall: true, installTitle: options.title, timeout: 100 }
  }), /install page not observed/);
  assert.equal(installs, 1);
  assert.equal(model.connections.length, 1);
  assert.equal(model.observations.every(observation => observation.connected), true);
  assert.equal(model.connections[0].isConnected(), false);
  assert.equal(model.events.filter(event => event === 'disconnect 1').length, 1);
  assert.equal(model.requests.every(request => request.url === '/json/list'), true);
  assert.deepEqual([...model.targets.values()], [blank, worker]);
});

for (const cleanupFails of [false, true]) {
  test(`persistent localization failure is preserved before cleanup (disconnect failure: ${cleanupFails})`, async t => {
    const untranslated = { ...options, title: 'header' };
    const model = await nativeModel(t, [blank, worker, untranslated]);
    let disconnects = 0;
    await assert.rejects(connectPreparedNativeBrowser(model.browserType, model.owner, {
      install: async installer => {
        const close = installer.close;
        installer.close = async () => {
          disconnects++;
          if (cleanupFails) throw new Error('Installer disconnect failed');
          await close();
        };
      },
      prepareOptions: { waitForInstall: true, installTitle: options.title }
    }), /install localization failed before page cleanup/);
    assert.equal(disconnects, 1);
    assert.equal(model.connections.length, 1);
    assert.equal(model.observations[0].connected, true);
    assert.deepEqual(model.requests, [{ method: 'GET', url: '/json/list' }]);
    assert.deepEqual([...model.targets.values()], [blank, worker, untranslated]);
  });
}

test('persistent setup waits for installer disconnect to finish before any target mutation', async t => {
  const model = await nativeModel(t);
  let release, disconnecting;
  const atDisconnect = new Promise(resolve => { disconnecting = resolve; });
  const released = new Promise(resolve => { release = resolve; });
  const preparing = connectPreparedNativeBrowser(model.browserType, model.owner, {
    install: async installer => {
      const close = installer.close;
      installer.close = async () => {
        disconnecting();
        await released;
        await close();
      };
    },
    prepareOptions: { waitForInstall: true, installTitle: options.title }
  });
  await atDisconnect;
  const observations = model.observations.slice();
  const pendingRequests = model.requests.slice();
  release();
  await preparing;
  assert.equal(observations.length, 1, 'localized readiness precedes the disconnect attempt');
  assert.equal(observations[0].connected, true);
  assert.deepEqual(pendingRequests, [{ method: 'GET', url: '/json/list' }]);
  assert.equal(model.events.filter(event => event === 'disconnect 1').length, 1);
});

test('native restoration observes original tabs without installation, target mutation or a second connection', async t => {
  const original = { id: 'original-document', type: 'page', url: 'http://startup.bd-e2e.test/original' };
  const model = await nativeModel(t, [original, worker]);
  let evidence;
  const browser = await connectPreparedNativeBrowser(model.browserType, model.owner, {
    prepareOptions: { restoreSession: true }, onPrepared: prepared => { evidence = prepared; }
  });
  assert.equal(browser, model.connections[0]);
  assert.equal(evidence.preserved, true);
  assert.deepEqual([...model.targets.values()], [original, worker]);
  assert.deepEqual(model.requests, [{ method: 'GET', url: '/json/list' }]);
  assert.deepEqual(model.events, ['connect 1']);
});

test('ordinary native setup still waits for installation readiness before its only CDP connection', async t => {
  const model = await nativeModel(t);
  await connectPreparedNativeBrowser(model.browserType, model.owner, {
    prepareOptions: { waitForInstall: true, installTitle: options.title }
  });
  assert.equal(model.connections.length, 1);
  assert.equal(model.events.at(-1), 'connect 1');
  assert.deepEqual([...model.targets.values()], [worker, { ...blank, id: 'keeper' }]);
});

for (const cleanupFails of [false, true]) {
  test(`installation failure is preserved without cleanup, retry or scenario attach (disconnect failure: ${cleanupFails})`, async t => {
    const model = await nativeModel(t);
    const failure = new Error('Native folder dialog failed');
    await assert.rejects(connectPreparedNativeBrowser(model.browserType, model.owner, {
      install: async installer => {
        if (cleanupFails) installer.close = async () => { throw new Error('Transport already closed'); };
        throw failure;
      }
    }), error => error === failure);
    assert.equal(model.connections.length, 1);
    assert.deepEqual(model.requests, []);
    assert.deepEqual([...model.targets.values()], [blank, options, worker]);
    if (!cleanupFails) assert.equal(model.connections[0].isConnected(), false);
  });
}

test('a failed installer disconnect aborts before target mutation or scenario attach', async t => {
  const model = await nativeModel(t);
  const failure = new Error('Installer disconnect failed');
  await assert.rejects(connectPreparedNativeBrowser(model.browserType, model.owner, {
    install: async installer => { installer.close = async () => { throw failure; }; }
  }), error => error === failure);
  assert.equal(model.connections.length, 1);
  assert.deepEqual(model.requests, [{ method: 'GET', url: '/json/list' }]);
  assert.deepEqual([...model.targets.values()], [blank, options, worker]);
});

test('failed native localization still stops setup before any scenario connection', async t => {
  const model = await nativeModel(t, [blank, { ...options, title: 'header' }, worker]);
  await assert.rejects(connectPreparedNativeBrowser(model.browserType, model.owner, {
    prepareOptions: { waitForInstall: true, installTitle: options.title }
  }), /install localization failed before page cleanup/);
  assert.deepEqual(model.connections, []);
  assert.deepEqual(model.requests, [{ method: 'GET', url: '/json/list' }]);
  assert.equal(model.targets.size, 3);
});

test('restoration refuses an installer before connecting or touching original pages', async t => {
  const model = await nativeModel(t);
  let installs = 0;
  await assert.rejects(connectPreparedNativeBrowser(model.browserType, model.owner, {
    install: async () => { installs++; }, prepareOptions: { restoreSession: true }
  }), /Session restoration must not install or clear native pages/);
  assert.equal(installs, 0);
  assert.deepEqual(model.connections, []);
  assert.deepEqual(model.requests, []);
});
