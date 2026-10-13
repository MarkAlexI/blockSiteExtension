import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { installNativeStartupExtension, persistentStartupArgs } from '../e2e/native-install.mjs';

const source = '/owned/test-extension', id = 'a'.repeat(32), version = '5.3.26';
function fixture({ dragError = null, installedVersion = version, installedState = 'ENABLED' } = {}) {
  const calls = [], toggle = { checked: false }, records = [];
  const sandbox = { innerWidth: 1280, innerHeight: 900,
    chrome: { developerPrivate: { getExtensionsInfo: async () => records } } };
  const evaluate = (func, arg) => runInNewContext(`(${func.toString()})(arg)`, { ...sandbox, arg });
  const control = { async send(method, args) {
    calls.push({ method, args });
    if (dragError) throw dragError;
    if (args.type === 'drop') records.push({ id, version: installedVersion, path: source, location: 'UNPACKED', state: installedState });
  }, async detach() { calls.push({ method: 'detach' }); } };
  const page = { async goto(url) { calls.push({ method: 'goto', url }); },
    locator(selector) { assert.equal(selector, 'extensions-toolbar #devMode'); return {
      async waitFor() {}, async evaluate(func) { return func(toggle); }, async click() { toggle.checked = true; } }; },
    async evaluate(func, arg) { return evaluate(func, arg); },
    async waitForFunction(func, arg, options) {
      assert.equal(options.timeout, 15000);
      const value = await evaluate(func, arg);
      if (!value) throw new Error('native installed identity did not match');
      return { async jsonValue() { return value; } };
    } };
  const context = { async newPage() { return page; }, async newCDPSession(candidate) { assert.equal(candidate, page); return control; } };
  return { browser: { contexts: () => [context] }, calls, toggle };
}

test('startup launches remove both temporary command-line installation switches and retain native routing', () => {
  const args = ['--load-extension=/owned/test-extension', '--disable-extensions-except=/owned/test-extension',
    '--host-resolver-rules=MAP *.bd-e2e.test 127.0.0.1', '--disable-gpu'];
  assert.deepEqual(persistentStartupArgs(args), args.slice(2));
  assert.equal(args.length, 4, 'other native fixtures retain their original arguments');
});

test('persistent native setup uses the actual extensions directory-drop installer and checks identity', async () => {
  const f = fixture();
  assert.deepEqual(await installNativeStartupExtension(f.browser, source, version),
    { method: 'chrome://extensions native directory drop', id, path: source, version, location: 'UNPACKED', state: 'ENABLED' });
  assert.equal(f.toggle.checked, true);
  assert.equal(f.calls[0].url, 'chrome://extensions/');
  const drags = f.calls.filter(call => call.method === 'Input.dispatchDragEvent');
  assert.deepEqual(drags.map(call => call.args.type), ['dragEnter', 'dragOver', 'drop']);
  for (const { args } of drags) assert.deepEqual(JSON.parse(JSON.stringify(args.data)),
    { items: [], files: [source], dragOperationsMask: 1 });
  assert.equal(f.calls.some(call => call.method === 'Extensions.loadUnpacked'), false, 'CDP temporary installs cannot substitute for the browser UI installer');
  assert.equal(f.calls.at(-1).method, 'detach');
});

test('native installation fails on a rejected directory drop, without falling back to a temporary extension', async () => {
  const f = fixture({ dragError: new Error('native drag rejected') });
  await assert.rejects(installNativeStartupExtension(f.browser, source, version), /native drag rejected/);
  assert.equal(f.calls.filter(call => call.method === 'Input.dispatchDragEvent').length, 1);
  assert.equal(f.calls.at(-1).method, 'detach');
});

for (const options of [{ installedVersion: '0.0.1' }, { installedState: 'DISABLED' }]) {
  test(`native installation rejects unexpected installed metadata ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    await assert.rejects(installNativeStartupExtension(f.browser, source, version), /identity did not match/);
    assert.equal(f.calls.at(-1).method, 'detach');
  });
}

test('native installer refuses a relative path before touching the browser', async () => {
  await assert.rejects(installNativeStartupExtension({ contexts() { throw new Error('browser was touched'); } }, './extension', version), /absolute local extension path/);
});
