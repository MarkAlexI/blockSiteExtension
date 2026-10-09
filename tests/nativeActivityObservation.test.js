import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeActivityLog, nativeStorageWrite, nativeWakeAlarms, NATIVE_ACTIVITY_ARGS } from '../e2e/native-activity.mjs';
import { nativeChromiumArgs } from '../e2e/native-launch.mjs';

const id = 'a'.repeat(32), other = 'b'.repeat(32);
const line = (api, args, { extension = id, category = 'api_call', count = 1 } = {}) =>
  `[12:34:1009/120000.000000:VERBOSE1:activity_log.cc(781)] ACTION ID=-1 EXTENSION ID=${extension} CATEGORY=${category} API=${api} ARGS=${JSON.stringify(args)} COUNT=${count}\n`;

test('native activity stream model handles every UTF-8 split and preserves native callback order', () => {
  const input = Buffer.from(line('alarms.onAlarm', [{ name: 'end_focus_session', scheduledTime: 60_000 }],
    { category: 'api_event_callback' }) + line('storage.set', ['local', { label: 'Фокус 🕒' }]));
  for (let offset = 0; offset <= input.length; offset++) {
    const logger = createNativeActivityLog({ now: () => 60_001 });
    logger.push(input.subarray(0, offset)); logger.push(input.subarray(offset)); logger.finish();
    const result = logger.snapshot(id);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.events.map(event => event.api), ['alarms.onAlarm', 'storage.set']);
    assert.deepEqual(result.events.map(event => event.sequence), [1, 2]);
    assert.equal(result.events[1].args[1].label, 'Фокус 🕒');
  }
});

test('native activity stream model parses payload delimiters inside JSON strings and native metadata', () => {
  const logger = createNativeActivityLog();
  logger.push(line('storage.set', ['local', { text: ' COUNT=99 ] \\" ARGS=[', nested: { rules: [1, 2] } }])
    .replace(' COUNT=1', ' PAGE_URL=http://fixture.test OTHER={"extra":"test"} COUNT=1'));
  const result = logger.snapshot(id);
  assert.deepEqual(result.errors, []);
  assert.equal(result.events[0].count, 1);
  assert.deepEqual(result.events[0].args[1].nested, { rules: [1, 2] });
});

test('native activity stream model accepts both Chromium source-location formats', () => {
  const logger = createNativeActivityLog();
  logger.push(line('storage.set', ['local', {}]));
  logger.push(line('storage.set', ['session', { fence: 'token' }]).replace('activity_log.cc(781)', 'activity_log.cc:781'));
  assert.deepEqual(logger.snapshot(id).errors, []);
  assert.deepEqual(logger.snapshot(id).events.map(event => event.args[0]), ['local', 'session']);
});

test('native activity stream model ignores console lookalikes and ordinary browser diagnostics', () => {
  const logger = createNativeActivityLog();
  logger.push('DBus warning\n' + 'ACTION ID=-1 EXTENSION ID=' + id + ' CATEGORY=api_call API=storage.set ARGS=[] COUNT=1\n');
  logger.push('[12:34:1009:INFO:CONSOLE(0)] "' + line('storage.set', ['local', {}]).trim() + '"\n');
  assert.deepEqual(logger.snapshot(id).events, []);
});

test('native activity stream model exposes malformed/truncated native arguments instead of losing history', () => {
  for (const input of [line('storage.set', ['local', {}]).replace('ARGS=["local",{}]', 'ARGS=["local",{'),
    line('storage.set', []).replace(' COUNT=1', ''),
    line('storage.set', []).replace('ACTION ID=-1', 'ACTION ID=broken')]) {
    const logger = createNativeActivityLog(); logger.push(input); logger.finish();
    assert.equal(logger.snapshot(id).errors.length, 1);
  }
});

test('native activity stream model scopes detached history and returns independent snapshots', () => {
  const logger = createNativeActivityLog();
  logger.push(line('storage.set', ['session', { fence: 'token' }]));
  const marker = logger.snapshot(id).lastSequence;
  logger.push(line('alarms.onAlarm', [{}], { extension: other, category: 'api_event_callback' }));
  logger.push(line('alarms.onAlarm', [{ name: 'end_focus_session' }], { category: 'api_event_callback' }));
  const result = logger.snapshot(id, marker);
  assert.equal(result.events.length, 1); assert.equal(result.events[0].sequence, 3);
  result.events[0].args[0].name = 'changed';
  assert.equal(logger.snapshot(id, marker).events[0].args[0].name, 'end_focus_session');
});

test('native activity stream model rejects silent overflow', () => {
  const logger = createNativeActivityLog({ limit: 1 });
  logger.push(line('storage.set', []) + line('alarms.onAlarm', [], { category: 'api_event_callback' }));
  assert.deepEqual(logger.snapshot(id).errors, ['Native activity history overflow']);
});

test('native storage activity model distinguishes local/session writes, names and payloads', () => {
  const local = { category: 'api_call', api: 'storage.set', args: ['local', { focusSession: {} }] };
  assert.deepEqual(nativeStorageWrite(local), { area: 'local', values: { focusSession: {} } });
  assert.deepEqual(nativeStorageWrite({ ...local, api: 'storage.session.set', args: [{ fence: 'token' }] }),
    { area: 'session', values: { fence: 'token' } });
  for (const event of [{ ...local, category: 'api_event_callback' }, { ...local, api: 'storage.get' },
    { ...local, args: [null, {}] }]) assert.equal(nativeStorageWrite(event), null);
});

test('native activity flags are opt-in for the owned browser; defaults and profile remain intact', () => {
  const config = { profile: '/private/test-profile', port: 9222, headless: true };
  const normal = nativeChromiumArgs(config), observed = nativeChromiumArgs({ ...config, activityLog: true });
  for (const flag of NATIVE_ACTIVITY_ARGS) { assert.ok(!normal.includes(flag)); assert.ok(observed.includes(flag)); }
  assert.ok(observed.includes('--user-data-dir=/private/test-profile'));
  assert.ok(observed.includes('--headless=new')); assert.equal(observed.at(-1), 'about:blank');
  assert.ok(!observed.some(arg => /keep.?alive|idle.?timeout|disable-background-timer/.test(arg)));
});

const batch = ['end_focus_session', 'start_scheduled_focus', 'update_scheduled_rules'];
const alarms = () => [...batch].reverse().map(name => ({ name, scheduledTime: 60_000 }))
  .concat({ name: 'check_pro_expiry', scheduledTime: 120_000 });
test('native wake model accepts a simultaneous batch and preserves the original single-alarm guarantee', () => {
  const result = nativeWakeAlarms(alarms(), batch, 0);
  assert.equal(result.alarm.name, 'end_focus_session'); assert.equal(result.wakeBefore, 120_000);
  assert.equal(nativeWakeAlarms(alarms().filter(alarm => alarm.name !== batch[1] && alarm.name !== batch[2]), [batch[0]], 0).wakeBefore, 120_000);
});

test('native wake model rejects missing, duplicate, mismatched, early and competing alarms', () => {
  for (const change of [
    values => values.shift(),
    values => values.push(values[0]),
    values => { values[0].scheduledTime++; },
    values => { for (const item of values.slice(0, 3)) item.scheduledTime = 45_000; },
    values => { values.at(-1).scheduledTime = 60_000; },
    values => { values.at(-1).scheduledTime = NaN; }
  ]) {
    const values = alarms(); change(values);
    assert.throws(() => nativeWakeAlarms(values, batch, 0), assert.AssertionError);
  }
  assert.throws(() => nativeWakeAlarms(alarms(), [], 0), /unique native/);
  assert.throws(() => nativeWakeAlarms(alarms(), [batch[0], batch[0]], 0), /unique native/);
});
