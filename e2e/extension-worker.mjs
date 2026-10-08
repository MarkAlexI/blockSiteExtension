// Native Chrome can expose component-extension workers before the test target.
// Select the manifest's worker, then verify its extension bindings and identity.
export async function extensionWorker(context, manifest, timeout = 20_000) {
  const script = manifest.background.service_worker;
  const matches = worker => {
    try {
      const url = new URL(worker.url());
      return url.protocol === 'chrome-extension:' && url.pathname === `/${script}`;
    } catch { return false; }
  };
  let worker = context.serviceWorkers().find(matches);
  if (!worker) {
    try { worker = await context.waitForEvent('serviceworker', { predicate: matches, timeout }); }
    catch (error) {
      throw new Error(`Extension setup: ${script} not found; observed workers: ${context.serviceWorkers().map(item => item.url()).join(', ') || '(none)'}`, { cause: error });
    }
  }
  const identity = await worker.evaluate(() => {
    const api = globalThis.chrome;
    const loaded = api?.runtime?.getManifest?.();
    return { id: api?.runtime?.id ?? null, version: loaded?.version ?? null,
      script: loaded?.background?.service_worker ?? null,
      local: typeof api?.storage?.local?.get === 'function',
      sync: typeof api?.storage?.sync?.set === 'function' };
  });
  if (identity.id !== new URL(worker.url()).host || identity.version !== manifest.version ||
      identity.script !== script || !identity.local || !identity.sync) {
    throw new Error(`Extension setup: unexpected worker bindings at ${worker.url()}: ${JSON.stringify(identity)}`);
  }
  return { worker, identity };
}
