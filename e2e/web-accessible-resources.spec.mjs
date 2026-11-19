import { test, expect } from './fixtures.mjs';

const publicPages = ['blocked.html', 'redirect.html'];
const privateFiles = ['styles/blocked.css', 'scripts/blocked.js', 'styles/redirect.css',
  'scripts/redirect.js', 'onboarding/onboarding.html', 'onboarding/onboarding.css',
  'onboarding/onboarding.js'];

async function fetchResources(page, urls) {
  return page.evaluate(async urls => {
    const results = {};
    for (const [path, url] of Object.entries(urls)) {
      try { results[path] = (await fetch(url)).ok; }
      catch { results[path] = false; }
    }
    return results;
  }, urls);
}

test('websites cannot fetch setup or private assets while blocking and redirects survive restart', async ({ extension: e }) => {
  const paths = [...publicPages, ...privateFiles];
  const urls = await e.worker.evaluate(paths => Object.fromEntries(
    paths.map(path => [path, chrome.runtime.getURL(path)])), paths);
  const web = await e.newPage('http://war-probe.bd-e2e.test/');
  expect(await fetchResources(web, urls)).toEqual(Object.fromEntries(
    paths.map(path => [path, publicPages.includes(path)])));

  // Extension-owned pages retain access to every private dependency.
  const popup = await e.openPopup();
  expect(await fetchResources(popup, urls)).toEqual(Object.fromEntries(paths.map(path => [path, true])));

  const blocked = await e.newPage(urls['blocked.html'] + '?reason=daily_limit');
  await expect(blocked.locator('#blockedReason')).toHaveAttribute('data-i18n', 'daily_limit_reached');
  expect(await blocked.evaluate(() => [...document.styleSheets].some(sheet => sheet.cssRules.length > 0))).toBe(true);
  await blocked.locator('#closeBtn').click();
  await expect.poll(() => blocked.isClosed()).toBe(true);

  const target = 'http://war-target.bd-e2e.test/destination?keep=a%26b#fragment';
  await e.seed({ rules: [{ id: 101, blockURL: 'war-source.bd-e2e.test', redirectURL: target,
    category: 'social', isWhitelist: false, assignments: [{ listId: 'general',
      disabledByUser: false, blockingMode: 'always', dailyLimit: null, schedule: null }] }] });
  await e.reconcile(await e.openOptions());
  await expect(await e.newPage('http://war-source.bd-e2e.test/first')).toHaveURL(target);
  await e.restart();
  // Observe the preserved native rule without sending a corrective rule intent.
  await expect(await e.newPage('http://war-source.bd-e2e.test/after-restart')).toHaveURL(target);
  expect(e.pageErrors).toEqual([]);
});
