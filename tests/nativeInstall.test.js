import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { installNativeStartupExtension, persistentStartupArgs } from '../e2e/native-install.mjs';

const source = '/owned/test-extension with spaces', id = 'a'.repeat(32), version = '5.3.27';
const pid = 741, dialog = '123', title = 'Select the extension directory';
function fixture({ installedVersion = version, installedState = 'ENABLED', installAfterReads = 0,
  stalledRead = false, missingDialog = false, remainsOpen = false, replacementDialog = false, windowPid = pid, changedFocus = false,
  dialogTitle = title, ambiguousDialog = false, xtest = true, acceptError = null, searchError = null } = {}) {
  const calls = [], toggle = { checked: false }, records = [];
  let reads = 0, dialogOpened = false, accepted = false, typed = null, activeReads = 0;
  const sandbox = { chrome: { developerPrivate: { getExtensionsInfo: async () => {
    reads++; calls.push({ method: 'getExtensionsInfo' });
    if (stalledRead) return new Promise(() => {});
    return reads <= installAfterReads ? [] : records;
  } } } };
  const page = {
    async goto(url) { calls.push({ method: 'goto', url }); },
    locator(selector) {
      if (selector === 'extensions-toolbar #devMode') return {
        async waitFor() {}, async evaluate(func) { return func(toggle); }, async click() { toggle.checked = true; }
      };
      assert.equal(selector, 'extensions-toolbar #loadUnpacked');
      return { async click() { calls.push({ method: 'loadUnpackedClick' }); dialogOpened = true; } };
    },
    async evaluate(func, arg) {
      return runInNewContext('(' + func.toString() + ')(arg)', { ...sandbox, arg });
    }
  };
  const context = { async newPage() { return page; }, async newCDPSession() {
    // CI stderr proves a protocol drag never registered native drop data.
    calls.push({ method: 'newCDPSession' });
    return { async send() { throw new Error('No current drop data.'); }, async detach() {} };
  } };
  const run = async (file, args, options) => {
    calls.push({ file, args, timeout: options.timeout });
    if (file === 'xdpyinfo') return { stdout: xtest ? 'XTEST' : 'OTHER' };
    assert.equal(file, 'xdotool');
    if (args[0] === 'version') return { stdout: 'xdotool version fixture' };
    if (args[0] === 'search') {
      if (searchError) throw searchError;
      assert.deepEqual(args, ['search', '--onlyvisible', '--all', '--pid', String(pid), '--name', '^Select the extension directory\\.?$']);
      if (!dialogOpened || missingDialog) throw Object.assign(new Error('no matching windows'), { code: 1 });
      if (accepted && !remainsOpen) {
        if (replacementDialog) return { stdout: '456\n' };
        throw Object.assign(new Error('dialog closed'), { code: 1 });
      }
      return { stdout: ambiguousDialog ? '123\n456\n' : dialog + '\n' };
    }
    if (args[0] === 'getwindowpid') return { stdout: String(windowPid) };
    if (args[0] === 'getwindowname') return { stdout: dialogTitle };
    if (args[0] === 'windowactivate') return { stdout: '' };
    if (args[0] === 'getactivewindow') return { stdout: changedFocus && ++activeReads > 1 ? '999' : dialog };
    if (args[0] === 'type') { assert.equal(args[args.indexOf('--delay') + 1], '12'); typed = args.at(-1); return { stdout: '' }; }
    if (args[0] === 'key') {
      if (args.at(-1) === 'alt+o') {
        if (acceptError) throw acceptError;
        accepted = true;
        assert.equal(typed, source);
        records.push({ id, version: installedVersion, path: source, location: 'UNPACKED', state: installedState });
      }
      return { stdout: '' };
    }
    throw new Error('Unexpected desktop command');
  };
  return { browser: { contexts: () => [context] }, calls, toggle,
    desktop: { browserPid: pid, platform: 'linux', env: { DISPLAY: ':45' }, run } };
}
const install = (f, timeout = 15000) => installNativeStartupExtension(f.browser, source, version, timeout, f.desktop);
const inputCalls = f => f.calls.filter(call => ['type', 'key'].includes(call.args?.[0]));

test('startup launches remove both temporary command-line installation switches and retain native routing', () => {
  const args = ['--load-extension=/owned/test-extension', '--disable-extensions-except=/owned/test-extension',
    '--host-resolver-rules=MAP *.bd-e2e.test 127.0.0.1', '--disable-gpu'];
  assert.deepEqual(persistentStartupArgs(args), args.slice(2));
  assert.equal(args.length, 4, 'other native fixtures retain their original arguments');
});
test('persistent setup selects the real owned Load unpacked folder dialog without protocol drag', async () => {
  const f = fixture(), result = await install(f);
  assert.equal(result.id, id); assert.equal(result.path, source);
  assert.equal(result.version, version); assert.equal(result.location, 'UNPACKED'); assert.equal(result.state, 'ENABLED');
  assert.equal(result.method, 'chrome://extensions native Load unpacked dialog');
  assert.deepEqual(result.dialog, { window: dialog, title, pid, delivery: 'XTEST', typeDelayMs: 12, closed: true });
  assert.equal(f.toggle.checked, true);
  assert.equal(f.calls.filter(call => call.method === 'loadUnpackedClick').length, 1);
  assert.equal(f.calls.some(call => call.method === 'newCDPSession'), false);
  assert.deepEqual(inputCalls(f).map(call => call.args), [
    ['key', '--clearmodifiers', 'ctrl+l', 'ctrl+a'],
    ['type', '--clearmodifiers', '--delay', '12', source],
    ['key', '--clearmodifiers', 'alt+o']
  ]);
});
for (const input of [{ windowPid: 999 }, { dialogTitle: 'unrelated dialog' }, { ambiguousDialog: true }]) {
  test('native installation rejects a dialog it cannot uniquely own ' + JSON.stringify(input), async () => {
    const f = fixture(input);
    await assert.rejects(install(f), /dialog (owner|title|identity)/);
    assert.equal(inputCalls(f).length, 0);
  });
}
test('native folder selection stops before typing when desktop focus changes', async () => {
  const f = fixture({ changedFocus: true });
  await assert.rejects(install(f), /focus changed/);
  assert.equal(inputCalls(f).length, 1);
  assert.deepEqual(inputCalls(f)[0].args, ['key', '--clearmodifiers', 'ctrl+l', 'ctrl+a']);
});
test('a rejected native Open action is reported without a second install or input attempt', async () => {
  const f = fixture({ acceptError: new Error('native Open rejected') });
  await assert.rejects(install(f), /native Open rejected/);
  assert.equal(f.calls.filter(call => call.method === 'loadUnpackedClick').length, 1);
  assert.equal(inputCalls(f).filter(call => call.args.at(-1) === 'alt+o').length, 1);
});
test('a missing dialog reaches the original deadline without sending keyboard input', async () => {
  const f = fixture({ missingDialog: true });
  await assert.rejects(install(f, 5), /directory dialog did not appear/);
  assert.equal(inputCalls(f).length, 0);
  assert.ok(f.calls.filter(call => call.file).every(call => call.timeout > 0 && call.timeout <= 3000));
});
test('a failed dialog backend is not treated as an absent window or retried', async () => {
  const f = fixture({ searchError: Object.assign(new Error('desktop unavailable'), { code: 'ENOENT' }) });
  await assert.rejects(install(f), /desktop unavailable/);
  assert.equal(f.calls.filter(call => call.args?.[0] === 'search').length, 1);
  assert.equal(inputCalls(f).length, 0);
});
for (const options of [{ installedVersion: '0.0.1' }, { installedState: 'DISABLED' }]) {
  test('native installation retains strict installed metadata checks ' + JSON.stringify(options), async () => {
    await assert.rejects(install(fixture(options), 25), error => {
      assert.match(error.message, /identity did not match/);
      assert.equal(error.nativeInstallation.stage, 'verify installed identity');
      assert.equal(error.nativeInstallation.metadata[0].version, options.installedVersion || version);
      assert.equal(error.nativeInstallation.metadata[0].state, options.installedState || 'ENABLED');
      assert.equal(error.nativeInstallation.dialog.closed, true);
      return true;
    });
  });
}
test('native installation waits for metadata after initially empty asynchronous reads without reopening the dialog', async () => {
  const f = fixture({ installAfterReads: 2 });
  assert.equal((await install(f, 1000)).id, id);
  assert.equal(f.calls.filter(call => call.method === 'getExtensionsInfo').length, 3);
  assert.equal(f.calls.filter(call => call.method === 'loadUnpackedClick').length, 1);
  assert.equal(inputCalls(f).length, 3);
});
test('an Open action that leaves the native dialog visible fails before metadata polling and records its stage', async () => {
  const f = fixture({ remainsOpen: true });
  await assert.rejects(install(f, 25), error => {
    assert.match(error.message, /dialog did not close/);
    assert.equal(error.nativeInstallation.stage, 'wait for directory dialog to close');
    assert.equal(error.nativeInstallation.dialog.closed, false);
    return true;
  });
  assert.equal(f.calls.filter(call => call.method === 'getExtensionsInfo').length, 0);
  assert.equal(f.calls.filter(call => call.method === 'loadUnpackedClick').length, 1);
  assert.equal(inputCalls(f).filter(call => call.args.at(-1) === 'alt+o').length, 1);
});
test('a different native dialog after Open cannot be mistaken for successful closure', async () => {
  await assert.rejects(install(fixture({ replacementDialog: true })), /identity changed after Open/);
});
test('native metadata read cannot outlive the original bounded installation timeout', async () => {
  const f = fixture({ stalledRead: true });
  await assert.rejects(install(f, 25), /identity did not match/);
  assert.equal(f.calls.filter(call => call.method === 'getExtensionsInfo').length, 1);
});
test('native installation fails before opening a page when XTEST, DISPLAY or an owned process is unavailable', async () => {
  for (const overrides of [{ platform: 'win32' }, { env: {} }, { browserPid: undefined }, { browserPid: -1 }]) {
    const f = fixture();
    await assert.rejects(installNativeStartupExtension(f.browser, source, version, 15000,
      { ...f.desktop, ...overrides }), /Linux\/X11|owned Chromium process/);
    assert.equal(f.calls.some(call => call.method === 'goto'), false);
    assert.equal(inputCalls(f).length, 0);
  }
  const f = fixture({ xtest: false });
  await assert.rejects(install(f), /XTEST/);
  assert.equal(f.calls.some(call => call.method === 'goto'), false);
});
test('native installer refuses relative or control-character paths before touching the browser', async () => {
  for (const input of ['./extension', '/owned/extension\nother', '/owned/extension\u0000']) {
    const f = fixture();
    await assert.rejects(installNativeStartupExtension(f.browser, input, version, 15000, f.desktop), /absolute local extension path/);
    assert.deepEqual(f.calls, []);
  }
});
