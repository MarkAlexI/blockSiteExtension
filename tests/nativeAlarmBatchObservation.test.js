import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNativeAlarmBatch, NATIVE_ALARM_BATCH } from '../e2e/native-alarm-batch.mjs';

const inactive = { focusActive: false, focusEndTime: 0, isHardcore: false, focusMode: 'blacklist' };
const dnr = (id, reason) => ({ id, action: { type: 'redirect', redirect: { url: `chrome-extension://test/blocked.html?reason=${reason}` } },
  condition: { resourceTypes: ['main_frame'] } });
const write = values => ({ category: 'api_call', api: 'storage.set', count: 1, args: ['local', values] });
function model(expired) {
  const before = { focusSession: { focusActive: true, focusEndTime: expired ? 60_000 : 180_000,
    isHardcore: !expired, focusMode: 'blacklist' }, statistics: { successfulFocusSessions: 3 },
    rules: [{ id: 21 }, { id: 22 }], ruleLists: [{ id: 'general' }], activeRuleListId: 'general',
    rulesGeneration: 8, ruleRevisions: { 21: 1 }, ruleListRevisions: { general: 2 }, credentials: { isPro: true } };
  const fixture = { when: 60_000, schedule: { revision: 7, handledKeys: [] },
    current: expired ? null : { key: '2026-10-09@09:00' }, next: { startTime: 86_400_000 },
    restoredAlarms: [{ name: 'start_scheduled_focus', scheduledTime: 86_400_000 },
      { name: 'update_scheduled_rules', scheduledTime: 120_000 },
      ...(!expired ? [{ name: 'end_focus_session', scheduledTime: 180_000 }] : [])] };
  const cold = { ...structuredClone(before), focusSession: expired ? { ...inactive } : { ...before.focusSession },
    focusSchedule: { ...fixture.schedule, handledKeys: expired ? [] : [fixture.current.key] },
    statistics: { successfulFocusSessions: 3 + Number(expired) },
    dailyRuleUsage: { usageSeconds: { '21:general': 840 } }, pendingDailyUsageRemaps: [],
    dnr: expired ? [dnr(21, 'daily_limit')] : [dnr(21, 'focus'), dnr(22, 'focus')] };
  const activity = { errors: [], events: [...NATIVE_ALARM_BATCH].reverse().map(name =>
    ({ category: 'api_event_callback', api: 'alarms.onAlarm', count: 1, args: [{ name, scheduledTime: 60_000 }] })) };
  activity.events.push(expired ? write({ focusSession: inactive }) : write({ focusSchedule: cold.focusSchedule }));
  activity.events.push({ category: 'api_call', api: 'declarativeNetRequest.updateDynamicRules', count: 1, args: [{ addRules: cold.dnr }] });
  return { expired, before, fixture, cold, activity };
}

test('native batch observation model accepts both Focus states and the recorded callback order', () => {
  for (const expired of [true, false]) {
    const value = model(expired); assertNativeAlarmBatch(value);
    value.activity.events.splice(0, 3, ...value.activity.events.slice(0, 3).reverse());
    assertNativeAlarmBatch(value);
  }
});

test('native batch observation model rejects missing, repeated, aggregated and wrong-timestamp deliveries', () => {
  for (const change of [
    value => value.activity.events.shift(),
    value => value.activity.events.push(value.activity.events[0]),
    value => { value.activity.events[0].count = 2; },
    value => { value.activity.events[0].args[0].scheduledTime++; }
  ]) {
    const value = model(true); change(value); assert.throws(() => assertNativeAlarmBatch(value), assert.AssertionError);
  }
});

test('native batch observation model rejects transient activation and manual overwrite despite a correct cold snapshot', () => {
  const expired = model(true); expired.activity.events.push(write({ focusSession: { ...inactive, focusActive: true } }));
  assert.throws(() => assertNativeAlarmBatch(expired), /no transient activation request/);
  const manual = model(false); manual.activity.events.push(write({ focusSession: inactive }));
  assert.throws(() => assertNativeAlarmBatch(manual), /no stale completion write/);
});

test('native batch observation model checks every DNR request as well as actual installed rules', () => {
  const transient = model(false);
  transient.activity.events.push({ category: 'api_call', api: 'declarativeNetRequest.updateDynamicRules', count: 1, args: [{ addRules: [dnr(21, 'daily_limit')] }] });
  assert.throws(() => assertNativeAlarmBatch(transient), /every DNR request/);
  const cold = model(true); cold.cold.dnr.push(dnr(22, 'focus'));
  assert.throws(() => assertNativeAlarmBatch(cold), /actual cold native DNR/);
});

test('native batch observation model rejects lost/repeated claims and duplicate completion effects', () => {
  const missing = model(false); missing.cold.focusSchedule.handledKeys = [];
  assert.throws(() => assertNativeAlarmBatch(missing), /durable claim/);
  const repeated = model(false); repeated.activity.events.push(repeated.activity.events[3]);
  assert.throws(() => assertNativeAlarmBatch(repeated), /claimed once/);
  const completed = model(true); completed.cold.statistics.successfulFocusSessions++;
  assert.throws(() => assertNativeAlarmBatch(completed), /one completion effect/);
});

test('native batch observation model rejects transient budget loss and changed rule metadata', () => {
  const budget = model(false); budget.activity.events.push(write({ dailyRuleUsage: { usageSeconds: {} } }));
  assert.throws(() => assertNativeAlarmBatch(budget), /no transient budget-loss request/);
  const revision = model(false); revision.cold.rulesGeneration++;
  assert.throws(() => assertNativeAlarmBatch(revision), /rulesGeneration survives/);
});

test('native batch observation model rejects stale next/completion alarms and incomplete native logs', () => {
  const next = model(true); next.fixture.restoredAlarms[0].scheduledTime = 60_000;
  assert.throws(() => assertNativeAlarmBatch(next), /next occurrence armed/);
  const completion = model(false); completion.fixture.restoredAlarms.at(-1).scheduledTime = 60_000;
  assert.throws(() => assertNativeAlarmBatch(completion), /newer session end rearmed/);
  const log = model(true); log.activity.errors.push('truncated native log');
  assert.throws(() => assertNativeAlarmBatch(log), /complete stream/);
});
