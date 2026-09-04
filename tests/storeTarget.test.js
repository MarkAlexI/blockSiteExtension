import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isBlockedURL } from '../scripts/isBlockedURL.js';
import { createExtensionApi, withExtensionEnvironment } from './helpers/extensionTestHarness.js';
import {
  STORE_TARGET,
  EDGE_EXTENSION_ID,
  detectStoreTarget,
  getStoreConfig,
  getStoreProtectedPatterns
} from '../utils/storeTarget.js';

const popupSource = readFileSync(new URL('../popup.js', import.meta.url), 'utf8');

function getPopupOpenOptionsPage(storeTarget) {
  const start = popupSource.indexOf('  openOptionsPage() {');
  const end = popupSource.indexOf('\n  openFeedbackEmail()', start);

  assert.notEqual(start, -1, 'Popup openOptionsPage method was not found');
  assert.notEqual(end, -1, 'Popup openOptionsPage method boundary was not found');

  const methodSource = popupSource.slice(start, end).trim();
  return Function(
    'getStoreConfig',
    `return ({${methodSource}}).openOptionsPage;`
  )(() => ({ target: storeTarget }));
}

function runPopupOptionsNavigation(storeTarget, { nativeFailure = null } = {}) {
  const previousChrome = globalThis.chrome;
  const previousWindow = globalThis.window;
  const previousSetTimeout = globalThis.setTimeout;
  let nativeCalls = 0;
  let closeCalls = 0;
  const createdTabs = [];

  globalThis.chrome = {
    runtime: {
      lastError: null,
      getURL(path) {
        return `extension://${storeTarget}-test/${path}`;
      },
      openOptionsPage(callback) {
        nativeCalls += 1;
        if (nativeFailure === 'throw') {
          throw new Error('Options API unavailable');
        }
        if (nativeFailure === 'error') {
          globalThis.chrome.runtime.lastError = { message: 'Options API unavailable' };
        }
        callback();
        globalThis.chrome.runtime.lastError = null;
      }
    },
    tabs: {
      create(details, callback) {
        createdTabs.push(details);
        globalThis.chrome.runtime.lastError = null;
        callback();
      }
    }
  };
  globalThis.window = {
    close() {
      closeCalls += 1;
    }
  };
  globalThis.setTimeout = callback => {
    callback();
    return 1;
  };

  try {
    const openOptionsPage = getPopupOpenOptionsPage(storeTarget);
    openOptionsPage.call({ logger: { error() {} } });
    return { nativeCalls, closeCalls, createdTabs };
  } finally {
    globalThis.chrome = previousChrome;
    globalThis.window = previousWindow;
    globalThis.setTimeout = previousSetTimeout;
  }
}

test('source defaults to the Chrome store target', () => {
  assert.equal(STORE_TARGET, 'chrome');
  assert.equal(detectStoreTarget({
    buildTarget: STORE_TARGET,
    runtimeId: 'development-id',
    userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36'
  }), 'chrome');
});

test('Edge is detected by explicit build target, published extension ID, or Edge user agent', () => {
  assert.equal(detectStoreTarget({ buildTarget: 'edge' }), 'edge');
  assert.equal(detectStoreTarget({
    buildTarget: 'chrome',
    runtimeId: EDGE_EXTENSION_ID,
    userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36'
  }), 'edge');
  assert.equal(detectStoreTarget({
    buildTarget: 'chrome',
    runtimeId: 'development-id',
    userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'
  }), 'edge');
});

test('Edge popup bypasses the silent Android openOptionsPage no-op', () => {
  assert.match(
    popupSource,
    /import \{ getStoreConfig \} from '\.\/utils\/storeTarget\.js';/
  );

  const result = runPopupOptionsNavigation('edge');

  assert.equal(result.nativeCalls, 0);
  assert.deepEqual(result.createdTabs, [{
    url: 'extension://edge-test/options/options.html'
  }]);
  assert.equal(result.closeCalls, 1);
});

test('Chrome popup retains the native openOptionsPage path', () => {
  const result = runPopupOptionsNavigation('chrome');

  assert.equal(result.nativeCalls, 1);
  assert.deepEqual(result.createdTabs, []);
  assert.equal(result.closeCalls, 1);
});

test('Chrome popup falls back when the native options API fails', () => {
  for (const nativeFailure of ['error', 'throw']) {
    const result = runPopupOptionsNavigation('chrome', { nativeFailure });

    assert.equal(result.nativeCalls, 1, nativeFailure);
    assert.deepEqual(result.createdTabs, [{
      url: 'extension://chrome-test/options/options.html'
    }], nativeFailure);
    assert.equal(result.closeCalls, 1, nativeFailure);
  }
});

test('store config returns the correct review destinations', () => {
  const chrome = getStoreConfig({
    buildTarget: 'chrome',
    runtimeId: 'development-id',
    userAgent: 'Chrome/140.0.0.0'
  });
  const edge = getStoreConfig({ buildTarget: 'edge' });

  assert.equal(chrome.name, 'Chrome Web Store');
  assert.match(chrome.reviewUrl, /chromewebstore\.google\.com/);
  assert.equal(edge.name, 'Microsoft Edge Add-ons');
  assert.match(edge.reviewUrl, /microsoftedge\.microsoft\.com/);
});

test('Microsoft and Bing restrictions are Edge-only', () => {
  const chromePatterns = getStoreProtectedPatterns({
    buildTarget: 'chrome',
    runtimeId: 'development-id',
    userAgent: 'Chrome/140.0.0.0'
  });
  const edgePatterns = getStoreProtectedPatterns({ buildTarget: 'edge' });

  assert.equal(chromePatterns.length, 0);
  assert.equal(edgePatterns.some(pattern => pattern.test('https://www.bing.com/search?q=test')), true);
  assert.equal(edgePatterns.some(pattern => pattern.test('https://microsoft.com/')), true);
});

test('Edge protects real Microsoft hosts without trusting mentions on unrelated sites', async () => {
  const api = createExtensionApi();
  api.runtime.id = EDGE_EXTENSION_ID;

  await withExtensionEnvironment(api, () => {
    assert.equal(isBlockedURL([{ url: 'https://www.bing.com/search?q=test' }]), true);
    assert.equal(isBlockedURL([{ url: 'https://account.microsoft.com/' }]), true);
    assert.equal(isBlockedURL([{
      url: 'https://microsoftedge.microsoft.com/addons/detail/example'
    }]), true);
    assert.equal(isBlockedURL([{
      url: 'https://evil.example/?next=microsoft.com'
    }]), false);
    assert.equal(isBlockedURL([{
      url: 'https://evil.example/search/bing.com'
    }]), false);
  });
});
