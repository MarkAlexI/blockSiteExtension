import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';

const execute = promisify(execFile);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const noop = async () => {};

const windowId = text => {
  const match = /window id # (0x[0-9a-f]+)/i.exec(text);
  return match && BigInt(match[1]) !== 0n ? BigInt(match[1]).toString(16) : null;
};

// EWMH requires a live self-referencing check window. A leftover root property
// alone is not evidence that any manager can handle _NET_ACTIVE_WINDOW.
export async function readNativeWindowManager({ run = execute, env = process.env } = {}) {
  try {
    const options = { timeout:1000, env };
    const root = (await run('xprop',['-root','_NET_SUPPORTING_WM_CHECK'],options)).stdout;
    const id = windowId(root);
    if (!id) return null;
    const child = (await run('xprop',['-id','0x'+id,'_NET_SUPPORTING_WM_CHECK'],options)).stdout;
    if (windowId(child) !== id) return null;
    const supported = (await run('xprop',['-root','_NET_SUPPORTED'],options)).stdout;
    if (!/\b_NET_ACTIVE_WINDOW\b/.test(supported)) return null;
    return root.trim();
  } catch (error) {
    if (error.code === 1 && !error.killed && !error.signal) return null; // stale/deleted X window
    throw error;
  }
}

// Linux/Xvfb native windows and action panels needs normal desktop window/focus handling.
// The runner calls this for native desktop scenarios, before launch.
export async function startNativeWindowManager(output, { platform = process.platform, env = process.env,
  run = execute, spawnProcess = spawn } = {}) {
  if (platform !== 'linux' || (!env.DISPLAY && env.WAYLAND_DISPLAY)) {
    return { evidence: { source: 'system desktop' }, close: noop };
  }
  if (!env.DISPLAY) throw new Error('Native desktop setup requires DISPLAY (use xvfb-run)');
  const read = () => readNativeWindowManager({ run, env });
  const existing = await read();
  if (existing) return { evidence: { source: 'existing window manager', property: existing }, close: noop };

  await mkdir(output, { recursive: true });
  const log = await open(path.join(output, 'window-manager.log'), 'w');
  let wm, exited, finished = false, spawnError = null;
  try {
    wm = spawnProcess('openbox', ['--sm-disable'], { stdio: ['ignore', log.fd, log.fd], env });
    exited = new Promise(resolve => {
      wm.once('exit', () => { finished = true; resolve(); });
      wm.once('error', error => { spawnError = error; finished = true; resolve(); });
    });
  } finally { await log.close(); }
  const close = async () => {
    if (finished) return;
    wm.kill('SIGTERM');
    let timer;
    try {
      await Promise.race([exited, new Promise(resolve => {
        timer = setTimeout(() => { if (!finished) wm.kill('SIGKILL'); resolve(); }, 5000);
      })]);
      await exited;
    } finally { clearTimeout(timer); }
  };
  try {
    const deadline = Date.now() + 5000;
    let property;
    do {
      if (spawnError) throw spawnError;
      if (finished) throw new Error(`Openbox exited during native desktop setup (${wm.exitCode}); see window-manager.log`);
      property = await read();
      if (property) break;
      await wait(50);
    } while (Date.now() < deadline);
    if (!property) throw new Error('Window manager did not become ready within 5 seconds');
    return { evidence: { source: 'Openbox', processId: wm.pid, property }, close };
  } catch (error) {
    await close();
    throw error;
  }
}
