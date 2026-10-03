import { chromium } from 'playwright';
import { test as base, expect } from 'playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(process.env.BD_EXTENSION_PATH || path.join(directory, '..'));
const VERIFY_URL = 'https://blockdistraction.com/api/verifyKey';
export const TEST_KEY = 'BD-E2E-VALID-KEY';
export const SITE = 'http://usage.bd-e2e.test';
export const LISTS = [
  { id: 'general', name: 'General', disabledCategories: [] },
  { id: 'list-1', name: 'Study', disabledCategories: [] },
  { id: 'list-2', name: 'Work', disabledCategories: [] }
];
export const assignment = (listId = 'general', minutes = 10) => ({
  listId, disabledByUser: false, blockingMode: 'daily_limit', schedule: null, dailyLimit: { minutes }
});
export const dailyRule = (id = 21, listId = 'general') => ({
  id, blockURL: 'usage.bd-e2e.test', redirectURL: '', category: 'social', isWhitelist: false,
  assignments: [assignment(listId)]
});
export const basicPayload = blockURL => ({
  blockURL, redirectURL: '', category: 'social',
  assignment: { listId: 'general', blockingMode: 'always', schedule: null, dailyLimit: null }
});
export const paidPayload = blockURL => ({ ...basicPayload(blockURL), assignment: assignment() });

export async function send(page, type, payload = {}) {
  return page.evaluate(async message => {
    return new Promise((resolve, reject) => chrome.runtime.sendMessage(message, response => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message)); else resolve(response);
    }));
  }, { type, payload });
}

export async function addUi(page, blockURL, { dailyMinutes = null } = {}) {
  await page.locator('#add-rule').click();
  const row = page.locator('#rules-container tr').filter({ has: page.locator('.save-btn') });
  await expect(row).toHaveCount(1);
  await row.locator('td').nth(0).locator('input').fill(blockURL);
  if (dailyMinutes !== null) {
    await row.locator('.blocking-mode-select').selectOption('daily_limit');
    await row.locator('.daily-limit-minutes').fill(String(dailyMinutes));
  }
  await row.locator('.save-btn').click();
  await expect(page.locator('#rules-container tr[data-rule-id]').filter({ hasText: blockURL })).toHaveCount(1);
}

class ExtensionHarness {
  constructor(profile, testInfo, manifest) {
    this.profile = profile;
    this.testInfo = testInfo;
    this.manifest = manifest;
    this.context = null;
    this.worker = null;
    this.options = [];
    this.pageErrors = [];
    this.verificationCalls = [];
    this.verificationHandler = async () => ({ status: 200, body: { isPro: true } });
    this.releaseVerification = null;
    this.traceStarted = false;
  }

  async launch() {
    // A unique test profile is mandatory. Never connect to a personal browser.
    this.context = await chromium.launchPersistentContext(this.profile, {
      channel: 'chromium',
      headless: this.testInfo.project.use.headless !== false,
      locale: 'en-US',
      viewport: { width: 1280, height: 900 },
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    });
    await this.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    this.traceStarted = true;
    await this.context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.href === VERIFY_URL) {
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204,
          headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS',
            'access-control-allow-headers': 'Content-Type' } });
        const data = request.postDataJSON();
        // Only dummy keys seeded by this suite are accepted by the mock.
        if (data?.key !== TEST_KEY) return route.abort();
        this.verificationCalls.push({ version: data.version, serviceWorker: Boolean(request.serviceWorker()) });
        const reply = await this.verificationHandler();
        return route.fulfill({ status: reply.status, contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(reply.body) });
      }
      if (url.protocol === 'http:' && url.hostname.endsWith('.bd-e2e.test')) {
        return route.fulfill({ status: 200, contentType: 'text/html', body:
          '<!doctype html><html><head><title>BD E2E fixture</title></head><body><h1>BD E2E fixture</h1><p>Local synthetic page.</p></body></html>' });
      }
      if (['chrome-extension:', 'about:', 'data:'].includes(url.protocol)) return route.continue();
      // No production requests, purchases or real licenses are involved.
      return route.abort();
    });
    this.worker = this.context.serviceWorkers()[0] ||
      await this.context.waitForEvent('serviceworker', { timeout: 20_000 });
    this.id = new URL(this.worker.url()).host;
    await expect.poll(async () => this.worker.evaluate(async () =>
      (await chrome.storage.local.get('is_migrated_to_local')).is_migrated_to_local), { timeout: 20_000 }).toBe(true);
    for (const page of this.context.pages()) {
      if (page.url() !== 'about:blank') await page.close();
    }
  }

  async seed({ pro = true, legacy = false, rules = [], usage = {}, active = 'general', pending = [], rawUsage = null } = {}) {
    await this.worker.evaluate(async input => {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      await chrome.storage.sync.set({
        credentials: { isPro: input.pro, licenseKey: input.pro ? input.key : null, expiryDate: null,
          installationDate: input.legacy ? '2024-01-01T00:00:00.000Z' : '2026-08-01T00:00:00.000Z', isLegacyUser: input.legacy },
        settings: { mode: 'normal', enablePassword: false, debugMode: false, focusSessionSound: false }
      });
      await chrome.storage.local.set({
        is_migrated_to_local: true, rules: input.rules, ruleLists: input.lists, activeRuleListId: input.active,
        pendingDailyUsageRemaps: input.pending,
        dailyRuleUsage: input.rawUsage ? { ...input.rawUsage, date } : { version: 2, date, usageSeconds: input.usage, lastSample: null },
        focusSession: { focusActive: false, focusEndTime: 0, isHardcore: false, focusMode: 'blacklist' },
        telemetryConsent: { version: 1, enabled: false, decidedAt: now.getTime() }, lastCheck: now.getTime()
      });
    }, { pro, legacy, rules, usage, active, pending, rawUsage, key: TEST_KEY, lists: LISTS });
  }

  async openOptions() {
    const page = await this.context.newPage();
    page.on('pageerror', error => this.pageErrors.push(error.message));
    page.on('dialog', dialog => dialog.type() === 'prompt' ? dialog.dismiss() : dialog.accept());
    await page.goto(`chrome-extension://${this.id}/options/options.html`);
    await expect(page.locator('#ext-version')).toContainText(this.manifest.version);
    await expect(page.locator('#add-rule')).toBeVisible();
    const { credentials } = await this.state();
    const paid = credentials.isPro || Date.parse(credentials.installationDate) < Date.parse('2026-01-01T00:00:00Z');
    if (paid) await expect(page.locator('#add-whitelist-rule')).toBeEnabled();
    else await expect(page.locator('#add-whitelist-rule')).toBeDisabled();
    if (paid) await expect(page.locator('#rule-lists-container .rule-list-card.active-profile')).toBeVisible();
    this.options.push(page);
    return page;
  }

  async state() {
    return this.worker.evaluate(async () => {
      const local = await chrome.storage.local.get(['rules', 'ruleLists', 'activeRuleListId', 'dailyRuleUsage', 'pendingDailyUsageRemaps']);
      const { credentials } = await chrome.storage.sync.get('credentials');
      return { ...local, credentials, dnr: await chrome.declarativeNetRequest.getDynamicRules() };
    });
  }

  async writeLocal(values) { await this.worker.evaluate(values => chrome.storage.local.set(values), values); }

  async reconcile(page) {
    const active = (await this.state()).activeRuleListId;
    const response = await send(page, 'rules:activateList', { listId: active });
    expect(response.success, JSON.stringify(response)).toBe(true);
  }

  holdVerification() {
    const ready = new Promise(resolve => { this.verificationReady = resolve; });
    const held = new Promise(resolve => { this.releaseVerification = resolve; });
    this.verificationHandler = async () => {
      this.verificationReady();
      await held;
      return { status: 200, body: { isPro: true } };
    };
    return ready;
  }

  async assertBlocked(url, reason = null) {
    const page = await this.context.newPage();
    await page.goto(url);
    await expect(page).toHaveURL(new RegExp(`^chrome-extension://${this.id}/blocked\\.html`));
    if (reason) expect(new URL(page.url()).searchParams.get('reason')).toBe(reason);
    return page;
  }

  async saveTrace(label) {
    if (!this.traceStarted) return;
    const filename = this.testInfo.outputPath(`${label}.zip`);
    await this.context.tracing.stop({ path: filename });
    this.traceStarted = false;
    await this.testInfo.attach(label, { path: filename, contentType: 'application/zip' });
  }

  async restart() {
    await this.saveTrace('before-restart-trace');
    await this.context.close();
    this.options = [];
    await this.launch();
  }

  async close() {
    this.releaseVerification?.();
    if (this.context) {
      try {
        if (this.worker) await this.testInfo.attach('final-extension-state', {
          body: JSON.stringify(await this.state(), null, 2), contentType: 'application/json'
        });
        for (let index = 0; index < this.options.length; index++) {
          const page = this.options[index];
          if (!page.isClosed()) await this.testInfo.attach(`options-${index + 1}`, {
            body: await page.screenshot({ fullPage: true }), contentType: 'image/png'
          });
        }
        await this.saveTrace('browser-trace');
      } finally { await this.context.close(); }
    }
  }
}

export const test = base.extend({
  extension: async ({}, use, testInfo) => {
    const manifest = JSON.parse(await readFile(path.join(extensionPath, 'manifest.json'), 'utf8'));
    const expectedVersion = process.env.BD_EXPECTED_VERSION || '5.3.15';
    expect(manifest.version, 'The test target version must match BD_EXPECTED_VERSION').toBe(expectedVersion);
    expect(manifest.background.service_worker).toBe('scripts/service_worker.js');
    const profile = await mkdtemp(path.join(tmpdir(), 'bd-e2e-'));
    const harness = new ExtensionHarness(profile, testInfo, manifest);
    try {
      try { await harness.launch(); }
      catch (error) {
        testInfo.annotations.push({ type: 'environment', description: 'Browser launch failed before the scenario body started.' });
        throw error;
      }
      await harness.seed();
      await use(harness);
      expect(harness.pageErrors, 'Unexpected Options page errors').toEqual([]);
    } finally {
      try { await harness.close(); }
      finally { await rm(profile, { recursive: true, force: true }); }
    }
  }
});
export { expect };
