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
  const connections = [], requests = [], events = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });
    response.setHeader('content-type', 'application/json');
    if (request.url === '/json/list') {
      response.end(JSON.stringify([...targets.values()]));
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
  return { owner, browserType, targets, requests, connections, events };
}

test('persistent installation disconnects before HTTP cleanup and attaches a fresh scenario client', async t => {
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
  assert.deepEqual(model.events, ['connect 1', 'install complete', 'disconnect 1', 'create keeper',
    'close target blank', 'close target options', 'prepared evidence', 'connect 2']);
  assert.deepEqual([...model.targets.values()], [worker, { ...blank, id: 'keeper' }]);
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

test('a failed installer disconnect aborts before HTTP cleanup or scenario attach', async t => {
  const model = await nativeModel(t);
  const failure = new Error('Installer disconnect failed');
  await assert.rejects(connectPreparedNativeBrowser(model.browserType, model.owner, {
    install: async installer => { installer.close = async () => { throw failure; }; }
  }), error => error === failure);
  assert.equal(model.connections.length, 1);
  assert.deepEqual(model.requests, []);
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
