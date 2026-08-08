export const TELEMETRY_CONSENT_KEY = 'telemetryConsent';
export const TELEMETRY_CONSENT_VERSION = 1;

export async function getTelemetryConsent(localStorage) {
  const result = await localStorage.get([TELEMETRY_CONSENT_KEY]);
  const stored = result?.[TELEMETRY_CONSENT_KEY];

  if (!stored || typeof stored !== 'object' || stored.version !== TELEMETRY_CONSENT_VERSION) {
    return {
      version: TELEMETRY_CONSENT_VERSION,
      enabled: false,
      decidedAt: null
    };
  }

  return {
    version: TELEMETRY_CONSENT_VERSION,
    enabled: stored.enabled === true,
    decidedAt: Number.isFinite(stored.decidedAt) ? stored.decidedAt : null
  };
}

export async function setTelemetryConsent(localStorage, enabled, now = () => Date.now()) {
  const consent = {
    version: TELEMETRY_CONSENT_VERSION,
    enabled: enabled === true,
    decidedAt: now()
  };

  await localStorage.set({ [TELEMETRY_CONSENT_KEY]: consent });
  return consent;
}
