import { prepareNativePages } from './native-launch.mjs';

// Installation needs Playwright, but HTTP target cleanup must finish before
// attaching the scenario's page sessions and tracing. Never reuse the installer
// connection after closing its WebUI/Options targets through the HTTP API.
export async function connectPreparedNativeBrowser(browserType, owner, {
  install, prepareOptions, onPrepared
} = {}) {
  if (install && prepareOptions?.restoreSession) {
    throw new Error('Session restoration must not install or clear native pages');
  }
  const connect = () => browserType.connectOverCDP(owner.webSocketDebuggerUrl, {
    noDefaults: true, isLocal: true
  });
  if (install) {
    const installer = await connect();
    try {
      await install(installer);
    } catch (error) {
      // Preserve the installation failure if disconnecting also fails.
      await installer.close().catch(() => {});
      throw error;
    }
    // For connectOverCDP this disconnects the client, not the owned process.
    // Do not close its context or send the CDP Browser.close command here.
    await installer.close();
  }
  const prepared = await prepareNativePages(owner.endpoint, prepareOptions);
  await onPrepared?.(prepared);
  return connect();
}
