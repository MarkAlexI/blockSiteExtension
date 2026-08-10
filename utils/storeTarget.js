export const STORE_TARGET = 'chrome';

export const EDGE_EXTENSION_ID = 'ilmfjlfmilmafofbanphijmbklbmolhi';

const STORE_CONFIG = Object.freeze({
  chrome: Object.freeze({
    target: 'chrome',
    name: 'Chrome Web Store',
    listingUrl: 'https://chromewebstore.google.com/detail/kfhgdgokgjmdboidlhphajinmgpcmmec',
    reviewUrl: 'https://chromewebstore.google.com/detail/kfhgdgokgjmdboidlhphajinmgpcmmec/reviews'
  }),
  edge: Object.freeze({
    target: 'edge',
    name: 'Microsoft Edge Add-ons',
    listingUrl: 'https://microsoftedge.microsoft.com/addons/detail/ilmfjlfmilmafofbanphijmbklbmolhi',
    reviewUrl: 'https://microsoftedge.microsoft.com/addons/detail/ilmfjlfmilmafofbanphijmbklbmolhi'
  })
});

function defaultRuntimeId() {
  return globalThis.chrome?.runtime?.id || '';
}

function defaultUserAgent() {
  return globalThis.navigator?.userAgent || '';
}

export function detectStoreTarget({
  buildTarget = STORE_TARGET,
  runtimeId = defaultRuntimeId(),
  userAgent = defaultUserAgent()
} = {}) {
  if (buildTarget === 'edge') return 'edge';
  if (runtimeId === EDGE_EXTENSION_ID) return 'edge';
  if (/\bEdg(?:A|iOS)?\/\d+/i.test(String(userAgent))) return 'edge';
  return 'chrome';
}

export function getStoreConfig(options = {}) {
  return STORE_CONFIG[detectStoreTarget(options)];
}

export function getStoreProtectedPatterns(options = {}) {
  if (detectStoreTarget(options) !== 'edge') return [];

  return [
    /^edge:\/\//,
    /^https:\/\/microsoftedge\.microsoft\.com\/addons\//,
    /microsoft/i,
    /bing\.com/i
  ];
}
