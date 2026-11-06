import { test, expect, send } from './fixtures.mjs';

async function warm(e, fixture, entry) {
  const page = await e.newPage();
  const cdp = await e.context.newCDPSession(page);
  const preload = [], executed = [];
  cdp.on('Preload.prefetchStatusUpdated', event => preload.push(event));
  page.on('console', message => { if (message.text().startsWith('bd-nvs-executed:')) executed.push(message.text()); });
  try {
    await cdp.send('Preload.enable');
    await page.goto(entry.sourceUrl);
    expect(await page.evaluate(() => HTMLScriptElement.supports('speculationrules'))).toBe(true);
    await expect.poll(() => preload.some(event => event.prefetchUrl === entry.prefetchUrl && event.status === 'Ready'),
      { message: 'native speculative response is Ready, without request interception' }).toBe(true);
    await expect.poll(() => fixture.events.filter(event => event.caseId === entry.id && event.finished).length).toBe(1);
  } catch (error) {
    e.testInfo.annotations.push({ type: 'prefetch-prerequisite', description: 'Native prefetch did not become Ready; blocking was not exercised.' });
    await attach(e, 'prefetch-prerequisite', { entry, preload, requests: fixture.events,
      browserVersion: e.context.browser()?.version(), error: String(error) });
    await cdp.detach(); throw error;
  }
  const response = fixture.events.find(event => event.caseId === entry.id);
  expect(response.url).toBe(entry.prefetchUrl);
  expect(response.purpose).toContain('prefetch');
  expect(executed, 'prefetch must not execute the target document').toEqual([]);
  return { page, cdp, preload, executed, response };
}

async function attach(e, label, evidence) {
  await e.testInfo.attach(label, { contentType: 'application/json', body: JSON.stringify(evidence, null, 2) });
}

test('No-Vary-Search reuses a real prefetch only when material parameters match',
  { tag: '@native-prefetch' }, async ({ extension: e, nativePrefetchServer: fixture }) => {
    await e.seed({ pro: false });
    const evidence = [];
    try {
      for (const changeMaterial of [false, true]) {
        const entry = fixture.createCase(changeMaterial ? 'material-change' : 'tracking-only', { changeMaterial });
        const observed = await warm(e, fixture, entry);
        try {
          await observed.page.locator('#navigate').click();
          await expect(observed.page).toHaveURL(entry.navigationUrl);
          await expect(observed.page.locator('#allowed-resource')).toBeVisible();
          const token = await observed.page.locator('body').getAttribute('data-response-token');
          const requests = fixture.events.filter(event => event.caseId === entry.id);
          if (changeMaterial) {
            expect(requests).toHaveLength(2);
            expect(token).not.toBe(observed.response.token);
            expect(requests[1].purpose).not.toContain('prefetch');
          } else {
            expect(requests, 'different tracking parameter must not trigger another target request').toHaveLength(1);
            expect(token, 'navigation must execute the actual prefetched body').toBe(observed.response.token);
          }
          expect(observed.executed).toEqual(['bd-nvs-executed:' + token]);
          evidence.push({ entry, token, requests, preload: observed.preload });
        } finally { await observed.cdp.detach(); await observed.page.close(); }
      }
    } finally { await attach(e, 'no-vary-search-controls', { evidence, requests: fixture.events }); }
  });

test('a rule enabled after No-Vary-Search prefetch blocks the final navigation without executing cached content',
  { tag: '@native-prefetch' }, async ({ extension: e, nativePrefetchServer: fixture }) => {
    await e.seed({ pro: false });
    const options = await e.openOptions();
    const entry = fixture.createCase('block-after-prefetch');
    const observed = await warm(e, fixture, entry);
    try {
      const blockURL = fixture.origin.replace('https://', '') + '/target';
      const reply = await send(options, 'rules:add', { blockURL, redirectURL: '', category: 'social',
        assignment: { listId: 'general', blockingMode: 'always', schedule: null, dailyLimit: null } });
      expect(reply.success, JSON.stringify(reply)).toBe(true);
      const state = await e.state();
      expect(state.rules).toHaveLength(1);
      expect(state.dnr.some(rule => rule.condition.urlFilter === `||${blockURL}`)).toBe(true);
      await observed.page.locator('#navigate').click();
      await expect(observed.page).toHaveURL(new RegExp(`^chrome-extension://${e.id}/blocked\\.html`));
      expect(new URL(observed.page.url()).searchParams.get('reason')).toBe('always');
      await expect(observed.page.locator('#blockedHeading')).toBeVisible();
      await expect(observed.page.locator('#allowed-resource')).toHaveCount(0);
      expect(observed.executed, 'DNR must prevent content execution, not just redirect after commit').toEqual([]);
      expect((await e.state()).rules).toEqual(state.rules);
    } finally {
      await attach(e, 'no-vary-search-blocking', { entry, preload: observed.preload,
        finalUrl: observed.page.url(), executed: observed.executed, requests: fixture.events });
      await observed.cdp.detach();
    }
  });
