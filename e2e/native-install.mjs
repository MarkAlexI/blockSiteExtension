import assert from 'node:assert/strict';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { nativeTabShortcutBackend } from './native-tab-shortcut.mjs';

const execute = promisify(execFile);
const dialogName = '^Select the extension directory\\.?$';
const dialogTitle = /^Select the extension directory\.?$/;

export function persistentStartupArgs(args) {
  // Chromium explicitly skips kCommandLine extensions when loading saved
  // extensions. Both switches load them again, firing a fresh install event.
  return args.filter(arg => !arg.startsWith('--load-extension=') && !arg.startsWith('--disable-extensions-except='));
}

export function requiresNativeInstallReadiness({ installed, args }) {
  // --load-extension performs a new installation on each native process
  // launch, even if this harness has already installed/seeded the profile.
  // Its new onInstalled view must finish native localization before cleanup.
  return !installed || args.some(arg => arg.startsWith('--load-extension='));
}

async function waitForNativeInstallation(page, source, version, timeout, deadline, evidence, { now, sleep }) {
  const expired = () => new Error(`native installed identity did not match within ${timeout}ms`);
  for (;;) {
    const remaining = deadline - now();
    if (remaining <= 0) throw expired();
    let timer;
    let installed;
    try {
      // waitForFunction treats a Promise as truthy before it resolves. Await
      // the real asynchronous WebUI API result before deciding whether to poll.
      const records = await Promise.race([
        page.evaluate(async ({ source, version }) => {
          const records = await chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true });
          return records.map(({ id, path, version, location, state }) => ({ id, path, version, location, state }));
        }, { source, version }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(expired()), remaining); })
      ]);
      evidence.metadata = records;
      installed = records.find(item => item.path === source && item.version === version &&
        item.location === 'UNPACKED' && item.state === 'ENABLED') || null;
    } finally { clearTimeout(timer); }
    if (now() >= deadline) throw expired();
    if (installed) return installed;
    // onInstalled can foreground Options. Timer polling still reads the real
    // background WebUI, with the original deadline and no visibility shim.
    await sleep(Math.min(100, deadline - now()));
  }
}

async function selectNativeDirectory(source, timeout, deadline, desktop, evidence) {
  const { browserPid, env, run, now, sleep } = desktop;
  const command = async (args) => {
    const remaining = deadline - now();
    if (remaining <= 0) {
      const reason = evidence.dialog ? `setup expired during ${evidence.stage}` : 'dialog did not appear';
      throw new Error(`Native extension directory ${reason} within ${timeout}ms`);
    }
    return run('xdotool', args, { timeout: Math.min(3000, remaining), env });
  };
  let window;
  while (!window) {
    let matches;
    try {
      matches = (await command(['search', '--onlyvisible', '--all', '--pid', String(browserPid), '--name', dialogName]))
        .stdout.trim().split(/\s+/).filter(Boolean);
    } catch (error) {
      if (error.code !== 1 || error.killed || error.signal) throw error;
      matches = []; // xdotool search uses exit code 1 when no window exists yet.
    }
    if (matches.length > 1 || matches.some(value => !/^\d+$/.test(value))) {
      throw new Error('Native extension directory dialog identity is ambiguous');
    }
    window = matches[0];
    if (!window) await sleep(Math.max(0, Math.min(100, deadline - now())));
  }
  const owned = async () => {
    if ((await command(['getwindowpid', window])).stdout.trim() !== String(browserPid)) {
      throw new Error('Native extension directory dialog owner mismatch');
    }
    const title = (await command(['getwindowname', window])).stdout.trim();
    if (!dialogTitle.test(title)) throw new Error('Native extension directory dialog title mismatch');
    return title;
  };
  const title = await owned();
  evidence.dialog = { window, title, pid: browserPid, delivery: 'XTEST', typeDelayMs: 12,
    entryAttempts: 0, selectedPath: null, closed: false };
  await command(['windowactivate', '--sync', window]);
  const focused = async () => {
    await owned();
    if ((await command(['getactivewindow'])).stdout.trim() !== window) {
      throw new Error('Native extension directory dialog focus changed before input');
    }
  };
  // Visibility and window focus do not prove GTK's location entry is realized.
  // Read the real X11 PRIMARY selection after Select All. A dropped input burst
  // must never be accepted as a successful folder selection. Only the entry
  // readiness is polled; Load unpacked and its final acceptance happen once.
  evidence.stage = 'focus location entry';
  await focused();
  await command(['key', '--clearmodifiers', 'ctrl+l']);
  for (;;) {
    if (now() >= deadline) throw new Error(`Native extension directory entry did not confirm the complete path within ${timeout}ms`);
    await focused();
    evidence.stage = 'confirm directory entry';
    evidence.dialog.entryAttempts++;
    await command(['key', '--clearmodifiers', 'ctrl+a']);
    await command(['type', '--clearmodifiers', '--delay', '12', source]);
    await command(['key', '--clearmodifiers', 'ctrl+a']);
    await focused();
    let selectedPath = null;
    try {
      const remaining = deadline - now();
      if (remaining <= 0) throw new Error('Native extension directory entry exhausted its setup deadline');
      selectedPath = (await run('xclip', ['-selection', 'primary', '-out'],
        { timeout: Math.min(1000, remaining), env })).stdout;
    } catch (error) {
      // A newly realized GTK entry may not own a PRIMARY selection yet.
      // Backend failures and hung selection owners are genuine setup errors.
      if (error.code !== 1 || error.killed || error.signal ||
          !/target .* not available/i.test(error.stderr || error.message)) throw error;
    }
    evidence.dialog.selectedPath = selectedPath;
    // GTK completes a directory entry with a trailing slash. Preserve the raw
    // readback for diagnosis, but compare only that harmless suffix; prefixes,
    // neighboring folders, whitespace and partial paths must still be rejected.
    if (typeof selectedPath === 'string' && selectedPath.replace(/\/+$/, '') === source.replace(/\/+$/, '')) break;
    await sleep(Math.max(0, Math.min(100, deadline - now())));
  }
  await focused();
  evidence.stage = 'accept extension directory';
  // Activate the verified location entry itself; GTK resolves the typed folder
  // before it reports the selected directory to Chromium.
  await command(['key', '--clearmodifiers', 'Return']);
  evidence.stage = 'wait for directory dialog to close';
  for (;;) {
    if (now() >= deadline) throw new Error(`Native extension directory dialog did not close within ${timeout}ms`);
    let visible;
    try {
      visible = (await command(['search', '--onlyvisible', '--all', '--pid', String(browserPid), '--name', dialogName]))
        .stdout.trim().split(/\s+/).filter(Boolean);
    } catch (error) {
      if (error.code !== 1 || error.killed || error.signal) throw error;
      visible = [];
    }
    if (!visible.includes(window)) {
      if (visible.length) throw new Error('Native extension directory dialog identity changed after Open');
      evidence.dialog.closed = true;
      return evidence.dialog;
    }
    await sleep(Math.max(0, Math.min(100, deadline - now())));
  }
}

// One-time setup in the fixture's empty, owned Linux/X11 profile. Chrome's
// WebUI uses the native folder dialog to register a persistent kUnpacked path.
// Protocol drag supplies renderer data, but not WebContents::GetDropData().
// Temporary CLI/CDP installs, profile edits and runtime intents cannot replace it.
export async function installNativeStartupExtension(browser, source, version, timeout = 15000,
  { browserPid, platform = process.platform, env = process.env, run = execute,
    now = Date.now, sleep = delay } = {}) {
  assert.ok(typeof source === 'string' && path.isAbsolute(source) && !/[\u0000-\u001f\u007f]/.test(source),
    'native installation needs an absolute local extension path without control characters');
  assert.ok(Number.isSafeInteger(browserPid) && browserPid > 0, 'native installation needs an owned Chromium process');
  await nativeTabShortcutBackend({ platform, env, run });
  await run('xclip', ['-version'], { timeout: 3000, env });
  const [context] = browser.contexts();
  assert.ok(context, 'native default context exists');
  const page = await context.newPage();
  await page.goto('chrome://extensions/');
  const toggle = page.locator('extensions-toolbar #devMode');
  await toggle.waitFor({ state: 'visible', timeout });
  if (!await toggle.evaluate(element => element.checked)) await toggle.click();
  assert.equal(await toggle.evaluate(element => element.checked), true, 'native developer mode enabled');
  const deadline = now() + timeout;
  const evidence = { source, expectedVersion: version, timeoutMs: timeout, stage: 'open Load unpacked', metadata: [] };
  try {
    await page.locator('extensions-toolbar #loadUnpacked').click({ timeout });
    evidence.stage = 'find directory dialog';
    const dialog = await selectNativeDirectory(source, timeout, deadline, { browserPid, env, run, now, sleep }, evidence);
    evidence.stage = 'verify installed identity';
    const installed = await waitForNativeInstallation(page, source, version, timeout, deadline, evidence, { now, sleep });
    assert.match(installed.id, /^[a-p]{32}$/);
    return { method: 'chrome://extensions native Load unpacked dialog', id: installed.id,
      path: installed.path, version: installed.version, location: installed.location, state: installed.state, dialog };
  } catch (error) {
    error.nativeInstallation = { ...evidence, elapsedMs: timeout - Math.max(0, deadline - now()) };
    throw error;
  }
}
