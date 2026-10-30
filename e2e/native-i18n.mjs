import assert from 'node:assert/strict';

// Serialized into a page or worker. Read the real bindings without fetching a
// replacement dictionary, changing the locale, reloading or rendering the UI.
export function readNativeI18n() {
  const api = globalThis.browser || globalThis.chrome;
  return {
    url: globalThis.location?.href ?? null,
    id: api.runtime.id,
    defaultLocale: api.runtime.getManifest().default_locale,
    uiLanguage: api.i18n.getUILanguage(),
    messages: Object.fromEntries(['header', 'deletebtn', 'blockingmode_header', 'daily_limit_usage']
      .map(key => [key, api.i18n.getMessage(key, key === 'daily_limit_usage' ? ['7', '10'] : undefined)])),
    predefinedMessages: Object.fromEntries(['@@extension_id', '@@ui_locale', '@@bidi_dir']
      .map(key => [key, api.i18n.getMessage(key)]))
  };
}

export async function requireNativeI18n(e, page, label) {
  const snapshot = await page.evaluate(readNativeI18n);
  const valid = snapshot.id === e.id && snapshot.predefinedMessages['@@extension_id'] === e.id &&
    Boolean(snapshot.predefinedMessages['@@ui_locale']) &&
    ['ltr', 'rtl'].includes(snapshot.predefinedMessages['@@bidi_dir']) &&
    Object.values(snapshot.messages).every(message => typeof message === 'string' && message.length > 0);
  if (e.testInfo) await e.testInfo.attach(label, {
    body: JSON.stringify(snapshot, null, 2), contentType: 'application/json'
  });
  else if (e.result) (e.result.nativeI18n ||= []).push({ label, snapshot });
  assert.ok(valid, `Native i18n binding failed before localized UI assertions: ${JSON.stringify(snapshot)}`);
  return snapshot;
}
