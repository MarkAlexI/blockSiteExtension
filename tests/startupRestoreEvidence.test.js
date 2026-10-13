import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'node:http';
import { assertStartupBudget, assertStartupDeadline, createStartupFixture, startupDailyRule } from '../e2e/startup-restore.mjs';
import { doesUrlMatchBlockRule } from '../rules/urlRuleMatcher.js';

function evidence() {
  const before = { dailyRuleUsage: { usageSeconds: { '21:general': 40, '23:general': 15 }, lastSample: { timestamp: 1000 } } };
  const after = { dailyRuleUsage: { usageSeconds: { '21:general': 43, '23:general': 15 },
    lastSample: { timestamp: 13000, assignmentKeys: ['21:general'] } }, at: 13000, pendingDailyUsageRemaps: [],
    alarms: [{ name: 'daily_limit_deadline', scheduledTime: 150000 }] };
  const cycle = { before: { pid: 1 }, after: { pid: 2 }, exit: { exitCode: 0, signalCode: null, observedAt: 3000 }, launchedAt: 11000 };
  return { before, after, cycle };
}

test('startup evidence accepts normal process replacement with conserved native foreground time', () => {
  const { before, after, cycle } = evidence();
  assert.deepEqual(assertStartupBudget(before, after, cycle), { gain: 3, maximumLiveSeconds: 4, closedMs: 8000 });
  assertStartupDeadline(after);
});

test('startup evidence rejects charging the interval when no browser process existed', () => {
  const { before, after, cycle } = evidence(); after.dailyRuleUsage.usageSeconds['21:general'] = 51;
  assert.throws(() => assertStartupBudget(before, after, cycle), /closed-browser interval/);
});

test('startup evidence rejects reset budgets and background-tab charging', () => {
  for (const [key, value, error] of [['21:general', 0, /reset spent budget/], ['23:general', 16, /background tab/]]) {
    const { before, after, cycle } = evidence(); after.dailyRuleUsage.usageSeconds[key] = value;
    assert.throws(() => assertStartupBudget(before, after, cycle), error);
  }
});

test('worker-only restart and forced termination cannot claim startup session restoration', () => {
  for (const mutate of [e => { e.cycle.after.pid = 1; }, e => { e.cycle.exit.signalCode = 'SIGKILL'; },
    e => { e.cycle.launchedAt = 5000; }]) {
    const e = evidence(); mutate(e);
    assert.throws(() => assertStartupBudget(e.before, e.after, e.cycle));
  }
});

test('startup evidence rejects an old deadline that grants a fresh budget', () => {
  const { after } = evidence(); after.alarms[0].scheduledTime = after.at + 180000;
  assert.throws(() => assertStartupDeadline(after), /remaining budget/);
});

test('native startup HTTP fixture produces new uncached documents and accepts only its owned URLs', async t => {
  const fixture = await createStartupFixture(); t.after(() => fixture.close());
  // Native Chrome resolves these test domains through its launch switch.
  // Node's HTTP control uses the same loopback listener and native Host header.
  const request = address => new Promise((resolve, reject) => {
    const url = new URL(address);
    const connection = new URL(fixture.endpoint);
    const req = get({ hostname: connection.hostname, port: connection.port, path: url.pathname + url.search,
      headers: { Host: url.host } }, response => {
      let body = '';
      response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    req.on('error', reject);
  });
  const first = await request(fixture.urls.active), body = first.body;
  assert.equal(first.status, 200); assert.equal(first.headers['cache-control'], 'no-store');
  assert.ok(body.includes(fixture.requests[0].documentId));
  for (const url of [fixture.urls.background, fixture.urls.control]) {
    const response = await request(url); assert.equal(response.status, 200);
  }
  assert.equal(fixture.requests.length, 3);
  assert.equal(new Set(fixture.requests.map(request => request.documentId)).size, 3);
  assert.deepEqual(fixture.requests.map(request => request.host), ['active', 'background', 'control'].map(name => `startup-${name}.bd-e2e.test`));
  await request(fixture.urls.active);
  assert.equal(fixture.requests.length, 4);
  assert.notEqual(fixture.requests[0].documentId, fixture.requests[3].documentId);
  assert.equal(fixture.owns(new URL(fixture.urls.active + '?native')), true);
  assert.equal(fixture.owns(new URL('http://startup-active.bd-e2e.test:1' + new URL(fixture.urls.active).pathname)), false);
  assert.equal(fixture.owns(new URL(fixture.urls.active.replace('startup-active.bd-e2e.test', 'example.com'))), false);
  assert.equal(fixture.owns(new URL(fixture.urls.active.replace('http:', 'https:'))), false);
  assert.equal((await fetch(new URL('/unowned', fixture.endpoint))).status, 404);
  assert.equal(fixture.requests.length, 4);
});

test('startup fixture rules use the production matcher to isolate foreground, background and unruled Focus control', () => {
  const urls = ['http://startup-active.bd-e2e.test:40001/active', 'http://startup-background.bd-e2e.test:40001/background', 'http://startup-control.bd-e2e.test:40001/control'];
  const rules = [startupDailyRule(21, urls[0]), startupDailyRule(23, urls[1])];
  assert.deepEqual(urls.map(url => rules.filter(rule => doesUrlMatchBlockRule(url, rule.blockURL)).map(rule => rule.id)),
    [[21], [23], []]);
  assert.equal(doesUrlMatchBlockRule(urls[0] + '?after-startup', rules[0].blockURL), true);
});
