// Deadlines here bound diagnostics/cleanup, never scenario readiness or assertions.
export async function cleanupDeadline(action, label, timeoutMs) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(action), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded cleanup deadline (${timeoutMs}ms)`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

export async function closeNativeResources({ context, nativeBrowser, nativeOwner },
  { timeoutMs = 3000, ownerTimeoutMs = 7000 } = {}) {
  const failures = [];
  for (const [label, resource] of [['context', context], ['CDP transport', nativeBrowser]]) {
    if (!resource) continue;
    try { await cleanupDeadline(() => resource.close(), label, timeoutMs); }
    catch (error) { failures.push({ label, error: String(error) }); }
  }
  // A stalled context/transport must never prevent the independently owned
  // process's SIGTERM/SIGKILL fallback from running.
  await cleanupDeadline(() => nativeOwner.close(), 'owned browser process', ownerTimeoutMs);
  return failures;
}
