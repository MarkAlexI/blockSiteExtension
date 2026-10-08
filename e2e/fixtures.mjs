import { chromium } from 'playwright';
import { test as base, expect } from 'playwright/test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { launchNativeChromium, prepareNativePages, targetsAt } from './native-launch.mjs';
import { observeNativeIdleWake } from './native-idle.mjs';
import { extensionWorker } from './extension-worker.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectedVersion } from './target-version.mjs';

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

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

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
  await expect(row.locator('td').nth(0).locator('input')).toHaveValue(blockURL);
  if (dailyMinutes !== null) await expect(row.locator('.daily-limit-minutes')).toHaveValue(String(dailyMinutes));
  await row.locator('.save-btn').click();
  await expect(page.locator('#rules-container tr[data-rule-id]').filter({ hasText: blockURL })).toHaveCount(1);
  await expect.poll(async () => page.evaluate(async blockURL => {
    const stored = (await chrome.storage.local.get('rules')).rules.find(rule => rule.blockURL === blockURL);
    const assignment = stored?.assignments?.find(item => item.listId === 'general');
    return { exists: Boolean(stored), url: stored?.blockURL, list: assignment?.listId,
      mode: assignment?.blockingMode, minutes: assignment?.dailyLimit?.minutes ?? null };
  }, blockURL)).toEqual({ exists: true, url: blockURL, list: 'general',
    mode: dailyMinutes === null ? 'always' : 'daily_limit', minutes: dailyMinutes });
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
    this.installed = false;
  }

  async launch({ timezone = this.timezone } = {}) {
    this.timezone = timezone;
    // A unique test profile is mandatory. Never connect to a personal browser.
    const launchOptions = {
      channel: 'chromium',
      executablePath: process.env.BD_CHROMIUM_BINARY || undefined,
      headless: this.testInfo.project.use.headless !== false,
      locale: 'en-US',
      // Process TZ reaches pages and the MV3 worker without a Date/API shim.
      env: timezone ? { ...process.env, TZ: timezone } : undefined,
      viewport: { width: 1280, height: 900 },
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`,
        ...(process.env.BD_E2E_DISABLE_GPU === '1' ? ['--disable-gpu'] : [])]
    };
    if (this.testInfo.tags.includes('@native-visibility')) {
      // A second CDP session cannot release the visibility capture handle
      // held by Playwright's original session. Use the documented noDefaults
      // connection on this fixture's isolated persistent profile.
      const port = await freePort();
      this.nativeOwner = await launchNativeChromium({
        executablePath: launchOptions.executablePath || chromium.executablePath(),
        profile: this.profile, port, headless: launchOptions.headless,
        args: launchOptions.args, env: launchOptions.env
      });
      try {
        const prepared = await prepareNativePages(this.nativeOwner.endpoint, { waitForInstall: !this.installed });
        await this.testInfo.attach('native-pages-before-cdp', {
          contentType: 'application/json', body: JSON.stringify(prepared)
        });
        this.nativeBrowser = await chromium.connectOverCDP(this.nativeOwner.webSocketDebuggerUrl, {
          noDefaults: true, isLocal: true
        });
      } catch (error) {
        try {
          await this.testInfo.attach('native-cdp-setup-failure', {
            contentType: 'application/json', body: JSON.stringify(await this.nativeOwner.diagnostics())
          });
        } catch (diagnosticError) {
          this.testInfo.annotations.push({ type: 'diagnostic', description: String(diagnosticError) });
        }
        throw error;
      }
      [this.context] = this.nativeBrowser.contexts();
      expect(this.context, 'native default browser context').toBeTruthy();
      // Keep a blank tab while closing the install/onboarding tabs below.
      // Native headed Chrome can quit when its last browser window closes.
      if (!this.context.pages().some(page => page.url() === 'about:blank')) await this.context.newPage();
    } else {
      this.context = await chromium.launchPersistentContext(this.profile, launchOptions);
    }
    await this.configureContext();
    const { worker, identity } = await extensionWorker(this.context, this.manifest);
    this.worker = worker;
    this.id = identity.id;
    await this.testInfo.attach('extension-worker', { contentType: 'application/json',
      body: JSON.stringify({ url: worker.url(), ...identity,
        observedWorkers: this.context.serviceWorkers().map(item => item.url()) }) });
    await expect.poll(async () => this.worker.evaluate(async () =>
      (await chrome.storage.local.get('is_migrated_to_local')).is_migrated_to_local), { timeout: 20_000 }).toBe(true);
    if (!this.installed && !this.nativeOwner) {
      // This real onInstalled page is created after the full initialization.
      // Seeding at the earlier migration marker can race startup usage pruning.
      const installUrl = `chrome-extension://${this.id}/options/options.html`;
      await expect.poll(() => this.context.pages().some(page => page.url() === installUrl), {
        timeout: 20_000, message: 'fresh install initialization completed before fixture seed'
      }).toBe(true);
    }
    for (const page of this.context.pages()) {
      if (page.url() !== 'about:blank') await page.close();
    }
    this.installed = true;
  }

  async configureContext() {
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
  }

  async idleUntilAlarm({ alarmName = 'update_scheduled_rules' } = {}) {
    expect(this.nativeOwner, 'idle observation requires an independently owned native browser').toBeTruthy();
    await this.saveTrace('before-idle-trace');
    for (const page of this.context.pages()) {
      if (page.url() !== 'about:blank') await page.close();
    }
    const before = await this.nativeOwner.diagnostics();
    const workerUrl = this.worker.url();
    expect(before.targets.filter(target => target.type === 'service_worker' && target.url === workerUrl)).toHaveLength(1);
    const probe = await this.worker.evaluate(async () => {
      const token = crypto.randomUUID();
      globalThis.__bdIdleLifetime = token;
      await chrome.storage.session.set({ __bdIdleLifetime: token });
      const alarms = await chrome.alarms.getAll();
      return { token, lastApiAt: Date.now(), alarms };
    });
    const minuteAlarm = probe.alarms.find(item => item.name === 'update_scheduled_rules');
    expect(minuteAlarm?.periodInMinutes).toBe(1);
    const alarm = probe.alarms.find(item => item.name === alarmName);
    expect(alarm, 'expected native wake alarm').toBeTruthy();
    expect(alarm.scheduledTime - probe.lastApiAt, 'a full idle window before the native wake alarm').toBeGreaterThan(45_000);
    expect(probe.alarms.filter(item => item.scheduledTime <= alarm.scheduledTime).map(item => item.name)).toEqual([alarmName]);
    const observation = { pid: before.pid, profile: this.profile, workerUrl,
      initialTargets: before.targets, probe, samples: [] };
    try {
      // connectOverCDP Browser.close closes its transport, not this native
      // launch owner. Do not close the persistent context or browser process.
      await this.nativeBrowser.close();
      this.context = this.nativeBrowser = this.worker = null;
      this.options = [];
      observation.detachedAt = Date.now();
      observation.cycle = await observeNativeIdleWake(this.nativeOwner.endpoint, workerUrl, {
        wakeAt: alarm.scheduledTime, lastApiAt: probe.lastApiAt,
        wakeBefore: alarmName === 'end_focus_session' ? minuteAlarm.scheduledTime : Infinity,
        onSample: sample => observation.samples.push(sample)
      });
      observation.after = await this.nativeOwner.diagnostics();
      expect(observation.after.pid).toBe(before.pid);
      expect(observation.after.exitCode).toBeNull();
      expect(observation.after.signalCode).toBeNull();
      expect(observation.after.webSocketDebuggerUrl).toBe(before.webSocketDebuggerUrl);
      // Reconnect only after HTTP discovery has observed both unload and wake.
      this.nativeBrowser = await chromium.connectOverCDP(this.nativeOwner.webSocketDebuggerUrl, {
        noDefaults: true, isLocal: true
      });
      [this.context] = this.nativeBrowser.contexts();
      expect(this.context).toBeTruthy();
      await this.configureContext();
      const { worker, identity } = await extensionWorker(this.context, this.manifest);
      expect(identity.id).toBe(this.id);
      this.worker = worker;
      const restored = await worker.evaluate(async () => ({
        global: globalThis.__bdIdleLifetime ?? null,
        session: (await chrome.storage.session.get('__bdIdleLifetime')).__bdIdleLifetime ?? null
      }));
      expect(restored).toEqual({ global: null, session: probe.token });
      observation.restored = restored;
      return { ...observation.cycle, alarm };
    } catch (error) {
      observation.error = error.stack || String(error);
      observation.after ??= await this.nativeOwner.diagnostics();
      throw error;
    } finally {
      await this.testInfo.attach('native-idle-wake', {
        contentType: 'application/json', body: JSON.stringify(observation)
      });
    }
  }

  async seed({ pro = true, legacy = false, rules = [], usage = {}, active = 'general', pending = [], rawUsage = null, retainedKey = false, focus = null } = {}) {
    await this.worker.evaluate(async input => {
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      await chrome.storage.sync.set({
        credentials: { isPro: input.pro, licenseKey: (input.pro || input.retainedKey) ? input.key : null, expiryDate: null,
          installationDate: input.legacy ? '2024-01-01T00:00:00.000Z' : '2026-08-01T00:00:00.000Z', isLegacyUser: input.legacy },
        settings: { mode: 'normal', enablePassword: false, debugMode: false, focusSessionSound: false }
      });
      await chrome.storage.local.set({
        is_migrated_to_local: true, rules: input.rules, ruleLists: input.lists, activeRuleListId: input.active,
        pendingDailyUsageRemaps: input.pending,
        dailyRuleUsage: input.rawUsage ? { ...input.rawUsage, date } : { version: 2, date, usageSeconds: input.usage, lastSample: null },
        focusSession: input.focus || { focusActive: false, focusEndTime: 0, isHardcore: false, focusMode: 'blacklist' },
        telemetryConsent: { version: 1, enabled: false, decidedAt: now.getTime() }, lastCheck: now.getTime()
      });
    }, { pro, legacy, rules, usage, active, pending, rawUsage, retainedKey, focus, key: TEST_KEY, lists: LISTS });
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
      const local = await chrome.storage.local.get(['rules', 'ruleLists', 'activeRuleListId', 'dailyRuleUsage', 'pendingDailyUsageRemaps', 'focusSession', 'rulesGeneration', 'ruleRevisions', 'ruleListRevisions']);
      const { credentials, settings } = await chrome.storage.sync.get(['credentials', 'settings']);
      return { ...local, credentials, settings, dnr: await chrome.declarativeNetRequest.getDynamicRules() };
    });
  }

  async writeLocal(values) { await this.worker.evaluate(values => chrome.storage.local.set(values), values); }

  get popupUrl() { return `chrome-extension://${this.id}/index.html`; }

  async newPage(url = 'about:blank') {
    const page = await this.context.newPage();
    page.on('pageerror', error => this.pageErrors.push(error.message));
    await page.goto(url);
    return page;
  }

  async openPopup() { return this.newPage(this.popupUrl); }

  async deleteRule(page, id) {
    await page.locator(`tr[data-rule-id="${id}"] .delete-btn`).click();
  }

  async importBackup(page, backup) {
    const filename = path.join(this.profile, 'reader-backup.json');
    await writeFile(filename, JSON.stringify(backup));
    await page.locator('#importFileInput').setInputFiles(filename);
  }

  async reconcile(page) {
    const state = await this.state();
    const response = await send(page, 'rules:activateList', {
      listId: state.activeRuleListId, expectedGeneration: state.rulesGeneration ?? null,
      expectedListRevision: state.ruleListRevisions?.[state.activeRuleListId] ?? null
    });
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

  async backgroundClock() {
    return this.worker.evaluate(() => {
      const now = Date.now(); const local = new Date(now);
      return { now, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        offset: local.getTimezoneOffset(), date: `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`,
        nativeDate: Date.toString().includes('[native code]') && Date.now.toString().includes('[native code]') };
    });
  }

  async restart({ timezone = this.timezone } = {}) {
    await this.saveTrace('before-restart-trace');
    await this.closeBrowser();
    this.context = this.nativeBrowser = this.nativeOwner = null;
    this.options = [];
    await this.launch({ timezone });
  }

  async closeBrowser() {
    // Stop every launch owner, including setup failures and native restarts.
    // The fixture owns the same isolated profile until final cleanup.
    try { await this.context?.close(); }
    finally {
      try { await this.nativeBrowser?.close(); }
      finally { await this.nativeOwner?.close(); }
    }
  }

  async close() {
    this.releaseVerification?.();
    if (this.context) {
      const diagnosticErrors = [];
      const capture = async (label, action) => {
        try { await action(); }
        catch (error) { diagnosticErrors.push({ label, error: error.stack || String(error) }); }
      };
      try {
        if (this.worker) await capture('final-extension-state', async () => this.testInfo.attach('final-extension-state', {
          body: JSON.stringify(await this.state(), null, 2), contentType: 'application/json'
        }));
        for (let index = 0; index < this.options.length; index++) {
          const page = this.options[index];
          if (!page.isClosed()) await capture(`options-${index + 1}`, async () => {
            // Foreground each page only after the scenario has finished. A
            // background full-page capture can fail in headed Chromium.
            await page.bringToFront();
            await this.testInfo.attach(`options-${index + 1}`, {
              body: await page.screenshot({ fullPage: true }), contentType: 'image/png'
            });
          });
        }
        // A screenshot failure must not prevent trace capture or replace the
        // scenario's actual result. Preserve diagnostic failures separately.
        await capture('browser-trace', () => this.saveTrace('browser-trace'));
        if (diagnosticErrors.length) {
          this.testInfo.annotations.push({ type: 'diagnostic', description: 'One or more teardown captures failed; see diagnostic-errors.' });
          await this.testInfo.attach('diagnostic-errors', {
            body: JSON.stringify(diagnosticErrors, null, 2), contentType: 'application/json'
          });
        }
      } finally { await this.closeBrowser(); }
    } else { await this.closeBrowser(); }
  }
}

export const test = base.extend({
  extension: async ({}, use, testInfo) => {
    const manifest = JSON.parse(await readFile(path.join(extensionPath, 'manifest.json'), 'utf8'));
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
