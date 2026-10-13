import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test, expect } from './fixtures.mjs';
import { startNativeWindowManager } from './native-window-manager.mjs';
import { createStartupFixture, startupDailyRule, startupSnapshot, assertStartupBudget, assertStartupDeadline } from './startup-restore.mjs';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const stableKeys = ['credentials', 'settings', 'rules', 'ruleLists', 'activeRuleListId',
  'rulesGeneration', 'ruleRevisions', 'ruleListRevisions'];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const documentFor = (state, url) => state.documents.find(document => document.url === url);
const foreground = (state, url, keys) => {
  const tab = state.tabs.find(tab => tab.url === url);
  const document = documentFor(state, url);
  return tab?.active && tab.status === 'complete' && document?.id &&
    document.visibility === 'visible' && document.focused &&
    state.windows.find(window => window.id === tab.windowId)?.focused &&
    same(state.dailyRuleUsage.lastSample?.assignmentKeys, keys);
};

let desktop;
test.beforeAll(async ({}, testInfo) => { desktop = await startNativeWindowManager(testInfo.outputPath('desktop')); });
test.afterAll(async () => { await desktop?.close(); });

test('native startup session restore retains original tabs, foreground budget, blocking and Hardcore Focus',
  { tag: ['@native-visibility', '@native-startup-restore'] }, async ({ extension: e }, testInfo) => {
    assert.equal(testInfo.project.use.headless, false);
    const fixture = await createStartupFixture(); e.startupFixture = fixture;
    const urls = fixture.urls;
    const token = randomUUID();
    const evidence = { schemaVersion: 1, scenario: '48', scope: 'headed Chromium clean process exit and native startup session restore',
      profile: e.profile, token, urls };
    const read = () => e.worker.evaluate(startupSnapshot, Object.values(urls));
    async function settled(url, keys, dnr) {
      let result;
      await expect.poll(async () => {
        result = await read();
        return foreground(result, url, keys) && same(result.dnr, dnr);
      }, { message: 'original native foreground, persisted accounting and DNR settle after startup' }).toBe(true);
      return result;
    }
    const mark = () => e.worker.evaluate(async token => {
      globalThis.__bdStartupRestore = token;
      await chrome.storage.local.set({ __bdStartupRestore: token });
      await chrome.storage.session.set({ __bdStartupRestore: token });
    }, token);
    function identity(before, after, url, cycle) {
      assert.equal(cycle.profile, evidence.profile, 'same isolated profile');
      assert.equal(after.__bdStartupRestore, token, 'durable local marker survives without reseeding');
      assert.deepEqual(after.marker, { global: null, session: null }, 'both worker global and browser session are new');
      const oldDocument = documentFor(before, url), newDocument = documentFor(after, url);
      assert.notEqual(newDocument.id, oldDocument.id, 'native restoration fetched a new uncached document');
      assert.ok(newDocument.timeOrigin > oldDocument.timeOrigin, 'document belongs to the new browser lifetime');
      assert.ok(fixture.requests.some(request => request.documentId === newDocument.id && request.at >= cycle.launchedAt),
        'original restored URL reached the native loopback server after relaunch');
      for (const key of stableKeys) assert.deepEqual(after[key], before[key], key + ' survives native startup');
    }
    try {
      const always = { id: 22, blockURL: 'startup-blocked.bd-e2e.test', redirectURL: '', category: 'social', isWhitelist: false,
        assignments: [{ listId: 'general', disabledByUser: false, blockingMode: 'always', dailyLimit: null, schedule: null }] };
      await e.seed({ rules: [startupDailyRule(21, urls.active), always, startupDailyRule(23, urls.background)],
        usage: { '21:general': 40, '23:general': 15 } });
      const options = await e.openOptions(); await e.reconcile(options); // Setup only, before either restart.
      const b = await e.newPage(urls.background);
      const a = await e.newPage(urls.active); await a.bringToFront();
      await settled(urls.active, ['21:general'], [22]);
      for (const page of e.context.pages()) if (page !== a && page !== b) await page.close();
      await delay(2200); await mark();
      evidence.budgetBefore = await settled(urls.active, ['21:general'], [22]);
      evidence.budgetCycle = await e.restartSession();
      // No new tab, navigation, focus correction, seed or rules intent occurs
      // between relaunch and these observations of the original restored tabs.
      evidence.budgetAfter = await settled(urls.active, ['21:general'], [22]);
      for (const url of [urls.active, urls.background]) {
        assert.equal(evidence.budgetAfter.tabs.filter(tab => tab.url === url).length, 1, 'exactly one original restored tab');
      }
      identity(evidence.budgetBefore, evidence.budgetAfter, urls.active, evidence.budgetCycle);
      evidence.accounting = assertStartupBudget(evidence.budgetBefore, evidence.budgetAfter, evidence.budgetCycle);
      assertStartupDeadline(evidence.budgetAfter);
      assert.deepEqual(evidence.budgetAfter.focusSession, evidence.budgetBefore.focusSession);

      // A real navigation flushes post-startup elapsed usage. It must charge
      // exactly one native foreground segment and keep the background fixed.
      const aRestored = e.context.pages().find(page => page.url() === urls.active);
      assert.ok(aRestored, 'original restored page is attached, not recreated');
      await delay(2200); await aRestored.goto(urls.active + '?after-startup');
      let sampled;
      await expect.poll(async () => {
        sampled = await e.worker.evaluate(startupSnapshot, [urls.active + '?after-startup', urls.background]);
        return foreground(sampled, urls.active + '?after-startup', ['21:general']) &&
          sampled.dailyRuleUsage.lastSample.timestamp >= documentFor(sampled, urls.active + '?after-startup').timeOrigin;
      }, { message: 'genuine post-startup navigation committed accounting' }).toBe(true);
      const spent = sampled.dailyRuleUsage.usageSeconds['21:general'] - evidence.budgetAfter.dailyRuleUsage.usageSeconds['21:general'];
      assert.ok(spent >= 2, 'restored foreground accrues real elapsed seconds');
      assert.ok(spent <= Math.floor((sampled.at - evidence.budgetAfter.dailyRuleUsage.lastSample.timestamp) / 1000),
        'post-startup foreground is not counted twice');
      assert.equal(sampled.dailyRuleUsage.usageSeconds['23:general'], evidence.budgetAfter.dailyRuleUsage.usageSeconds['23:general']);
      assertStartupDeadline(sampled); evidence.postStartup = sampled;
      await e.assertBlocked('http://startup-blocked.bd-e2e.test/after-startup');

      // Second phase uses a genuine UI start, then keeps one unruled HTTP
      // document. Focus closes the matching daily-limit tabs before this quit.
      const popup = await e.openPopup();
      await popup.locator('#focus-duration').fill('10');
      await popup.locator('#focus-hardcore-mode').check();
      await popup.locator('#start-focus-btn').click();
      await expect(popup.locator('#focus-active-view')).toBeVisible();
      const control = await e.newPage(urls.control); await control.bringToFront();
      for (const page of e.context.pages()) if (page !== control) await page.close();
      await settled(urls.control, [], [21, 22, 23]); await mark();
      evidence.focusBefore = await settled(urls.control, [], [21, 22, 23]);
      assert.equal(evidence.focusBefore.focusSession.focusActive, true);
      assert.equal(evidence.focusBefore.focusSession.isHardcore, true);
      evidence.focusCycle = await e.restartSession();
      evidence.focusAfter = await settled(urls.control, [], [21, 22, 23]);
      assert.equal(evidence.focusAfter.tabs.filter(tab => tab.url === urls.control).length, 1);
      identity(evidence.focusBefore, evidence.focusAfter, urls.control, evidence.focusCycle);
      assert.deepEqual(evidence.focusAfter.focusSession, evidence.focusBefore.focusSession, 'Hardcore Focus retains its exact original deadline');
      assert.deepEqual(evidence.focusAfter.dailyRuleUsage.usageSeconds, evidence.focusBefore.dailyRuleUsage.usageSeconds);
      assert.deepEqual(evidence.focusAfter.pendingDailyUsageRemaps, []);
      assert.equal(evidence.focusAfter.alarms.find(alarm => alarm.name === 'end_focus_session')?.scheduledTime,
        evidence.focusBefore.focusSession.focusEndTime, 'native completion alarm restored');
      assert.equal(evidence.focusAfter.alarms.some(alarm => alarm.name === 'daily_limit_deadline'), false);
      await e.assertBlocked(urls.active, 'focus');
      const finalOptions = await e.openOptions(); const finalPopup = await e.openPopup();
      await expect(finalOptions.locator('#focus-session-banner')).toBeVisible();
      await expect(finalPopup.locator('#focus-active-view')).toBeVisible();
      expect(e.pageErrors).toEqual([]);
    } finally {
      evidence.requests = fixture.requests;
      try { await testInfo.attach('native-startup-session-restore', { contentType: 'application/json', body: JSON.stringify(evidence, null, 2) }); }
      finally { await fixture.close(); }
    }
  });
