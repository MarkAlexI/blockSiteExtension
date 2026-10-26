import test from 'node:test';
import assert from 'node:assert/strict';
import { audioFixture } from './helpers/soundFixture.js';

let sequence = 0;
async function withOffscreen(callback) {
  const previous = { chrome: globalThis.chrome, AudioContext: globalThis.AudioContext };
  const audio = audioFixture(); let listener;
  globalThis.AudioContext = audio.AudioContext;
  globalThis.chrome = { runtime: { id: 'own', onMessage: { addListener(fn) { listener = fn; } } } };
  try {
    await import(`../scripts/sound-offscreen.js?test=${++sequence}`);
    await callback({ listener, audio });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
}
const command = overrides => ({ type: 'sound:play', target: 'sound-offscreen', sound: 'focus-complete',
  requestId: 'focus:1', expiresAt: Date.now() + 4000, ...overrides });

test('offscreen listener plays one finite native-API-model chime and deduplicates its request', async () => {
  await withOffscreen(async ({ listener, audio }) => {
    const send = () => new Promise(resolve => assert.equal(listener(command(), { id: 'own' }, resolve), true));
    assert.equal((await send()).success, true); assert.equal(audio.contexts[0].closed, 1);
    assert.equal((await send()).duplicate, true); assert.equal(audio.contexts.length, 1);
  });
});
test('offscreen listener rejects external, tab, expired and arbitrary-sound requests without audio', async () => {
  await withOffscreen(async ({ listener, audio }) => {
    for (const [message, sender] of [[command(), { id: 'foreign' }], [command(), { id: 'own', tab: {} }],
      [command({ expiresAt: Date.now() - 1 }), { id: 'own' }], [command({ sound: 'https://example.test/sound' }), { id: 'own' }]]) {
      let result; assert.equal(listener(message, sender, response => { result = response; }), false);
      assert.equal(result.success, false);
    }
    let responded = false;
    assert.equal(listener({ type: 'other' }, {}, () => { responded = true; }), false);
    assert.equal(responded, false); assert.equal(audio.contexts.length, 0);
  });
});
