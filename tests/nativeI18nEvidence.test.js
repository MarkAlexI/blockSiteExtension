import test from 'node:test';
import assert from 'node:assert/strict';
import { readNativeI18n, requireNativeI18n } from '../e2e/native-i18n.mjs';

const valid = () => ({ id: 'owned', uiLanguage: 'en-US',
  messages: { header: 'Site Blocker', deletebtn: 'Delete', blockingmode_header: 'Mode', daily_limit_usage: '7 / 10 min' },
  predefinedMessages: { '@@extension_id': 'owned', '@@ui_locale': 'en_US', '@@bidi_dir': 'ltr' } });

test('a native empty bundle is rejected before it can become an empty expected accessible name or a usage parse timeout', async () => {
  const snapshot = valid();
  for (const object of [snapshot.messages, snapshot.predefinedMessages]) for (const key in object) object[key] = '';
  const e = { id: 'owned', result: {} };
  await assert.rejects(requireNativeI18n(e, { evaluate: async () => snapshot }, 'reader'), /Native i18n binding failed/);
  assert.equal(e.result.nativeI18n[0].snapshot, snapshot);
});

test('a valid native bundle still permits the original localized assertions', async () => {
  const snapshot = valid();
  assert.equal(await requireNativeI18n({ id: 'owned' }, { evaluate: async () => snapshot }, 'reader'), snapshot);
});

test('a missing production message or mismatched predefined identity is never accepted as a healthy bundle', async () => {
  for (const change of [value => { value.messages.daily_limit_usage = ''; },
    value => { value.predefinedMessages['@@extension_id'] = 'other'; }]) {
    const snapshot = valid(); change(snapshot);
    await assert.rejects(requireNativeI18n({ id: 'owned' }, { evaluate: async () => snapshot }, 'reader'), /Native i18n binding failed/);
  }
});

test('the serializable i18n probe reads native messages and substitutions without fetching or replacing bindings', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  const calls = [];
  const getMessage = (key, args) => { calls.push([key, args]); return key; };
  globalThis.chrome = { runtime: { id: 'owned', getManifest: () => ({ default_locale: 'en' }) },
    i18n: { getUILanguage: () => 'en-US', getMessage } };
  try {
    const snapshot = readNativeI18n();
    assert.equal(snapshot.id, 'owned');
    assert.deepEqual(calls.find(([key]) => key === 'daily_limit_usage'), ['daily_limit_usage', ['7', '10']]);
    assert.equal(chrome.i18n.getMessage, getMessage);
  } finally {
    if (original) Object.defineProperty(globalThis, 'chrome', original); else delete globalThis.chrome;
  }
});
