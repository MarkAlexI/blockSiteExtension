import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundService, OFFSCREEN_SOUND_PATH } from '../utils/soundService.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture({ existing = [], create, send, close, getContexts = true } = {}) {
  const calls = [];
  const api = { runtime: { getURL: p => `chrome-extension://own/${p}`,
    ...(getContexts ? { getContexts: async () => existing.map(documentUrl => ({ documentUrl })) } : {}),
    async sendMessage(message) { calls.push(['send', message]); return send ? send(message) : { success: true }; } },
  offscreen: { async createDocument(details) { calls.push(['create', details]); await create?.(); },
    async closeDocument() { calls.push(['close']); await close?.(); } } };
  return { calls, api, service: createSoundService({ api }) };
}
test('sound is lazy and one concurrent owner creates AUDIO_PLAYBACK, sends a finite command and closes it', async () => {
  const hold = deferred(), f = fixture({ send: async () => { await hold.promise; return { success: true }; } });
  assert.deepEqual(f.calls, []);
  const a = f.service.play('focus-complete', 'focus:1'), b = f.service.play('focus-complete', 'focus:1');
  assert.equal(a, b); await tick(); assert.deepEqual(f.calls.map(c => c[0]), ['create', 'send']);
  assert.deepEqual(f.calls[0][1].reasons, ['AUDIO_PLAYBACK']); assert.equal(f.calls[0][1].url, OFFSCREEN_SOUND_PATH);
  assert.equal(f.calls[1][1].target, 'sound-offscreen'); assert.equal(typeof f.calls[1][1].expiresAt, 'number');
  hold.resolve(); assert.equal((await a).success, true);
  assert.deepEqual(f.calls.map(c => c[0]), ['create', 'send', 'close']);
  assert.equal((await f.service.play('focus-complete', 'focus:1')).duplicate, true);
});
test('an already-owned page is reused and cleaned after worker recreation', async () => {
  const f = fixture({ existing: [`chrome-extension://own/${OFFSCREEN_SOUND_PATH}`] });
  assert.equal((await f.service.play('focus-complete', 'preview:1')).success, true);
  assert.deepEqual(f.calls.map(c => c[0]), ['send', 'close']);
});
test('Chrome 109-115 discovers the exact owned client without newer APIs', async () => {
  const f = fixture({ getContexts: false });
  const clients = { matchAll: async () => [{ url: 'chrome-extension://own/options/options.html' }] };
  const service = createSoundService({ api: f.api, clients });
  assert.equal((await service.play('focus-complete', 'preview:1')).success, true);
  assert.deepEqual(f.calls.map(c => c[0]), ['create', 'send', 'close']);
});
test('unavailable offscreen or discovery returns failure without opening a fallback tab', async () => {
  for (const api of [{ runtime: {} }, { ...fixture({ getContexts: false }).api }]) {
    assert.equal((await createSoundService({ api, clients: null }).play('focus-complete', 'preview:1')).success, false);
  }
});
test('a different offscreen owner is not closed on create failure', async () => {
  const f = fixture({ existing: ['chrome-extension://own/other.html'], create: () => { throw new Error('Only one document'); } });
  assert.equal((await f.service.play('focus-complete', 'preview:1')).success, false);
  assert.deepEqual(f.calls.map(c => c[0]), ['create']);
});
for (const phase of ['send', 'close']) test(`${phase} rejection is caught and cleanup is attempted`, async () => {
  const f = fixture({ [phase]: () => { throw new Error('platform unavailable'); } });
  assert.equal((await f.service.play('focus-complete', 'preview:1')).success, false);
  assert.deepEqual(f.calls.map(c => c[0]), ['create', 'send', 'close']);
});
test('late document creation after timeout closes the page without sending playback', async () => {
  const hold = deferred(), f = fixture({ create: () => hold.promise });
  let expire;
  const service = createSoundService({ api: f.api, setTimer: fn => { expire = fn; return 1; }, clearTimer() {} });
  const work = service.play('focus-complete', 'preview:1'); await tick(); expire();
  assert.equal((await work).code, 'audio_timeout'); hold.resolve(); await tick();
  assert.deepEqual(f.calls.map(c => c[0]), ['create', 'close']);
});
test('a preference change during creation cancels dispatch but still closes the owned page', async () => {
  let allowed = true;
  const f = fixture({ create: () => { allowed = false; } });
  assert.equal((await f.service.play('focus-complete', 'focus:1', () => allowed)).success, false);
  assert.deepEqual(f.calls.map(c => c[0]), ['create', 'close']);
});

test('cancellation after discovery cleans a sound page left by the previous worker without playing', async () => {
  const f = fixture({ existing: [`chrome-extension://own/${OFFSCREEN_SOUND_PATH}`] });
  assert.equal((await f.service.play('focus-complete', 'focus:1', () => false)).success, false);
  assert.deepEqual(f.calls.map(c => c[0]), ['close']);
});
