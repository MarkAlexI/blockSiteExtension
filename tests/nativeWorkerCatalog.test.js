import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { requireWorkerCatalogBeforeCleanup } from '../e2e/native-worker-catalog.mjs';

const id = 'a'.repeat(32), endpoint = 'http://127.0.0.1:12345';
const origin = `chrome-extension://${id}`;
const messages = { header: 'Site Blocker', deletebtn: 'Delete', blockingmode_header: 'Blocking',
  daily_limit_usage: '7 / 10 min', '@@extension_id': id, '@@ui_locale': 'en', '@@bidi_dir': 'ltr' };

function fixture({ catalog = messages, mode = 'reply' } = {}) {
  const events = [], commands = [], calls = [], attachments = [];
  const globals = { location: { href: `${origin}/scripts/service_worker.js` }, chrome: {
    runtime: { id, getManifest: () => ({ default_locale: 'en' }) },
    i18n: { getUILanguage: () => 'en-US', getMessage(key) { calls.push(key); return catalog[key] ?? ''; } }
  } };
  class Socket extends EventTarget {
    constructor(url) {
      super(); this.closed = false; events.push(['connect', url]);
      queueMicrotask(() => this.dispatchEvent(new Event('open')));
    }
    send(text) {
      const command = JSON.parse(text); commands.push(command);
      if (mode === 'hang') return;
      if (mode === 'close') { this.close(); return; }
      if (mode === 'error') { this.dispatchEvent(new Event('error')); return; }
      const packet = mode === 'exception' ? { id: 1, result: { exceptionDetails: { text: 'binding unavailable' } } } :
        { id: 1, result: { result: { value: runInNewContext(command.params.expression, globals) } } };
      queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', {
        data: mode === 'invalid-json' ? '{' : JSON.stringify(packet)
      })));
    }
    close() {
      if (this.closed) return; this.closed = true;
      queueMicrotask(() => { events.push(['disconnected']); this.dispatchEvent(new Event('close')); });
    }
  }
  const readiness = { installReady: { id: 'options' }, timeout: mode === 'hang' ? 10 : 1000,
    targets: [{ id: 'options', type: 'page', url: `${origin}/options/options.html` },
      { id: 'worker', type: 'service_worker', url: `${origin}/scripts/service_worker.js`,
        webSocketDebuggerUrl: 'ws://127.0.0.1:12345/devtools/page/worker' }] };
  const testInfo = { async attach(label, attachment) {
    assert.equal(events.at(-1)[0], 'disconnected', 'the worker transport is gone before the gate finishes');
    attachments.push({ label, snapshot: JSON.parse(attachment.body) });
  } };
  return { readiness, Socket, testInfo, events, commands, calls, attachments };
}
const observe = f => requireWorkerCatalogBeforeCleanup(endpoint, f.readiness,
  { Socket: f.Socket, testInfo: f.testInfo });

test('the already running worker supplies its real bindings before cleanup and detaches completely', async () => {
  const f = fixture();
  const snapshot = await observe(f);
  assert.equal(snapshot.predefinedMessages['@@extension_id'], id);
  assert.equal(snapshot.messages.daily_limit_usage, '7 / 10 min');
  assert.deepEqual(f.commands.map(command => command.method), ['Runtime.evaluate']);
  assert.deepEqual(f.calls, Object.keys(messages));
  assert.equal(f.attachments[0].label, 'native-worker-i18n-before-cleanup');
  assert.equal(f.events.at(-1)[0], 'disconnected');
});

test('an existing-profile restart without an install view performs no worker API call', async () => {
  const f = fixture(); f.readiness.installReady = null;
  assert.equal(await observe(f), null);
  assert.deepEqual(f.events, []);
});

test('an empty native bundle fails before cleanup with its unmodified diagnostic snapshot', async () => {
  const f = fixture({ catalog: {} });
  await assert.rejects(observe(f), /Native i18n binding failed/);
  assert.equal(f.attachments.length, 1);
  assert.ok(Object.values(f.attachments[0].snapshot.messages).every(value => value === ''));
  assert.ok(Object.values(f.attachments[0].snapshot.predefinedMessages).every(value => value === ''));
});

for (const count of [0, 2]) {
  test(`missing or duplicate workers cannot pass native catalog readiness (${count})`, async () => {
    const f = fixture(), worker = f.readiness.targets[1];
    f.readiness.targets = [f.readiness.targets[0], ...Array(count).fill(worker)];
    await assert.rejects(observe(f), /one already running worker/);
    assert.deepEqual(f.events, []);
  });
}

for (const url of ['ws://127.0.0.1:9999/devtools/page/worker',
  'ws://127.0.0.1:12345/devtools/browser/worker']) {
  test('native catalog inspection refuses an unowned CDP target ' + url, async () => {
    const f = fixture(); f.readiness.targets[1].webSocketDebuggerUrl = url;
    await assert.rejects(observe(f));
    assert.deepEqual(f.events, []);
  });
}

for (const mode of ['exception', 'invalid-json', 'close', 'error', 'hang']) {
  test('native catalog observation preserves transport failure without retry: ' + mode, async () => {
    const f = fixture({ mode });
    await assert.rejects(observe(f));
    assert.equal(f.commands.length, 1);
    assert.equal(f.attachments.length, 0);
    assert.equal(f.events.at(-1)[0], 'disconnected');
  });
}
