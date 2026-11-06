import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { requireNativeI18n } from '../e2e/native-i18n.mjs';

const id = 'a'.repeat(32);
const catalog = { header: 'Site Blocker', deletebtn: 'Delete', blockingmode_header: 'Blocking Mode',
  daily_limit_usage: '7 / 10 min', '@@extension_id': id, '@@ui_locale': 'en', '@@bidi_dir': 'ltr' };

function context(messages) {
  const calls = [], attachments = [];
  const globals = { location: { href: `chrome-extension://${id}/scripts/service_worker.js` },
    chrome: { runtime: { id, getManifest: () => ({ default_locale: 'en' }) }, i18n: {
      getUILanguage: () => 'en-US', getMessage(key, substitutions) {
        calls.push({ key, substitutions }); return messages[key] ?? '';
      }
    } } };
  const page = { evaluate: fn => JSON.parse(JSON.stringify(runInNewContext('(' + fn.toString() + ')()', globals))) };
  const e = { id, testInfo: { async attach(name, attachment) {
    attachments.push({ name, snapshot: JSON.parse(attachment.body) });
  } } };
  return { page, e, calls, attachments };
}

test('startup checks the real catalog and predefined bindings without replacing their values', async () => {
  const f = context(catalog);
  const snapshot = await requireNativeI18n(f.e, f.page, 'startup');
  assert.equal(snapshot.messages.daily_limit_usage, '7 / 10 min');
  assert.equal(snapshot.predefinedMessages['@@extension_id'], id);
  assert.deepEqual([...f.calls.find(call => call.key === 'daily_limit_usage').substitutions], ['7', '10']);
  assert.deepEqual(f.attachments, [{ name: 'startup', snapshot }]);
});

for (const messages of [{}, { ...catalog, '@@extension_id': '' }, { ...catalog, daily_limit_usage: '' }]) {
  test('an empty native bundle or missing binding fails startup with its original diagnostic snapshot ' + JSON.stringify(messages), async () => {
    const f = context(messages);
    await assert.rejects(requireNativeI18n(f.e, f.page, 'startup'), /Native i18n binding failed/);
    assert.equal(f.attachments.length, 1);
    assert.equal(f.attachments[0].snapshot.messages.daily_limit_usage, messages.daily_limit_usage ?? '');
    assert.equal(f.attachments[0].snapshot.predefinedMessages['@@extension_id'], messages['@@extension_id'] ?? '');
  });
}
