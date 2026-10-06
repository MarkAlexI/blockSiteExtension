import { test, expect, send, TEST_KEY } from './fixtures.mjs';

const always = listId => ({ listId, disabledByUser: false, blockingMode: 'always', schedule: null, dailyLimit: null });
const rule = (id, listId, blockURL) => ({ id, blockURL, redirectURL: '', category: 'social', isWhitelist: false, assignments: [always(listId)] });
const focus = () => ({ focusActive: true, focusEndTime: Date.now() + 600_000, isHardcore: false, focusMode: 'blacklist' });
const fixtureRules = () => [rule(901, 'general', 'general.bd-e2e.test'), rule(902, 'list-1', 'study.bd-e2e.test')];
const ids = state => state.dnr.map(item => item.id).sort((a, b) => a - b);

for (const trigger of ['manual', 'native alarm']) {
  test(`payment recovery through ${trigger} restores cross-list Focus without re-entering the retained key`, async ({ extension: e }) => {
    await e.seed({ rules: fixtureRules(), active: 'list-1', focus: focus() });
    const a = await e.openOptions(); const b = await e.openOptions();
    await e.reconcile(a);
    expect(ids(await e.state())).toEqual([901, 902]);
    const before = await e.state();
    e.verificationHandler = async () => ({ status: 200, body: { isPro: false, licenseValid: true } });
    expect((await send(a, 'force_sync')).success).toBe(true);
    const suspended = await e.state();
    expect(suspended.credentials.isPro).toBe(false);
    expect(suspended.credentials.licenseKey).toBe(TEST_KEY);
    expect(suspended.activeRuleListId).toBe('general');
    expect(ids(suspended)).toEqual([901]);
    await expect(b.locator('#add-whitelist-rule')).toBeDisabled();
    e.verificationHandler = async () => ({ status: 200, body: { isPro: true, licenseValid: true } });
    const calls = e.verificationCalls.length;
    if (trigger === 'manual') {
      const response = await send(a, 'force_sync');
      expect(response.success).toBe(true); expect(response.isPro).toBe(true); expect(response.syncPending).not.toBe(true);
      expect(ids(await e.state())).toEqual([901, 902]); // Before the reply, not a later UI action.
    } else {
      await e.worker.evaluate(() => chrome.alarms.create('check_pro_expiry', { when: Date.now() + 1000 }));
      await expect.poll(() => e.verificationCalls.length, { timeout: 75_000 }).toBeGreaterThan(calls);
      await expect.poll(async () => ids(await e.state()), { timeout: 75_000 }).toEqual([901, 902]);
    }
    const recovered = await e.state();
    expect(recovered.credentials.isPro).toBe(true); expect(recovered.credentials.licenseKey).toBe(TEST_KEY);
    expect(recovered.activeRuleListId).toBe('general');
    expect(recovered.rules).toEqual(before.rules); expect(recovered.ruleLists).toEqual(before.ruleLists);
    expect(recovered.settings).toEqual(before.settings); expect(recovered.focusSession.focusActive).toBe(true);
    await expect(a.locator('#add-whitelist-rule')).toBeEnabled(); await expect(b.locator('#add-whitelist-rule')).toBeEnabled();
    await e.assertBlocked('http://study.bd-e2e.test/recovered');
  });
}

test('verified Pro survives a real browser capacity limit and the next native alarm installs the repaired rule set', async ({ extension: e }) => {
  const a = await e.openOptions();
  const maximum = await e.worker.evaluate(() => {
    const api = chrome.declarativeNetRequest;
    return Math.min(...[api.MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES,
      api.MAX_NUMBER_OF_DYNAMIC_RULES || api.MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES].filter(n => Number.isInteger(n) && n > 0));
  });
  expect(maximum).toBeGreaterThan(0); expect(maximum).toBeLessThanOrEqual(50_000);
  const general = rule(901, 'general', 'general.bd-e2e.test');
  const overflow = Array.from({ length: maximum }, (_, i) => rule(10000 + i, 'list-1', `quota${i}.bd-e2e.test`));
  await e.seed({ pro: false, retainedKey: true, rules: [general, ...overflow], focus: focus() });
  await e.reconcile(a); expect(ids(await e.state())).toEqual([901]);
  const before = await e.state();
  const response = await send(a, 'force_sync');
  expect(response.success).toBe(true); expect(response.isPro).toBe(true); expect(response.syncPending).toBe(true);
  const pending = await e.state();
  expect(pending.credentials.isPro).toBe(true); expect(pending.credentials.licenseKey).toBe(TEST_KEY);
  expect(pending.rules).toEqual(before.rules); expect(pending.ruleLists).toEqual(before.ruleLists);
  expect(pending.settings).toEqual(before.settings); expect(ids(pending)).toEqual([901]);
  // Fix the oversized storage fixture. Storage invalidates the cached plan;
  // the native scheduled alarm performs the actual synchronization.
  await e.writeLocal({ rules: [general, overflow[0]] });
  await e.worker.evaluate(() => chrome.alarms.create('update_scheduled_rules', { when: Date.now() + 1000 }));
  await expect.poll(async () => ids(await e.state()), { timeout: 75_000 }).toEqual([901, overflow[0].id]);
  expect((await e.state()).credentials.licenseKey).toBe(TEST_KEY);
  await e.assertBlocked('http://quota0.bd-e2e.test/recovered');
});
