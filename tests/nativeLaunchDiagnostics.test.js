import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { launchNativeChromium } from '../e2e/native-launch.mjs';

// These are process/error-boundary tests, not installed-browser acceptance.
for (const missing of [false, true]) {
  test(`native process startup preserves its original failure and owned-process diagnostics (missing executable: ${missing})`, async () => {
    const profile = await mkdtemp(path.join(tmpdir(), 'bd-launch-model-'));
    const executablePath = missing ? path.join(profile, 'no-browser-here') : process.execPath;
    try {
      await assert.rejects(launchNativeChromium({ executablePath, profile,
        port: 1, headless: true }), error => {
        if (missing) assert.equal(error.code, 'ENOENT');
        else assert.match(error.message, /Native Chromium exited before CDP/);
        const info = error.nativeStartup;
        assert.equal(info.executablePath, executablePath);
        assert.equal(info.endpoint, 'http://127.0.0.1:1');
        assert.ok(info.elapsedMs >= 0);
        assert.equal(Number.isInteger(info.discovery.attempts), true);
        if (!missing) {
          assert.ok(info.pid > 0);
          assert.ok(Number.isInteger(info.exitCode) && info.exitCode !== 0);
          assert.ok(info.stderr.length > 0, 'Node rejects the Chromium switches before acting as a browser');
        }
        return true;
      });
    } finally { await rm(profile, { recursive: true, force: true }); }
  });
}
