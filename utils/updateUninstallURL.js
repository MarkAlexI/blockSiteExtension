export async function updateUninstallURL() {
  const { credentials } = await chrome.storage.sync.get(['credentials']);
  const { rules } = await chrome.storage.local.get(['rules']);

  const rawData = JSON.stringify({
    l: credentials?.isLegacyUser ?? null,
    d: credentials?.installationDate ?? null,
    p: credentials?.isPro ?? null,
    v: chrome.runtime.getManifest().version ?? null,
    r: rules?.length ?? null
  });

  const encodedData = btoa(unescape(encodeURIComponent(rawData)));
  
  chrome.runtime.setUninstallURL(`https://blockdistraction.com/uninstall.html?ctx=${encodedData}`);
}
