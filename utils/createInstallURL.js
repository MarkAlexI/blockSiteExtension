export function createInstallURL() {
  const url = chrome.runtime.getURL('options/options.html');
  
  return url;
}