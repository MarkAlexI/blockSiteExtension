import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTelemetryConsent,
  setTelemetryConsent,
  TELEMETRY_CONSENT_KEY
} from '../telemetry/telemetryConsent.js';

function createStorage(initial = {}) {
  const data = structuredClone(initial);
  return {
    data,
    async get(keys) {
      const result = {};
      for (const key of keys) result[key] = structuredClone(data[key]);
      return result;
    },
    async set(values) { Object.assign(data, structuredClone(values)); }
  };
}

test('telemetry consent is disabled by default and requires an explicit choice', async () => {
  const storage = createStorage();
  assert.deepEqual(await getTelemetryConsent(storage), {
    version: 1,
    enabled: false,
    decidedAt: null
  });
  assert.equal(storage.data[TELEMETRY_CONSENT_KEY], undefined);
});

test('telemetry consent stores only the local opt-in decision', async () => {
  const storage = createStorage();
  const consent = await setTelemetryConsent(storage, true, () => 1234);
  assert.deepEqual(consent, { version: 1, enabled: true, decidedAt: 1234 });
  assert.deepEqual(await getTelemetryConsent(storage), consent);
});
