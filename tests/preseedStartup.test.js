import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForPreseedStartup } from '../e2e/preseed-startup.mjs';

function fixture(checkpoints) {
  let at = 0, reads = 0;
  const worker = { async evaluate() { return checkpoints[Math.min(reads++, checkpoints.length - 1)]; } };
  return { worker, reads: () => reads, options: {
    now: () => at, pause: async ms => { at += ms; }, timeout: 200
  } };
}
const ready = { reason: 'startup', timestamp: 701, hostAccess: true };

test('preseed waits past the saved migration state, install marker and previous startup before accepting this startup', async () => {
  const f = fixture([null, { ...ready, reason: 'install' }, { ...ready, timestamp: 699 }, ready]);
  assert.equal(await waitForPreseedStartup(f.worker, 700, f.options), ready);
  assert.equal(f.reads(), 4);
});

test('a stale successful startup never permits mutation fixture seeding', async () => {
  const f = fixture([{ ...ready, timestamp: 699 }]);
  await assert.rejects(waitForPreseedStartup(f.worker, 700, f.options), /did not pass initialization.*699/);
});

for (const checkpoint of [{ ...ready, hostAccess: false }, { ...ready, error: 'native permission query rejected' }]) {
  test(`a current failed permission checkpoint cannot qualify for seeding ${JSON.stringify(checkpoint)}`, async () => {
    const f = fixture([checkpoint]);
    await assert.rejects(waitForPreseedStartup(f.worker, 700, f.options), /permission check failed/);
    assert.equal(f.reads(), 1);
  });
}

test('preseed cannot rely on a missing or invalid clean-exit timestamp', async () => {
  const f = fixture([ready]);
  for (const value of [undefined, null, NaN, Infinity, '700']) {
    await assert.rejects(waitForPreseedStartup(f.worker, value, f.options), /clean-exit timestamp/);
  }
  assert.equal(f.reads(), 0);
});

test('the native checkpoint read uses production diagnostic storage without writing, messages or repair intents', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  const reads = [];
  globalThis.chrome = { storage: { local: { async get(key) {
    reads.push(key); return { diagnosticState: { lastPermissionCheck: ready } };
  } } } };
  try {
    assert.equal(await waitForPreseedStartup({ evaluate: fn => fn() }, 700), ready);
    assert.deepEqual(reads, ['diagnosticState']);
  } finally {
    if (original) Object.defineProperty(globalThis, 'chrome', original); else delete globalThis.chrome;
  }
});
