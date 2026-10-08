import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { extensionWorker } from '../e2e/extension-worker.mjs';

const manifest = { version: '5.3.20', background: { service_worker: 'scripts/service_worker.js' } };
const id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const target = (chrome = { runtime: { id, getManifest: () => manifest }, storage: { local: { get() {} }, sync: { set() {} } } }) => ({
  url: () => `chrome-extension://${id}/scripts/service_worker.js`,
  async evaluate(fn) { return vm.runInNewContext(`(${fn})()`, { chrome }); }
});

test('extension setup ignores an unrelated first worker without storage APIs', async () => {
  const unrelated = { url: () => 'chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/background.js',
    evaluate() { assert.fail('must not evaluate unrelated extension'); } };
  const worker = target();
  const result = await extensionWorker({ serviceWorkers: () => [unrelated, worker] }, manifest);
  assert.equal(result.worker, worker); assert.equal(result.identity.id, id);
});

test('extension setup waits for the manifest worker, excluding web and component workers', async () => {
  const worker = target();
  const unrelated = { url: () => 'https://fixture.test/scripts/service_worker.js' };
  const result = await extensionWorker({ serviceWorkers: () => [unrelated],
    async waitForEvent(event, options) {
      assert.equal(event, 'serviceworker'); assert.equal(options.predicate(unrelated), false);
      assert.equal(options.predicate(worker), true); return worker;
    } }, manifest);
  assert.equal(result.worker, worker);
});

test('extension setup diagnoses missing APIs or a mismatched version before migration', async () => {
  for (const chrome of [{ runtime: { id, getManifest: () => manifest } },
    { runtime: { id, getManifest: () => ({ ...manifest, version: '0.0.0' }) }, storage: { local: { get() {} }, sync: { set() {} } } }]) {
    await assert.rejects(extensionWorker({ serviceWorkers: () => [target(chrome)] }, manifest), /unexpected worker bindings/);
  }
});

test('extension setup timeout reports observed workers and preserves its cause', async () => {
  const cause = new Error('setup timeout');
  await assert.rejects(extensionWorker({ serviceWorkers: () => [{ url: () => 'chrome://component/worker.js' }],
    async waitForEvent() { throw cause; } }, manifest), error => {
    assert.match(error.message, /not found; observed workers: chrome:\/\/component\/worker.js/);
    assert.equal(error.cause, cause); return true;
  });
});
