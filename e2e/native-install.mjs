import assert from 'node:assert/strict';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export function persistentStartupArgs(args) {
  // Chromium explicitly skips kCommandLine extensions when loading saved
  // extensions. Both switches load them again, firing a fresh install event.
  return args.filter(arg => !arg.startsWith('--load-extension=') && !arg.startsWith('--disable-extensions-except='));
}

async function waitForNativeInstallation(page, source, version, timeout) {
  const deadline = Date.now() + timeout;
  const expired = () => new Error(`native installed identity did not match within ${timeout}ms`);
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw expired();
    let timer;
    let installed;
    try {
      // waitForFunction treats a Promise as truthy before it resolves. Await
      // the real asynchronous WebUI API result before deciding whether to poll.
      installed = await Promise.race([
        page.evaluate(async ({ source, version }) => {
          const records = await chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true });
          return records.find(item => item.path === source && item.version === version &&
            item.location === 'UNPACKED' && item.state === 'ENABLED') || null;
        }, { source, version }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(expired()), remaining); })
      ]);
    } finally { clearTimeout(timer); }
    if (Date.now() >= deadline) throw expired();
    if (installed) return installed;
    // onInstalled can foreground Options. Timer polling still reads the real
    // background WebUI, with the original deadline and no visibility shim.
    await delay(Math.min(100, deadline - Date.now()));
  }
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
    const installed = await waitForNativeInstallation(page, source, version, timeout);
    assert.match(installed.id, /^[a-p]{32}$/);
    return { method: 'chrome://extensions native directory drop', id: installed.id,
      path: installed.path, version: installed.version, location: installed.location, state: installed.state };
  } finally { await control.detach(); }
}
