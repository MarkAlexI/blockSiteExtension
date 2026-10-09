import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Daily Limit worker restarts visibility accounting after navigation completes', async () => {
  const source = await readFile(new URL('../scripts/service_worker.js', import.meta.url), 'utf8');
  assert.match(source, /changeInfo\.status === 'complete'[\s\S]{0,300}dailyLimitTracker\.sample\('tab_load_complete'/);
});

test('Daily Limit worker handles the one-shot deadline alarm', async () => {
  const source = await readFile(new URL('../scripts/service_worker.js', import.meta.url), 'utf8');
  assert.match(source, /alarm\.name === DAILY_LIMIT_DEADLINE_ALARM[\s\S]{0,160}dailyLimitTracker\.sample\('deadline_alarm'/);
});

test('native window focus dispatch remains wired to current-state reconciliation and tracker actions', async () => {
  const source = await readFile(new URL('../scripts/service_worker.js', import.meta.url), 'utf8');
  const start = source.indexOf('chrome.windows?.onFocusChanged?.addListener');
  const end = source.indexOf('chrome.tabs.onCreated.addListener', start);
  assert.ok(start >= 0 && end > start, 'native focus handler is registered');
  const handler = source.slice(start, end);
  assert.match(handler, /runAsyncHandler\(ASYNC_HANDLER_OPERATIONS\.WINDOW_FOCUS_CHANGED/);
  assert.match(handler, /await chrome\.windows\.getAll\(\)/);
  assert.match(handler, /dailyLimitTracker\.pause\('window_focus_lost'/);
  assert.match(handler, /dailyLimitTracker\.sample\('window_focus_gained'/);
  // Actual loss, transient NONE, API failure and superseded replies are tested
  // with the imported production worker in workerStateRegression.test.js.
});
