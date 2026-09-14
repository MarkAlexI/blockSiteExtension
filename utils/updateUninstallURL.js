export async function updateUninstallURL() {
  await chrome.runtime.setUninstallURL('https://blockdistraction.com/uninstall.html');
}
