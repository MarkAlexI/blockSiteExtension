import assert from 'node:assert/strict';
import { nativeStorageWrite } from './native-activity.mjs';

export const NATIVE_ALARM_BATCH = ['end_focus_session', 'start_scheduled_focus', 'update_scheduled_rules'];
const ids = rules => rules.map(rule => rule.id).sort((a, b) => a - b);
const inactive = { focusActive: false, focusEndTime: 0, isHardcore: false, focusMode: 'blacklist' };

export function assertNativeAlarmBatch({ activity, cold, before, fixture, expired }) {
  assert.deepEqual(activity.errors, [], 'native activity observation retained its complete stream');
  for (const event of activity.events) assert.equal(event.count, 1, 'native activity history is not aggregated');
  const deliveries = activity.events.filter(event => event.category === 'api_event_callback' && event.api === 'alarms.onAlarm');
  assert.deepEqual(deliveries.map(event => event.args?.[0]?.name).sort(), NATIVE_ALARM_BATCH,
    'three native alarm callbacks exactly once, without prescribing delivery order');
  for (const event of deliveries) {
    assert.equal(event.args[0].scheduledTime, fixture.when, 'native batch delivery timestamp');
  }
  const writes = activity.events.map(nativeStorageWrite).filter(write => write?.area === 'local');
  const focus = writes.filter(write => Object.hasOwn(write.values, 'focusSession'));
  if (expired) {
    assert.equal(focus.length, 1, 'expired Focus has one completion write and no transient activation request');
    assert.deepEqual(focus[0].values.focusSession, inactive);
  } else assert.deepEqual(focus, [], 'no stale completion write over the newer manual session');
  assert.deepEqual(cold.focusSession, expired ? inactive : before.focusSession, 'cold durable Focus before UI');
  const expectedIds = expired ? [21] : [21, 22];
  assert.deepEqual(ids(cold.dnr), expectedIds, 'actual cold native DNR');
  const dnrRequests = activity.events.filter(event => event.category === 'api_call' &&
    event.api === 'declarativeNetRequest.updateDynamicRules');
  if (expired) assert.ok(dnrRequests.length > 0, 'Focus cleanup requested native DNR replacement');
  // ActivityLog records API arguments, not successful commits. Inspect all
  // requests, then separately check the native rules actually installed.
  for (const rules of [...dnrRequests.map(event => event.args?.[0]?.addRules || []), cold.dnr]) {
    assert.deepEqual(ids(rules), expectedIds, 'every DNR request agrees with the current blocking state');
    for (const rule of rules) {
      assert.equal(new URL(rule.action.redirect.url).searchParams.get('reason'), expired ? 'daily_limit' : 'focus');
      assert.deepEqual(rule.condition.resourceTypes, ['main_frame']);
    }
  }
  const expectedSchedule = { ...fixture.schedule, handledKeys: expired ? [] : [fixture.current.key] };
  assert.deepEqual(cold.focusSchedule, expectedSchedule, 'durable claim reflects the current occurrence');
  const claims = writes.filter(write => Object.hasOwn(write.values, 'focusSchedule'));
  assert.equal(claims.length, expired ? 0 : 1, 'expired occurrence not claimed; current occurrence claimed once');
  if (!expired) assert.deepEqual(claims[0].values.focusSchedule, expectedSchedule);
  assert.equal(cold.statistics?.successfulFocusSessions ?? 0,
    (before.statistics?.successfulFocusSessions ?? 0) + Number(expired), 'one completion effect');
  for (const key of ['credentials', 'rules', 'ruleLists', 'activeRuleListId', 'rulesGeneration', 'ruleRevisions', 'ruleListRevisions']) {
    assert.deepEqual(cold[key], before[key], `${key} survives idle/wake`);
  }
  assert.deepEqual(cold.dailyRuleUsage.usageSeconds, { '21:general': 840 });
  assert.deepEqual(cold.pendingDailyUsageRemaps, []);
  for (const write of writes.filter(write => Object.hasOwn(write.values, 'dailyRuleUsage'))) {
    assert.deepEqual(write.values.dailyRuleUsage?.usageSeconds, { '21:general': 840 }, 'no transient budget-loss request');
  }
  const alarm = name => fixture.restoredAlarms.find(alarm => alarm.name === name);
  assert.equal(alarm('start_scheduled_focus')?.scheduledTime, fixture.next.startTime, 'next occurrence armed');
  if (expired) assert.equal(alarm('end_focus_session'), undefined, 'completed one-shot removed');
  else assert.equal(alarm('end_focus_session')?.scheduledTime, before.focusSession.focusEndTime, 'newer session end rearmed');
  assert.ok(alarm('update_scheduled_rules')?.scheduledTime > fixture.when, 'native minute alarm advanced');
}
