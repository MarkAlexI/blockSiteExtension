import { test, expect, send, addUi, assignment, dailyRule, basicPayload, paidPayload,
  TEST_KEY, SITE } from './fixtures.mjs';

const rows = page => page.locator('#rules-container tr[data-rule-id]');
const ids = state => state.dnr.map(rule => rule.id).sort((a, b) => a - b);
async function waitRules(extension, length) {
  await expect.poll(async () => (await extension.state()).rules.length).toBe(length);
}
async function waitUsage(extension, key, seconds) {
  await expect.poll(async () => (await extension.state()).dailyRuleUsage.usageSeconds[key]).toBe(seconds);
}
async function waitDnr(extension, expected) {
  await expect.poll(async () => ids(await extension.state())).toEqual(expected);
}

test('two Options callers preserve concurrent additions, UI state and real DNR blocking', async ({ extension: e }) => {
  const a = await e.openOptions();
  const b = await e.openOptions();
  // Real runtime messages from two actual extension pages, not API doubles.
  const responses = await Promise.all([
    send(a, 'rules:add', basicPayload('one.bd-e2e.test')),
    send(b, 'rules:add', basicPayload('two.bd-e2e.test'))
  ]);
  expect(responses.every(item => item.success), JSON.stringify(responses)).toBe(true);
  await waitRules(e, 2);
  const state = await e.state();
  expect(new Set(state.rules.map(rule => rule.id)).size).toBe(2);
  await waitDnr(e, state.rules.map(rule => rule.id).sort((x, y) => x - y));
  await expect(rows(a)).toHaveCount(2);
  await expect(rows(b)).toHaveCount(2);
  await e.assertBlocked('http://one.bd-e2e.test/page');
  await e.assertBlocked('http://two.bd-e2e.test/page');
});

test('UI editing splits a shared Daily Limit target and preserves its exhausted budget', async ({ extension: e }) => {
  const rule = dailyRule(21, 'general');
  rule.assignments.push(assignment('list-1'));
  await e.seed({ rules: [rule], usage: { '21:general': 100, '21:list-1': 840 }, active: 'list-1' });
  const a = await e.openOptions();
  const b = await e.openOptions();
  await e.reconcile(a);
  const row = a.locator('tr[data-rule-id="21"][data-assignment-list-id="list-1"]');
  await row.locator('.actions button').first().click();
  const edit = a.locator('#rules-container tr').filter({ has: a.locator('.save-btn') });
  await edit.locator('td').nth(1).locator('input').fill('http://safe.bd-e2e.test/study');
  await edit.locator('.save-btn').click();
  await waitRules(e, 2);
  const state = await e.state();
  const split = state.rules.find(item => item.id !== 21);
  await waitUsage(e, `${split.id}:list-1`, 840);
  expect(state.dailyRuleUsage.usageSeconds['21:list-1']).toBeUndefined();
  expect(state.dailyRuleUsage.usageSeconds['21:general']).toBe(100);
  expect(state.pendingDailyUsageRemaps).toEqual([]);
  await waitDnr(e, [split.id]);
  await expect(rows(a)).toHaveCount(1);
  await expect(rows(b)).toHaveCount(1);
  await expect(rows(b).locator('.daily-limit-status')).toHaveClass(/limit-reached/);
  const page = await e.context.newPage();
  await page.goto(`${SITE}/watch`);
  await expect(page).toHaveURL('http://safe.bd-e2e.test/study');
  await expect(page.locator('h1')).toHaveText('BD E2E fixture');
});

test('two Options reject a stale shared-rule edit, then refresh and preserve the legacy budget on split and move', async ({ extension: e }) => {
  const rule = dailyRule();
  rule.assignments.push(assignment('list-1'));
  await e.seed({ rules: [rule], active: 'list-2', rawUsage: {
    version: 1, usageSeconds: { '21': 840 }, lastSample: null
  } });
  const a = await e.openOptions();
  const b = await e.openOptions();
  const original = await e.state();
  const revision = state => ({ expectedGeneration: state.rulesGeneration ?? null,
    expectedRevision: state.ruleRevisions?.[21] ?? null, expectedListRevisions: state.ruleListRevisions || {} });
  const edits = [
    { ruleId: 21, assignmentListId: 'list-1', blockURL: rule.blockURL,
      redirectURL: 'http://safe.bd-e2e.test/study', assignment: assignment('list-1') },
    { ruleId: 21, assignmentListId: 'general', blockURL: rule.blockURL,
      redirectURL: '', assignment: assignment('list-2') }
  ];
  const responses = await Promise.all(edits.map((edit, index) =>
    send([a, b][index], 'rules:update', { ...edit, ...revision(original) })));
  expect(responses.filter(response => response.success)).toHaveLength(1);
  const stale = responses.findIndex(response => !response.success);
  expect(responses[stale].error.code).toBe('rules_state_changed');
  const committed = await e.state();
  expect(Object.values(committed.dailyRuleUsage.usageSeconds)).toEqual([840, 840]);
  // Read the committed revision, as a refreshed Options form does. An old form
  // must never overwrite the successful edit or reset either spent budget.
  const retry = await send([a, b][stale], 'rules:update', { ...edits[stale], ...revision(committed) });
  expect(retry.success, JSON.stringify(retry)).toBe(true);
  const state = await e.state();
  expect(state.rules).toHaveLength(2);
  const study = state.rules.find(item => item.assignments.some(a => a.listId === 'list-1'));
  const work = state.rules.find(item => item.assignments.some(a => a.listId === 'list-2'));
  expect(study.id).not.toBe(work.id);
  expect(state.dailyRuleUsage.usageSeconds[`${study.id}:list-1`]).toBe(840);
  expect(state.dailyRuleUsage.usageSeconds[`${work.id}:list-2`]).toBe(840);
  expect(state.pendingDailyUsageRemaps).toEqual([]);
  await waitDnr(e, [work.id]);
  await e.assertBlocked(`${SITE}/work`, 'daily_limit');
});

test('UI deletion and JSON import update both Options, usage and actual navigation', async ({ extension: e }) => {
  await e.seed({ rules: [dailyRule()], usage: { '21:general': 840 } });
  const a = await e.openOptions();
  const b = await e.openOptions();
  await e.reconcile(a);
  await a.locator('tr[data-rule-id="21"] .delete-btn').click();
  await waitRules(e, 0);
  await waitDnr(e, []);
  expect((await e.state()).dailyRuleUsage.usageSeconds).toEqual({});
  await expect(rows(b)).toHaveCount(0);
  const { assignment: always, ...target } = basicPayload('imported.bd-e2e.test');
  const backup = { rules: [{ id: 99, ...target, isWhitelist: false, assignments: [always] }] };
  await a.locator('#importFileInput').setInputFiles({
    name: 'bd-e2e-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup))
  });
  await waitRules(e, 1);
  await waitDnr(e, [1]);
  await expect(rows(a)).toContainText('imported.bd-e2e.test');
  await expect(rows(b)).toContainText('imported.bd-e2e.test');
  expect((await e.state()).dailyRuleUsage.usageSeconds).toEqual({});
  await e.assertBlocked('http://imported.bd-e2e.test/page');
});

test('browser restart recovers a durable remap journal before enforcing the exhausted budget', async ({ extension: e }) => {
  await e.seed({ rules: [dailyRule()], usage: { '21:list-1': 840 }, pending: [
    { oldRuleId: 21, oldListId: 'list-1', newRuleId: 21, newListId: 'general' }
  ] });
  // Seed the exact durable state left after journal commit and before recovery.
  // This is a clean browser restart, not an induced process crash.
  await e.restart();
  const page = await e.openOptions();
  await expect.poll(async () => (await e.state()).pendingDailyUsageRemaps).toEqual([]);
  await waitUsage(e, '21:general', 840);
  expect((await e.state()).dailyRuleUsage.usageSeconds['21:list-1']).toBeUndefined();
  await waitDnr(e, [21]);
  await expect(rows(page).locator('.daily-limit-status')).toHaveClass(/limit-reached/);
  await e.assertBlocked(`${SITE}/recovered`, 'daily_limit');
});

test('browser startup migrates mixed v1 counters using the larger elapsed time', async ({ extension: e }) => {
  const rule = dailyRule();
  rule.assignments.push(assignment('list-1'));
  await e.seed({ rules: [rule], rawUsage: {
    version: 1, usageSeconds: { '21': 840, '21:general': 10, '21:list-1': 900 }, lastSample: null
  } });
  await e.restart();
  await e.openOptions();
  await expect.poll(async () => (await e.state()).dailyRuleUsage.usageSeconds).toEqual({
    '21:general': 840, '21:list-1': 900
  });
  await waitDnr(e, [21]);
  await e.assertBlocked(`${SITE}/migrated`, 'daily_limit');
});

test('real foreground accounting and deadline alarm exhaust a configured Daily Limit', async ({ extension: e }) => {
  const options = await e.openOptions();
  await addUi(options, 'usage.bd-e2e.test', { dailyMinutes: 1 });
  const rule = (await e.state()).rules[0];
  const usage = (await e.state()).dailyRuleUsage;
  await e.writeLocal({ dailyRuleUsage: { ...usage, usageSeconds: { [`${rule.id}:general`]: 55 }, lastSample: null } });
  await e.reconcile(options);
  const browsing = await e.context.newPage();
  await browsing.goto(`${SITE}/foreground`);
  await browsing.bringToFront();
  await expect(browsing.locator('h1')).toHaveText('BD E2E fixture');
  // Real time and chrome.alarms; no clock replacement or manual alarm emit.
  await expect.poll(async () => (await e.state()).dailyRuleUsage.usageSeconds[`${rule.id}:general`],
    { timeout: 75_000, intervals: [500, 1000, 2000] }).toBeGreaterThanOrEqual(60);
  await waitDnr(e, [rule.id]);
  await e.assertBlocked(`${SITE}/after-budget`, 'daily_limit');
});

test('a hidden tab pauses accounting and foreground resume charges only visible time', async ({ extension: e }) => {
  await e.seed({ rules: [dailyRule()], usage: { '21:general': 100 } });
  const options = await e.openOptions();
  await e.reconcile(options);
  const browsing = await e.context.newPage();
  // Playwright forces every page to appear focused by default. Restore native
  // focus/visibility before navigating; never replace document.visibilityState.
  for (const page of [options, browsing]) {
    const session = await e.context.newCDPSession(page);
    await session.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  }
  await browsing.goto(`${SITE}/visibility`);
  await browsing.bringToFront();
  await expect.poll(async () => (await e.state()).dailyRuleUsage.lastSample?.assignmentKeys).toEqual(['21:general']);
  await options.bringToFront();
  await expect.poll(() => browsing.evaluate(() => document.visibilityState)).toBe('hidden');
  await expect.poll(async () => (await e.state()).dailyRuleUsage.lastSample?.assignmentKeys).toEqual([]);
  const paused = (await e.state()).dailyRuleUsage.usageSeconds['21:general'];
  // This measured interval is the assertion target, not a readiness delay.
  await options.waitForTimeout(6000);
  expect((await e.state()).dailyRuleUsage.usageSeconds['21:general']).toBe(paused);
  await browsing.bringToFront();
  await expect.poll(async () => (await e.state()).dailyRuleUsage.lastSample?.assignmentKeys).toEqual(['21:general']);
  await browsing.waitForTimeout(2000);
  await options.bringToFront();
  await expect.poll(async () => (await e.state()).dailyRuleUsage.usageSeconds['21:general']).toBeGreaterThan(paused);
  const used = (await e.state()).dailyRuleUsage.usageSeconds['21:general'];
  expect(used - paused).toBeLessThan(6);
  expect((await e.state()).dnr).toEqual([]);
});

test('UI activation waits for verification while Free actions remain available in another Options', async ({ extension: e }) => {
  await e.seed({ pro: false });
  const a = await e.openOptions();
  const b = await e.openOptions();
  e.holdVerification();
  await a.locator('#proBtn').click();
  await a.locator('#license-key-input').fill(TEST_KEY);
  await a.locator('#license-submit-btn').click();
  try {
    await expect.poll(() => e.verificationCalls.length, { timeout: 3000 }).toBe(1);
    expect(e.verificationCalls[0].serviceWorker).toBe(true);
    expect((await send(b, 'rules:add', basicPayload('free.bd-e2e.test'))).success).toBe(true);
    const rejected = await send(b, 'rules:add', paidPayload('paid.bd-e2e.test'));
    expect(rejected.success).toBe(false);
    expect(rejected.error.code).toBe('pro_required');
    expect((await e.state()).credentials.isPro).toBe(false);
  } finally { e.releaseVerification(); }
  await expect.poll(async () => (await e.state()).credentials.isPro).toBe(true);
  expect((await e.state()).credentials.licenseKey).toBe(TEST_KEY);
  await expect(a.locator('#proWrapper')).toHaveAttribute('inert', '');
  await expect(a.locator('#proBtn')).toBeFocused();
  await expect(b.locator('#add-whitelist-rule')).toBeEnabled();
  expect((await send(b, 'rules:add', paidPayload('paid.bd-e2e.test'))).success).toBe(true);
  await waitRules(e, 2);
  const state = await e.state();
  await waitDnr(e, [state.rules.find(rule => rule.blockURL === 'free.bd-e2e.test').id]);
});

test('UI logout propagates to both Options and rejects subsequent paid intents without reload', async ({ extension: e }) => {
  const a = await e.openOptions();
  const b = await e.openOptions();
  await a.locator('#proBtn').click();
  await a.locator('#log-out-btn').click();
  await expect.poll(async () => (await e.state()).credentials.isPro).toBe(false);
  await expect(a.locator('#add-whitelist-rule')).toBeDisabled();
  await expect(b.locator('#add-whitelist-rule')).toBeDisabled();
  const paid = await send(b, 'rules:add', paidPayload('denied.bd-e2e.test'));
  expect(paid.success).toBe(false);
  expect(paid.error.code).toBe('pro_required');
  await addUi(b, 'allowed-free.bd-e2e.test');
  await waitRules(e, 1);
  const state = await e.state();
  expect(state.credentials.licenseKey).toBeNull();
  await waitDnr(e, [state.rules[0].id]);
  await e.assertBlocked('http://allowed-free.bd-e2e.test/page');
});

test('a paid commit begun before logout finishes before Free credentials are saved', async ({ extension: e }) => {
  const a = await e.openOptions();
  const b = await e.openOptions();
  await b.evaluate(() => {
    window.bdE2E = { order: [], response: null };
    const listener = (changes, area) => {
      if (area === 'local' && changes.rules?.newValue?.some(rule => rule.blockURL === 'ordered.bd-e2e.test')) {
        if (window.bdE2E.order.includes('rules')) return;
        window.bdE2E.order.push('rules');
        chrome.runtime.sendMessage({ type: 'logout_pro' }, response => { window.bdE2E.response = response; });
      }
      if (area === 'sync' && changes.credentials?.newValue?.isPro === false) window.bdE2E.order.push('free');
    };
    chrome.storage.onChanged.addListener(listener);
    window.bdE2E.listener = listener;
  });
  const paid = await send(a, 'rules:add', paidPayload('ordered.bd-e2e.test'));
  expect(paid.success, JSON.stringify(paid)).toBe(true);
  await expect.poll(() => b.evaluate(() => window.bdE2E.response?.success)).toBe(true);
  expect(await b.evaluate(() => window.bdE2E.order)).toEqual(['rules', 'free']);
  await b.evaluate(() => chrome.storage.onChanged.removeListener(window.bdE2E.listener));
  const state = await e.state();
  expect(state.credentials.isPro).toBe(false);
  expect(state.rules[0].assignments[0].blockingMode).toBe('daily_limit');
  expect(state.dnr).toEqual([]);
  const rejected = await send(b, 'rules:add', paidPayload('later.bd-e2e.test'));
  expect(rejected.error.code).toBe('pro_required');
});

test('trusted Legacy keeps advanced controls and paid rule access after UI logout', async ({ extension: e }) => {
  await e.seed({ legacy: true });
  const a = await e.openOptions();
  const b = await e.openOptions();
  await a.locator('#proBtn').click();
  await a.locator('#log-out-btn').click();
  await expect.poll(async () => (await e.state()).credentials.isPro).toBe(false);
  await expect(b.locator('#add-whitelist-rule')).toBeEnabled();
  await addUi(b, 'legacy.bd-e2e.test', { dailyMinutes: 10 });
  const state = await e.state();
  expect(state.credentials.installationDate).toBe('2024-01-01T00:00:00.000Z');
  expect(state.credentials.licenseKey).toBeNull();
  expect(state.rules[0].assignments[0].blockingMode).toBe('daily_limit');
  expect(state.dnr).toEqual([]);
});

test('a temporary verification server error preserves Pro and subsequent paid actions', async ({ extension: e }) => {
  const a = await e.openOptions();
  const b = await e.openOptions();
  e.verificationHandler = async () => ({ status: 500, body: { error: 'E2E temporary failure' } });
  await a.locator('#proBtn').click();
  await a.locator('#force-sync-btn').click();
  await expect.poll(() => e.verificationCalls.length).toBeGreaterThan(0);
  await expect(a.locator('#force-sync-btn')).toBeEnabled();
  const state = await e.state();
  expect(state.credentials.isPro).toBe(true);
  expect(state.credentials.licenseKey).toBe(TEST_KEY);
  await expect(b.locator('#add-whitelist-rule')).toBeEnabled();
  expect((await send(b, 'rules:add', paidPayload('retained-pro.bd-e2e.test'))).success).toBe(true);
  await waitRules(e, 1);
  expect((await e.state()).dnr).toEqual([]);
});
