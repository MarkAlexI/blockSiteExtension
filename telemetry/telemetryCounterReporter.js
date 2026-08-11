import { normalizeCounterName } from './telemetrySanitizer.js';

export function recordTelemetryCounter(name, {
  runtimeApi = globalThis.chrome?.runtime
} = {}) {
  const safeName = normalizeCounterName(name);
  if (!safeName || !runtimeApi?.sendMessage) return false;

  try {
    runtimeApi.sendMessage({
      type: 'telemetry:incrementCounter',
      name: safeName
    }, () => {
      void runtimeApi.lastError;
    });
    return true;
  } catch {
    // Telemetry must never interfere with the extension page itself.
    return false;
  }
}
