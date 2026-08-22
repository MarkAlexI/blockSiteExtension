import test from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedURL } from '../scripts/isBlockedURL.js';
import { createExtensionApi, withExtensionEnvironment } from './helpers/extensionTestHarness.js';
import {
  STORE_TARGET,
  EDGE_EXTENSION_ID,
  detectStoreTarget,
  getStoreConfig,
  getStoreProtectedPatterns
} from '../utils/storeTarget.js';

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
