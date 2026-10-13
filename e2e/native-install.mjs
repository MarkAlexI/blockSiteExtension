import assert from 'node:assert/strict';
import path from 'node:path';

export function persistentStartupArgs(args) {
  // Chromium explicitly skips kCommandLine extensions when loading saved
  // extensions. Both switches load them again, firing a fresh install event.
  return args.filter(arg => !arg.startsWith('--load-extension=') && !arg.startsWith('--disable-extensions-except='));
}

// One-time setup in the fixture's empty, owned profile. Use the actual
// chrome://extensions directory-drop installer (kUnpacked). CDP's separate
// Extensions.loadUnpacked is also temporary and is cleared at browser exit.
// No runtime bytes, Preferences, storage APIs or lifecycle events are edited.
export async function installNativeStartupExtension(browser, source, version, timeout = 15000) {
  assert.ok(path.isAbsolute(source), 'native installation needs an absolute local extension path');
  const [context] = browser.contexts();
  assert.ok(context, 'native default context exists');
  const page = await context.newPage();
  await page.goto('chrome://extensions/');
  const toggle = page.locator('extensions-toolbar #devMode');
  await toggle.waitFor({ state: 'visible', timeout });
  if (!await toggle.evaluate(element => element.checked)) await toggle.click();
  assert.equal(await toggle.evaluate(element => element.checked), true, 'native developer mode enabled');
  const control = await context.newCDPSession(page);
  try {
    const point = await page.evaluate(() => ({ x: Math.min(200, innerWidth / 2), y: Math.min(200, innerHeight / 2) }));
    const data = { items: [], files: [source], dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver', 'drop']) {
      await control.send('Input.dispatchDragEvent', { type, ...point, data });
    }
    const ready = await page.waitForFunction(async ({ source, version }) => {
      const installed = await chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true });
      return installed.find(item => item.path === source && item.version === version &&
        item.location === 'UNPACKED' && item.state === 'ENABLED') || false;
    // onInstalled can foreground Options before this observer runs. Timer
    // polling observes the real background WebUI without emulating focus.
    }, { source, version }, { timeout, polling: 100 });
    const installed = await ready.jsonValue();
    assert.match(installed.id, /^[a-p]{32}$/);
    return { method: 'chrome://extensions native directory drop', id: installed.id,
      path: installed.path, version: installed.version, location: installed.location, state: installed.state };
  } finally { await control.detach(); }
}
