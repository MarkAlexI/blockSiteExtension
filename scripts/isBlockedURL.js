export function isBlockedURL(tabs) {
  if (!tabs) return true;
  const url = tabs[0]?.url || '';
  
  const blockedPatterns = [
    /^chrome:\/\//,
    /^chrome-extension:\/\//,
    /^https:\/\/chrome\.google\.com\/webstore/,
    /^https:\/\/chromewebstore\.google\.com/,
    /^edge:\/\//,
    /^kiwi:\/\//,
    /^kiwi-extension:\/\//,
    /^devtools:/
  ];
  
  return blockedPatterns.some(pattern => pattern.test(url));
}