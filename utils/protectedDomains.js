import { detectStoreTarget } from './storeTarget.js';

const SHARED_PROTECTED_REQUEST_DOMAINS = Object.freeze([
  'accounts.google.com',
  'accounts.youtube.com',
  'blockdistraction.com',
  'ext.pp.ua',
  'markdigital.cc'
]);

const CHROME_PROTECTED_REQUEST_DOMAINS = Object.freeze([
  ...SHARED_PROTECTED_REQUEST_DOMAINS,
  'chrome.google.com',
  'chromewebstore.google.com'
]);

const EDGE_PROTECTED_REQUEST_DOMAINS = Object.freeze([
  ...CHROME_PROTECTED_REQUEST_DOMAINS,
  'bing.com',
  'microsoft.com',
  'microsoftedge.microsoft.com'
]);

export function getProtectedRequestDomains(options = {}) {
  return detectStoreTarget(options) === 'edge'
    ? EDGE_PROTECTED_REQUEST_DOMAINS
    : CHROME_PROTECTED_REQUEST_DOMAINS;
}

export function isProtectedRequestHostname(hostname, options = {}) {
  const normalized = typeof hostname === 'string'
    ? hostname.trim().toLowerCase()
    : '';

  return normalized !== '' && getProtectedRequestDomains(options).some(domain =>
    normalized === domain || normalized.endsWith(`.${domain}`)
  );
}
