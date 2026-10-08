import { targetsAt } from './native-launch.mjs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// HTTP discovery enumerates live workers without attaching a DevTools session.
// The caller must disconnect all CDP clients first. Never stop/restart a worker,
// open a page, evaluate JS or send an extension message during this observation.
export async function observeNativeIdleWake(endpoint, workerUrl, {
  wakeAt, lastApiAt, wakeBefore = Infinity, unloadTimeout = 45_000, wakeTimeout = 20_000,
  pollInterval = 200, idleConfirmMs = 1000, onSample = () => {},
  // Deterministic clock injection is for HTTP protocol-model tests only.
  // The native scenario uses the real host clock and timers.
  now = Date.now, pauseFor = pause
}) {
  if (!Number.isFinite(wakeAt) || !Number.isFinite(lastApiAt) || wakeAt <= now()) {
    throw new Error('Native idle observation needs a future alarm and the last native API timestamp');
  }
  const unloadDeadline = Math.min(now() + unloadTimeout, wakeAt);
  let absentAt = null, idleAt = null;
  while (true) {
    const targets = await targetsAt(endpoint);
    const at = now();
    const workers = targets.filter(target => target.type === 'service_worker' && target.url === workerUrl);
    onSample({ at, workers: workers.map(target => target.id),
      pages: targets.filter(target => target.type === 'page').map(target => ({ id: target.id, url: target.url })) });
    if (targets.some(target => target.type === 'page' && target.url !== 'about:blank')) {
      throw new Error('Native idle observation found a non-blank page during the detached interval');
    }
    if (!targets.some(target => target.type === 'page' && target.url === 'about:blank')) {
      throw new Error('Native idle observation lost the keeper browser window');
    }
    if (workers.length > 1) throw new Error('Native idle observation found duplicate extension workers');
    if (at >= wakeBefore) throw new Error('Expected wake was not observed before the next competing alarm');
    if (!idleAt) {
      if (!workers.length) {
        if (at - lastApiAt < 25_000) throw new Error('Worker disappeared before the native idle window');
        absentAt ??= at;
        if (at - absentAt >= idleConfirmMs) idleAt = absentAt;
      } else if (absentAt !== null) {
        throw new Error('Worker woke before sustained idle was observed');
      }
      if (!idleAt && at >= unloadDeadline) {
        throw new Error('Worker never unloaded before the next native alarm');
      }
    } else if (workers.length) {
      if (at < wakeAt) throw new Error('Worker woke before the expected native alarm');
      // Chromium may reuse a stopped DevTools agent host and target ID. The
      // scenario separately checks loss of a JS global and survival of session
      // storage; a changed target ID is not a lifecycle contract.
      return { idleAt, wakeObservedAt: at, target: workers[0] };
    }
    if (at >= wakeAt + wakeTimeout) throw new Error('Native alarm did not wake the unloaded worker');
    await pauseFor(pollInterval);
  }
}
