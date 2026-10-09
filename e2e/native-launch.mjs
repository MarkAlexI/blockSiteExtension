import { spawn } from 'node:child_process';
import { NATIVE_ACTIVITY_ARGS, createNativeActivityLog } from './native-activity.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const isInstallPage = target => target.type === 'page' &&
  /^chrome-extension:\/\/[^/]+\/options\/options\.html(?:[?#]|$)/.test(target.url);

export async function targetsAt(endpoint) {
  const response = await fetch(`${endpoint}/json/list`, { signal: AbortSignal.timeout(1000) });
  if (!response.ok) throw new Error(`Native Chromium target discovery: HTTP ${response.status}`);
  const targets = await response.json();
  if (!Array.isArray(targets)) throw new Error('Native Chromium target discovery returned no list');
  return targets;
}

// Only called on the browser process/profile owned by this fixture. Clear the
// restored pages before connectOverCDP: a page with an unresponsive renderer
// must not block Playwright's page initialization. Keep one fresh blank tab.
export async function prepareNativePages(endpoint, { waitForInstall = false, timeout = 15_000 } = {}) {
  const deadline = Date.now() + timeout;
  let targets = await targetsAt(endpoint);
  while (waitForInstall && !targets.some(isInstallPage)) {
    if (Date.now() >= deadline) throw new Error(`Native Chromium install page not observed: ${JSON.stringify(targets)}`);
    await pause(100);
    targets = await targetsAt(endpoint);
  }
  // onInstalled creates Options only after initializeExtension and the host
  // permission check finish. is_migrated_to_local alone is an earlier marker.
  const installObserved = targets.some(isInstallPage);
  // A restored about:blank renderer can also be stale. Create the keeper before
  // closing any old target so headed Chrome never loses its last browser window.
  const response = await fetch(`${endpoint}/json/new?about:blank`, {
    method: 'PUT', signal: AbortSignal.timeout(1000)
  });
  if (!response.ok) throw new Error(`Native Chromium blank page creation: HTTP ${response.status}`);
  const keeper = await response.json();
  if (!keeper.id || keeper.type !== 'page' || keeper.url !== 'about:blank') {
    throw new Error(`Native Chromium unexpected blank page: ${JSON.stringify(keeper)}`);
  }
  targets = await targetsAt(endpoint);
  const closedTargets = [];
  do {
    for (const target of targets.filter(target => target.type === 'page' && target.id !== keeper.id)) {
      const response = await fetch(`${endpoint}/json/close/${encodeURIComponent(target.id)}`, {
        signal: AbortSignal.timeout(1000)
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`Native Chromium page cleanup: HTTP ${response.status} (${target.url})`);
      }
      closedTargets.push({ id: target.id, url: target.url });
    }
    targets = await targetsAt(endpoint);
    if (!targets.some(target => target.type === 'page' && target.id !== keeper.id)) break;
    if (Date.now() >= deadline) throw new Error(`Native Chromium page cleanup timed out: ${JSON.stringify(targets)}`);
    await pause(100);
  } while (true);
  if (!targets.some(target => target.type === 'page' && target.id === keeper.id && target.url === 'about:blank')) {
    throw new Error('Native Chromium page cleanup lost the last blank browser tab');
  }
  return { installObserved, keeper, closedTargets, remainingTargets: targets };
}

export function nativeChromiumArgs({ profile, port, headless, args = [], activityLog = false }) {
  return [...args, `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1', '--no-first-run', '--no-default-browser-check',
    '--disable-component-extensions-with-background-pages', '--disable-default-apps',
    '--no-sandbox', '--disable-dev-shm-usage', '--lang=en-US', '--window-size=1280,900',
    ...(activityLog ? NATIVE_ACTIVITY_ARGS : []), ...(headless ? ['--headless=new'] : []), 'about:blank'];
}

// Launch outside Playwright so its default CDP client cannot emulate page focus.
// Keep the fixture's explicit user-data-dir across restart.
export async function launchNativeChromium(config) {
  const activity = config.activityLog ? createNativeActivityLog() : null;
  const child = spawn(config.executablePath, nativeChromiumArgs(config), {
    stdio: ['ignore', 'ignore', 'pipe'], env: config.env
  });
  let failure = null, stderr = '';
  child.on('error', error => { failure = error; });
  child.stderr.on('data', chunk => { activity?.push(chunk); stderr = (stderr + chunk).slice(-16000); });
  child.stderr.once('end', () => activity?.finish());
  const exited = new Promise(resolve => child.once('close', resolve));
  const endpoint = `http://127.0.0.1:${config.port}`;
  const owner = { endpoint, activity, async diagnostics() {
    let targets;
    try { targets = await targetsAt(endpoint); }
    catch (error) { targets = { error: String(error) }; }
    return { pid: child.pid, exitCode: child.exitCode, signalCode: child.signalCode,
      stderr, webSocketDebuggerUrl: owner.webSocketDebuggerUrl, targets };
  }, async close() {
    if (child.exitCode !== null || child.signalCode !== null || failure) { await exited; return; }
    child.kill('SIGTERM');
    let timer;
    try { await Promise.race([exited, new Promise(resolve => { timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000); })]); }
    finally { clearTimeout(timer); }
    await exited;
  } };
  try {
    const until = Date.now() + 15000;
    while (Date.now() < until) {
      if (failure) throw failure;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Native Chromium exited before CDP: ${stderr}`);
      try {
        const response = await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(1000) });
        const version = await response.json();
        if (response.ok && version.webSocketDebuggerUrl) {
          owner.webSocketDebuggerUrl = version.webSocketDebuggerUrl;
          return owner;
        }
      } catch { /* Wait only for startup readiness; never retry a scenario body. */ }
      await pause(100);
    }
    throw new Error(`Native Chromium CDP startup timed out: ${stderr}`);
  } catch (error) { await owner.close(); throw error; }
}
