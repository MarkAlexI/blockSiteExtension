import test from 'node:test';
import assert from 'node:assert/strict';
import { openPrivacySettings } from '../update/privacySettings.js';

function createRuntime({ openOptionsPage } = {}) {
  return {
    getURL(path) {
      return `chrome-extension://test/${path}`;
    },
    openOptionsPage,
    lastError: null
  };
}

test('Edge opens the packaged Options page directly instead of relying on openOptionsPage', () => {
  let nativeCalls = 0;
  const created = [];
  const runtime = createRuntime({
    openOptionsPage() {
      nativeCalls += 1;
    }
  });
  const tabs = {
    create(details) {
      created.push(details);
    }
  };

  openPrivacySettings({ runtime, tabs, storeTarget: 'edge' });

  assert.equal(nativeCalls, 0);
  assert.deepEqual(created, [{
    url: 'chrome-extension://test/options/options.html'
  }]);
});

test('Chrome uses openOptionsPage when it succeeds', () => {
  let nativeCalls = 0;
  const created = [];
  const runtime = createRuntime({
    openOptionsPage(callback) {
      nativeCalls += 1;
      callback();
    }
  });
  const tabs = {
    create(details) {
      created.push(details);
    }
  };

  openPrivacySettings({ runtime, tabs, storeTarget: 'chrome' });

  assert.equal(nativeCalls, 1);
  assert.deepEqual(created, []);
});

test('Chrome falls back to a packaged Options tab when openOptionsPage reports an error', () => {
  const created = [];
  const runtime = createRuntime({
    openOptionsPage(callback) {
      runtime.lastError = { message: 'Not supported' };
      callback();
      runtime.lastError = null;
    }
  });
  const tabs = {
    create(details) {
      created.push(details);
    }
  };

  openPrivacySettings({ runtime, tabs, storeTarget: 'chrome' });

  assert.deepEqual(created, [{
    url: 'chrome-extension://test/options/options.html'
  }]);
});

test('Chrome falls back when openOptionsPage is unavailable', () => {
  const created = [];
  const runtime = createRuntime();
  const tabs = {
    create(details) {
      created.push(details);
    }
  };

  openPrivacySettings({ runtime, tabs, storeTarget: 'chrome' });

  assert.deepEqual(created, [{
    url: 'chrome-extension://test/options/options.html'
  }]);
});
