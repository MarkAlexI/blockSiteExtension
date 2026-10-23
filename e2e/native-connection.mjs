import { prepareNativePages } from './native-launch.mjs';

// Installation metadata can precede the new worker's onInstalled handler.
// Observe its localized Options page while the installer is still connected,
// then disconnect before HTTP cleanup and attach a fresh scenario client.
export async function connectPreparedNativeBrowser(browserType, owner, {
  install, prepareOptions, onPrepared
} = {}) {
  if (install && prepareOptions?.restoreSession) {
    throw new Error('Session restoration must not install or clear native pages');
  }
  const connect = () => browserType.connectOverCDP(owner.webSocketDebuggerUrl, {
    noDefaults: true, isLocal: true
  });
  let prepared;
  if (install) {
    const installer = await connect();
    let disconnectStarted = false;
    const disconnectInstaller = async () => {
      disconnectStarted = true;
      // For connectOverCDP this disconnects the client, not the owned process.
      // Do not close its context or send the CDP Browser.close command here.
      await installer.close();
    };
    try {
      await install(installer);
      prepared = await prepareNativePages(owner.endpoint, {
        ...prepareOptions, beforePageCleanup: disconnectInstaller
      });
    } catch (error) {
      // Preserve install/readiness failures and make only one disconnect
      // attempt, including when disconnect itself is the failed operation.
      if (!disconnectStarted) await disconnectInstaller().catch(() => {});
      throw error;
    }
  } else {
    prepared = await prepareNativePages(owner.endpoint, prepareOptions);
  }
  await onPrepared?.(prepared);
  return connect();
}
