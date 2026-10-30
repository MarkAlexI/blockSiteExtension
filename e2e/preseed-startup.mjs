// The migration flag survives a restart. It does not prove that this process
// finished startup migration/pruning before a test writes synthetic budgets.
// The production permission checkpoint is committed after initializeExtension.
// Observe it only before seeding, never as a repair after the tested SIGKILL.
export async function waitForPreseedStartup(worker, notBefore, {
  now = Date.now, pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
  timeout = 15_000
} = {}) {
  if (!Number.isFinite(notBefore)) throw new Error('Preseed startup requires the clean-exit timestamp');
  const deadline = now() + timeout;
  let checkpoint;
  do {
    checkpoint = await worker.evaluate(async () =>
      (await chrome.storage.local.get('diagnosticState')).diagnosticState?.lastPermissionCheck ?? null);
    if (checkpoint?.reason === 'startup' && Number.isFinite(checkpoint.timestamp) &&
        checkpoint.timestamp >= notBefore) {
      if (checkpoint.hostAccess !== true || checkpoint.error) {
        throw new Error(`Preseed startup permission check failed: ${JSON.stringify(checkpoint)}`);
      }
      return checkpoint;
    }
    if (now() >= deadline) break;
    await pause(50);
  } while (now() <= deadline);
  throw new Error(`Preseed startup did not pass initialization after ${notBefore}; last=${JSON.stringify(checkpoint)}`);
}
