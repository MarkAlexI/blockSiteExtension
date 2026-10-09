import assert from 'node:assert/strict';
import { StringDecoder } from 'node:string_decoder';

export const NATIVE_ACTIVITY_ARGS = ['--enable-extension-activity-logging',
  '--enable-extension-activity-log-testing', '--enable-logging=stderr', '--vmodule=activity_log=1'];

// ActivityLog::LogAction / Action::PrintForDebug, emitted by Chromium itself.
// Read the owner's stderr without attaching to a worker or changing its code.
function parseLine(line) {
  // Chrome 151 base::LogMessage::Init strips ../../ but retains the source
  // directory. Keep the native source check; console text is not evidence.
  const source = /^\[[^\]]*:VERBOSE1:(?:chrome\/browser\/extensions\/activity_log\/)?activity_log\.cc(?:\(\d+\)|:\d+)\]\s+(ACTION ID=.*)$/.exec(line);
  if (!source) return null;
  const header = /^ACTION ID=(-?\d+) EXTENSION ID=([a-p]{32}) CATEGORY=(\S+) API=(\S+)(.*)$/.exec(source[1]);
  if (!header) throw new Error('Unrecognized native ActivityLog header');
  const [, actionId, extensionId, category, api, tail] = header;
  const count = / COUNT=(\d+)$/.exec(tail);
  if (!count) throw new Error(`Native ActivityLog omitted count for ${extensionId}/${api}`);
  let args = null;
  if (tail.startsWith(' ARGS=')) {
    const json = tail.slice(6);
    // JSON may contain " COUNT=" or bracket text inside strings. Find the
    // actual array boundary rather than splitting on a payload substring.
    let depth = 0, quoted = false, escaped = false, end = -1;
    for (let i = 0; i < json.length; i++) {
      const char = json[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '[' || char === '{') depth++;
      else if (char === ']' || char === '}') { if (--depth === 0) { end = i + 1; break; } }
    }
    if (end < 0) throw new Error(`Truncated native ActivityLog arguments for ${extensionId}/${api}`);
    args = JSON.parse(json.slice(0, end));
    if (!Array.isArray(args)) throw new Error('Native ActivityLog arguments are not an array');
  }
  return { actionId, extensionId, category, api, args, count: Number(count[1]) };
}

export function createNativeActivityLog({ now = Date.now, limit = 10_000 } = {}) {
  const decoder = new StringDecoder('utf8');
  let pending = '', sequence = 0;
  const events = [], errors = [];
  const line = value => {
    try {
      const parsed = parseLine(value.replace(/\r$/, ''));
      if (!parsed) return;
      if (events.length >= limit) { if (!errors.includes('Native activity history overflow')) errors.push('Native activity history overflow'); return; }
      events.push({ sequence: ++sequence, at: now(), ...parsed });
    } catch (error) { errors.push(String(error)); }
  };
  const consume = value => {
    pending += value;
    let end;
    while ((end = pending.indexOf('\n')) >= 0) { line(pending.slice(0, end)); pending = pending.slice(end + 1); }
  };
  return {
    push: chunk => consume(typeof chunk === 'string' ? chunk : decoder.write(chunk)),
    finish() { consume(decoder.end()); if (pending) { line(pending); pending = ''; } },
    snapshot(extensionId, sinceSequence = 0) {
      return structuredClone({ errors, lastSequence: sequence,
        events: events.filter(event => event.extensionId === extensionId && event.sequence > sinceSequence) });
    }
  };
}

export function nativeStorageWrite(event) {
  if (event.category !== 'api_call') return null;
  if (event.api === 'storage.set' && Array.isArray(event.args)) {
    const [area, values] = event.args;
    return typeof area === 'string' && values && typeof values === 'object' ? { area, values } : null;
  }
  const area = /^storage\.(local|sync|session)\.set$/.exec(event.api)?.[1];
  return area && event.args?.[0] && typeof event.args[0] === 'object' ? { area, values: event.args[0] } : null;
}

// NativeRendererMessagingService logs [sender extension ID, source URL] for
// runtime.onMessage, not the message payload. The content packets independently
// prove the request IDs and their first replies.
export function nativeMessageCallbacks(log, { extensionId, producerUrl }) {
  return log.events.filter(event => event.extensionId === extensionId &&
    event.category === 'api_event_callback' && event.api === 'runtime.onMessage' &&
    Array.isArray(event.args) && event.args.length === 2 &&
    event.args[0] === extensionId && event.args[1] === producerUrl);
}

export function nativeWakeAlarms(alarms, names, lastApiAt) {
  assert.ok(names.length > 0 && new Set(names).size === names.length, 'unique native wake alarm names');
  const selected = names.map(name => {
    const matches = alarms.filter(alarm => alarm.name === name);
    assert.equal(matches.length, 1, `one native ${name} alarm`);
    return matches[0];
  });
  const when = selected[0].scheduledTime;
  assert.ok(Number.isFinite(when) && when - lastApiAt > 45_000, 'a full native idle window before the alarm batch');
  for (const alarm of selected) assert.equal(alarm.scheduledTime, when, 'native wake alarms share one timestamp');
  assert.deepEqual(alarms.filter(alarm => alarm.scheduledTime <= when).map(alarm => alarm.name).sort(), [...names].sort(),
    'only the expected batch can cause the first wake');
  const competing = alarms.filter(alarm => !names.includes(alarm.name));
  for (const alarm of competing) assert.ok(Number.isFinite(alarm.scheduledTime), 'known native competing alarm time');
  return { alarm: selected[0], wakeBefore: competing.length ? Math.min(...competing.map(alarm => alarm.scheduledTime)) : Infinity };
}
