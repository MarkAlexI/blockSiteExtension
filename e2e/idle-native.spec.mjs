import { test, expect, dailyRule, SITE } from './fixtures.mjs';

const ids = state => state.dnr.map(rule => rule.id).sort((a, b) => a - b);
const alarms = e => e.worker.evaluate(() => chrome.alarms.getAll());

test('automatic idle unload and native Focus-completion alarm wake restore budget, session, UI and DNR',
  { tag: '@native-visibility' }, async ({ extension: e }) => {
    // Includes fresh-install maintenance, a genuine minute tick and a native
    // one-minute Focus Session. Existing scenario deadlines are unchanged.
    test.setTimeout(210_000);
    const crossList = { id: 22, blockURL: 'study-idle.bd-e2e.test', redirectURL: '',
      category: 'social', isWhitelist: false, assignments: [{ listId: 'list-1',
        disabledByUser: false, blockingMode: 'always', schedule: null, dailyLimit: null }] };
    await e.seed({ rules: [dailyRule(), crossList], usage: { '21:general': 840 } });
    const options = await e.openOptions();
    await e.reconcile(options);
    const popup = await e.openPopup(); // Popup reader in a tab; toolbar coverage is separate.
    expect(ids(await e.state())).toEqual([21]);

    // Let fresh-install license maintenance finish while its dummy-key HTTP
    // route is attached. Keep every production alarm and its cadence intact.
    await expect.poll(async () => (await alarms(e)).find(alarm => alarm.name === 'check_pro_expiry')?.scheduledTime ?? 0,
      { timeout: 45_000, message: 'initial native license alarm advanced to its daily occurrence' })
      .toBeGreaterThan(Date.now() + 3_600_000);
    // Start shortly BEFORE a real minute tick. Focus then ends 50+ seconds
    // after that tick, before the following minute alarm: it must be the
    // first event that wakes the dormant worker. No alarm is cleared/rearmed.
    await expect.poll(async () => {
      const next = (await alarms(e)).find(alarm => alarm.name === 'update_scheduled_rules');
      const remaining = next?.scheduledTime - Date.now();
      return remaining >= 6000 && remaining <= 10_000;
    }, { timeout: 65_000, intervals: [200], message: 'start real Focus before the native minute tick' }).toBe(true);
    await popup.locator('#focus-duration').fill('1');
    await popup.locator('#start-focus-btn').click();
    await expect(popup.locator('#focus-active-view')).toBeVisible();
    await expect(options.locator('#focus-session-banner')).toBeVisible();
    await expect.poll(async () => ids(await e.state())).toEqual([21, 22]);
    await expect.poll(async () => {
      const next = (await alarms(e)).find(alarm => alarm.name === 'update_scheduled_rules');
      return next?.scheduledTime - Date.now();
    }, { timeout: 20_000, message: 'detach just after a real minute tick, leaving time for automatic idle unload' })
      .toBeGreaterThan(50_000);
    const before = await e.state();
    expect(before.dailyRuleUsage.usageSeconds).toEqual({ '21:general': 840 });
    expect(before.pendingDailyUsageRemaps).toEqual([]);
    const cycle = await e.idleUntilAlarm({ alarmName: 'end_focus_session' });

    // The cold production alarm handler must change stored Focus and DNR.
    // Poll only native storage/DNR, before any UI or corrective runtime intent.
    // This is eventual completion, not an assertion about sub-task stale states.
    await expect.poll(async () => {
      const state = await e.state();
      return { active: state.focusSession.focusActive, dnr: ids(state) };
    }).toEqual({ active: false, dnr: [21] });
    const after = await e.state();
    expect(after.focusSession).toEqual({ focusActive: false, focusEndTime: 0, isHardcore: false, focusMode: 'blacklist' });
    expect(after.credentials).toEqual(before.credentials);
    expect(after.rules).toEqual(before.rules);
    expect(after.ruleLists).toEqual(before.ruleLists);
    expect(after.activeRuleListId).toBe(before.activeRuleListId);
    expect(after.rulesGeneration).toBe(before.rulesGeneration);
    expect(after.ruleRevisions).toEqual(before.ruleRevisions);
    expect(after.dailyRuleUsage.usageSeconds).toEqual({ '21:general': 840 });
    expect(after.pendingDailyUsageRemaps).toEqual([]);
    expect(ids(after)).toEqual([21]);
    const restoredAlarms = await alarms(e);
    expect(cycle.alarm.scheduledTime).toBe(before.focusSession.focusEndTime);
    expect(restoredAlarms.some(alarm => alarm.name === 'end_focus_session')).toBe(false);
    expect(restoredAlarms.find(alarm => alarm.name === 'update_scheduled_rules')?.scheduledTime)
      .toBeGreaterThan(cycle.alarm.scheduledTime);
    expect(cycle.idleAt).toBeLessThan(cycle.alarm.scheduledTime);

    const restoredOptions = await e.openOptions();
    const restoredPopup = await e.openPopup();
    await expect(restoredOptions.locator('#focus-session-banner')).toBeHidden();
    await expect(restoredPopup.locator('#focus-active-view')).toBeHidden();
    await expect(restoredPopup.locator('#focus-start-view')).toBeVisible();
    await expect(restoredOptions.locator('tr[data-rule-id="21"] .daily-limit-status')).toHaveClass(/limit-reached/);
    await e.assertBlocked(`${SITE}/budget-after-wake`, 'daily_limit');
    const allowed = await e.newPage('http://study-idle.bd-e2e.test/after-stop');
    await expect(allowed).toHaveURL('http://study-idle.bd-e2e.test/after-stop');
    expect(e.pageErrors).toEqual([]);
  });
