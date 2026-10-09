import { randomUUID } from 'node:crypto';
import { test, expect, dailyRule, SITE } from './fixtures.mjs';
import { COLD_PAGE, COLD_SCHEDULE, coldMetadata, coldRequests, installColdCollector, injectColdSender,
  assertColdReplies, assertColdState } from './cold-message.mjs';
import { nativeMessageCallbacks } from './native-activity.mjs';

const ids = state => state.dnr.map(rule => rule.id).sort((a, b) => a - b);

test('first content messages cold-wake the worker with persisted paid state, schedule and rule revisions',
  { tag: ['@native-visibility', '@native-activity-log'] }, async ({ extension: e }) => {
    // Fresh-install maintenance, a genuine minute tick, native idle and readers.
    // No existing scenario deadline/retry or production idle setting is changed.
    test.setTimeout(210_000);
    const crossList = { id: 22, blockURL: 'study-cold.bd-e2e.test', redirectURL: '', category: 'social',
      isWhitelist: false, assignments: [{ listId: 'list-1', disabledByUser: false,
        blockingMode: 'always', schedule: null, dailyLimit: null }] };
    await e.seed({ rules: [dailyRule(), crossList], usage: { '21:general': 840 } });
    const token = randomUUID();
    await e.writeLocal(coldMetadata(token));
    const options = await e.openOptions(); await e.reconcile(options);
    const popup = await e.openPopup();
    const alarms = () => e.worker.evaluate(() => chrome.alarms.getAll());
    await expect.poll(async () => (await alarms()).find(alarm => alarm.name === 'check_pro_expiry')?.scheduledTime ?? 0,
      { timeout: 45_000, message: 'fresh-install license alarm advanced' }).toBeGreaterThan(Date.now() + 3_600_000);
    await popup.locator('#focus-duration').fill('10');
    await popup.locator('#focus-hardcore-mode').check();
    await popup.locator('#start-focus-btn').click();
    await expect(popup.locator('#focus-active-view')).toBeVisible();
    await expect.poll(async () => ids(await e.state())).toEqual([21, 22]);
    await e.writeLocal({ focusSchedule: COLD_SCHEDULE });
    const before = await e.state();
    expect(before.focusSession.focusActive && before.focusSession.isHardcore).toBe(true);
    expect(before.rulesGeneration).toBeTruthy(); expect(before.ruleListRevisions['list-1']).toBeTruthy();
    expect(before.ruleListRevisions['list-2']).toBeTruthy();
    const producer = await e.newPage(COLD_PAGE);
    await producer.evaluate(installColdCollector, { token, count: 5 });
    const injected = await e.worker.evaluate(injectColdSender, { url: COLD_PAGE, token, requests: coldRequests(before, token) });
    expect(injected.frames).toEqual([{ frameId: 0, result: { installed: true, count: 5 } }]);
    await producer.bringToFront();
    await expect.poll(async () => (await alarms()).find(alarm => alarm.name === 'update_scheduled_rules')?.scheduledTime - Date.now(),
      { timeout: 65_000, intervals: [200], message: 'genuine minute tick leaves a cold-message window' }).toBeGreaterThan(55_000);
    const evidence = await e.idleUntilMessages(producer, token);
    const activityMarker = evidence.activityMarker;
    assertColdReplies(evidence.firstReplies, before, evidence.earliestAlarm);
    // First-response assertions use the original content packets. Read only
    // native storage/DNR before any reopened reader or corrective intent.
    const after = await e.state(); assertColdState(after, before);
    expect(after.credentials).toEqual(before.credentials);
    const source = { extensionId: e.id, producerUrl: COLD_PAGE };
    const snapshot = () => e.nativeOwner.activity.snapshot(e.id, activityMarker);
    try {
      // Wait for stderr delivery only, without another extension API/message.
      // Native messaging records sender metadata; first content packets above
      // already assert all five request IDs, payloads and exact first replies.
      await expect.poll(() => nativeMessageCallbacks(snapshot(), source).length,
        { timeout: 5000, message: 'native ActivityLog observed the five first callbacks' }).toBe(5);
      const log = snapshot();
      expect(log.errors).toEqual([]);
      const callbacks = nativeMessageCallbacks(log, source);
      expect(callbacks).toHaveLength(5);
      expect(callbacks.map(event => event.count), 'five raw native message records').toEqual([0, 0, 0, 0, 0]);
      const competing = log.events.filter(event => event.category === 'api_event_callback' &&
        event.api === 'alarms.onAlarm' && (event.sequence < callbacks[0].sequence ||
          (event.at >= evidence.detachedAt && event.at <= evidence.firstReplies.completedAt)));
      expect(competing, 'content messages are the first wake source').toEqual([]);
    } finally {
      // Include the complete scoped history even if the activity assertion
      // fails; the owner's stderr tail may otherwise omit the relevant records.
      const activity = snapshot();
      await e.testInfo.attach('cold-first-responses-and-state', { contentType: 'application/json',
        body: JSON.stringify({ before, after, firstReplies: evidence.firstReplies, activityMarker,
          activity, callbacks: nativeMessageCallbacks(activity, source) }) });
    }
    const restoredOptions = await e.openOptions(); const restoredPopup = await e.openPopup();
    await expect(restoredOptions.locator('#focus-session-banner')).toBeVisible();
    await expect(restoredPopup.locator('#focus-active-view')).toBeVisible();
    await expect(restoredOptions.locator('tr[data-rule-id="21"] .daily-limit-status')).toHaveClass(/limit-reached/);
    await e.assertBlocked(`${SITE}/cold-message-budget`, 'focus');
    await e.assertBlocked('http://study-cold.bd-e2e.test/cold-message-focus', 'focus');
    expect(e.pageErrors).toEqual([]);
  });
