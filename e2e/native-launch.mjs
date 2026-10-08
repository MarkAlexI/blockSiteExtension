import { spawn } from 'node:child_process';

export function nativeChromiumArgs({ profile, port, headless, args = [] }) {
  return [...args, `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1', '--no-first-run', '--no-default-browser-check',
    '--disable-component-extensions-with-background-pages', '--disable-default-apps',
    '--no-sandbox', '--disable-dev-shm-usage', '--lang=en-US', '--window-size=1280,900',
    ...(headless ? ['--headless=new'] : []), 'about:blank'];
}

// Launch outside Playwright so its default CDP client cannot emulate page focus.
// Keep the fixture's explicit user-data-dir across restart.
export async function launchNativeChromium(config) {
  const child = spawn(config.executablePath, nativeChromiumArgs(config), { stdio: ['ignore', 'ignore', 'pipe'] });
  let failure = null, stderr = '';
  child.on('error', error => { failure = error; });
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16000); });
  const exited = new Promise(resolve => child.once('close', resolve));
  const owner = { async close() {
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
        const response = await fetch(`http://127.0.0.1:${config.port}/json/version`, { signal: AbortSignal.timeout(1000) });
        const version = await response.json();
        if (response.ok && version.webSocketDebuggerUrl) return owner;
      } catch { /* Wait only for startup readiness; never retry a scenario body. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Native Chromium CDP startup timed out: ${stderr}`);
  } catch (error) { await owner.close(); throw error; }
}
