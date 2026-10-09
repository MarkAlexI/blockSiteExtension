import { test, expect, dailyRule, SITE } from './fixtures.mjs';
import { nativeStorageWrite } from './native-activity.mjs';
import { NATIVE_ALARM_BATCH, assertNativeAlarmBatch } from './native-alarm-batch.mjs';

const ids = state => state.dnr.map(rule => rule.id).sort((a, b) => a - b);
const read = e => e.state(['focusSchedule', 'statistics']);
const alarms = e => e.worker.evaluate(() => chrome.alarms.getAll());

for (const expired of [true, false]) {
  test(expired ? 'native alarm batch after idle completes expired Focus without an expired schedule activation' :
    'native alarm batch after idle preserves newer manual Focus and claims the current schedule once',
  { tag: ['@native-visibility', '@native-activity-log'] }, async ({ extension: e }, testInfo) => {
    test.setTimeout(150_000);
    const evidence = { expired };
    try {
      const crossList = { id: 22, blockURL: 'study-alarms.bd-e2e.test', redirectURL: '', category: 'social',
        isWhitelist: false, assignments: [{ listId: 'list-1', disabledByUser: false,
          blockingMode: 'always', schedule: null, dailyLimit: null }] };
      await e.seed({ rules: [dailyRule(), crossList], usage: { '21:general': 840 } });
      const options = await e.openOptions(); await e.reconcile(options);
      const popup = await e.openPopup(); // Reader tab; real toolbar coverage is separate.
      await expect.poll(async () => ids(await read(e))).toEqual([21]);
      await expect.poll(async () => (await alarms(e)).find(alarm => alarm.name === 'check_pro_expiry')?.scheduledTime ?? 0,
        { timeout: 45_000, message: 'fresh-install license maintenance advanced' }).toBeGreaterThan(Date.now() + 3_600_000);
      expect(e.nativeOwner.activity, 'native browser ActivityLog observer available').toBeTruthy();
      await expect.poll(() => e.nativeOwner.activity.snapshot(e.id).events.some(event => event.api === 'alarms.onAlarm' &&
        event.category === 'api_event_callback' && event.args?.[0]?.name === 'check_pro_expiry'),
      { timeout: 5000, message: 'positive control: genuine warm worker alarm delivery in browser log' }).toBe(true);
      await popup.locator('#focus-duration').fill(expired ? '1' : '3');
      if (!expired) await popup.locator('#focus-hardcore-mode').check();
      await popup.locator('#start-focus-btn').click();
      await expect(popup.locator('#focus-active-view')).toBeVisible();
      await expect.poll(async () => ids(await read(e))).toEqual([21, 22]);
      const before = await read(e); evidence.before = before;
      expect(before.focusSession.focusActive).toBe(true);
      expect(before.focusSession.isHardcore).toBe(!expired);
      await expect.poll(() => e.nativeOwner.activity.snapshot(e.id).events.some(event => {
        const write = nativeStorageWrite(event);
        return write?.area === 'local' && write.values.focusSession?.focusActive === true;
      }), { timeout: 5000, message: 'positive control: real UI Focus storage request observed' }).toBe(true);
      await expect.poll(() => e.nativeOwner.activity.snapshot(e.id).events.some(event => event.api ===
        'declarativeNetRequest.updateDynamicRules' && event.args?.[0]?.addRules?.some(rule => rule.id === 22)),
      { timeout: 5000, message: 'positive control: real Focus DNR request observed' }).toBe(true);
      // Dynamic import is supported in the Options Window, not in a service worker.
      const fixture = await options.evaluate(async expired => {
        const calendar = await import(chrome.runtime.getURL('schedules/focusSchedule.js'));
        const session = (await chrome.storage.local.get('focusSession')).focusSession;
        const now = Date.now();
        const when = expired ? session.focusEndTime : now + 60_000;
        const start = new Date(now); start.setSeconds(0, 0);
        if (expired) start.setMinutes(start.getMinutes() - 2);
        const time = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
        const schedule = { version: 1, enabled: true, days: [0, 1, 2, 3, 4, 5, 6], startTime: time,
          durationMinutes: expired ? 1 : 5, revision: 7, notBefore: 0, handledKeys: [], skippedKeys: [] };
        await chrome.storage.local.set({ focusSchedule: schedule });
        const current = calendar.focusOccurrences(schedule, when).find(item => item.startTime <= when) || null;
        const next = calendar.nextFocusOccurrence({ ...schedule, handledKeys: current ? [current.key] : [] }, when);
        return { when, schedule, current, next, clock: { now, nativeDate: Date.toString().includes('[native code]'),
          nativeNow: Date.now.toString().includes('[native code]'), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } };
      }, expired);
      evidence.fixture = fixture;
      expect(fixture.clock.nativeDate && fixture.clock.nativeNow).toBe(true);
      expect(Boolean(fixture.current)).toBe(!expired);
      expect(fixture.next.startTime).toBeGreaterThan(fixture.when);
      expect((await read(e)).focusSchedule).toEqual(fixture.schedule);
      evidence.positiveControl = e.nativeOwner.activity.snapshot(e.id);
      expect(evidence.positiveControl.errors).toEqual([]);
      const cycle = await e.idleUntilAlarm({ batch: { when: fixture.when,
        names: expired ? NATIVE_ALARM_BATCH : [...NATIVE_ALARM_BATCH].reverse() } });
      evidence.cycle = cycle;
      expect(cycle.activityMarker).not.toBeNull();
      const expectedSchedule = { ...fixture.schedule, handledKeys: expired ? [] : [fixture.current.key] };
      // Reconnected only after passive HTTP discovery observed natural unload
      // and native wake. No UI/status/force-sync intent before these checks.
      await expect.poll(async () => {
        const state = await read(e); evidence.cold = state;
        fixture.restoredAlarms = await alarms(e);
        evidence.activity = e.nativeOwner.activity.snapshot(e.id, cycle.activityMarker);
        return { session: state.focusSession, ids: ids(state), schedule: state.focusSchedule,
          completed: state.statistics?.successfulFocusSessions ?? 0,
          next: fixture.restoredAlarms.find(alarm => alarm.name === 'start_scheduled_focus')?.scheduledTime,
          end: fixture.restoredAlarms.find(alarm => alarm.name === 'end_focus_session')?.scheduledTime ?? null,
          deliveries: evidence.activity.events.filter(event => event.api === 'alarms.onAlarm' && event.category === 'api_event_callback').length };
      }).toEqual({ session: expired ? { focusActive: false, focusEndTime: 0, isHardcore: false, focusMode: 'blacklist' } : before.focusSession,
        ids: expired ? [21] : [21, 22], schedule: expectedSchedule,
        completed: (before.statistics?.successfulFocusSessions ?? 0) + Number(expired), next: fixture.next.startTime,
        end: expired ? null : before.focusSession.focusEndTime, deliveries: 3 });
      assertNativeAlarmBatch({ activity: evidence.activity, cold: evidence.cold, before, fixture, expired });
      evidence.uiOpened = true;
      const restoredOptions = await e.openOptions();
      const restoredPopup = await e.openPopup();
      if (expired) {
        await expect(restoredOptions.locator('#focus-session-banner')).toBeHidden();
        await expect(restoredPopup.locator('#focus-active-view')).toBeHidden();
        await expect(restoredPopup.locator('#focus-start-view')).toBeVisible();
      } else {
        await expect(restoredOptions.locator('#focus-session-banner')).toBeVisible();
        await expect(restoredPopup.locator('#focus-active-view')).toBeVisible();
      }
      await expect(restoredOptions.locator('tr[data-rule-id="21"] .daily-limit-status')).toHaveClass(/limit-reached/);
      await e.assertBlocked(`${SITE}/native-alarm-budget`, expired ? 'daily_limit' : 'focus');
      if (expired) {
        const allowed = await e.newPage('http://study-alarms.bd-e2e.test/after-focus');
        await expect(allowed).toHaveURL('http://study-alarms.bd-e2e.test/after-focus');
      } else await e.assertBlocked('http://study-alarms.bd-e2e.test/current-focus', 'focus');
      evidence.afterUi = await read(e);
      fixture.restoredAlarms = await alarms(e);
      evidence.finalActivity = e.nativeOwner.activity.snapshot(e.id, cycle.activityMarker);
      assertNativeAlarmBatch({ activity: evidence.finalActivity, cold: evidence.afterUi, before, fixture, expired });
      expect(e.pageErrors).toEqual([]);
    } finally {
      evidence.finalActivityLog = e.nativeOwner?.activity?.snapshot(e.id);
      await testInfo.attach('native-alarm-batch', { contentType: 'application/json', body: JSON.stringify(evidence) });
    }
  });
}
