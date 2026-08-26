import { getStoreProtectedPatterns } from '../utils/storeTarget.js';
import { isProtectedRequestHostname } from '../utils/protectedDomains.js';

/**
 * Checks whether the current tab URL is blocked from processing.
 *
 * Returns `true` for internal browser pages and extension-related URLs
 * that should not be handled by the extension logic.
 *
 * @param {Array<browser.tabs.Tab>|Array<chrome.tabs.Tab>|null|undefined} tabs
 * An array of tabs (usually the result of `tabs.query`).
 *
 * @returns {boolean}
 * `true` if the URL is blocked or tabs are missing, otherwise `false`.
 */

export function isBlockedURL(tabs) {
  if (!tabs) return true;
  const url = tabs[0]?.url || '';

  const blockedPatterns = [
    /^chrome:\/\//,
    /extension:\/\//,
    /^https:\/\/chrome\.google\.com\/webstore(?:\/|$)/,
    /^https:\/\/chromewebstore\.google\.com(?:\/|$)/,
    /^kiwi:\/\//,
    /^devtools:/,
    /^view-source:/,
    /\/\/newtab/
  ];
  const storePatterns = getStoreProtectedPatterns();
  const protectedProjectPatterns = [/blockdistraction/i, /markdigital\.cc/i, /ext\.pp\.ua/i];

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }

  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
    let pastedHostname = '';
    try {
      pastedHostname = new URL(`https://${url}`).hostname;
    } catch {
      // Invalid inputs retain the existing browser and project pattern checks.
    }

    if (isProtectedRequestHostname(pastedHostname)) return true;
    return [...blockedPatterns, ...protectedProjectPatterns, ...storePatterns]
      .some(pattern => pattern.test(url));
  }

  const safeUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  const hostname = parsed.hostname.toLowerCase();
  const isProtectedProjectHost = [
    /(?:^|\.)blockdistraction\.com$/i,
    /(?:^|\.)markdigital\.cc$/i,
    /(?:^|\.)ext\.pp\.ua$/i
  ].some(pattern => pattern.test(hostname));

  return blockedPatterns.some(pattern => pattern.test(safeUrl)) ||
    isProtectedRequestHostname(hostname) ||
    isProtectedProjectHost ||
    storePatterns.some(pattern => pattern.test(
      pattern.source.startsWith('^') ? safeUrl : hostname
    ));
}
