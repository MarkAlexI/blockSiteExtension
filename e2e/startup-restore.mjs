import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

// Unlike a route installed after CDP attachment, this loopback server is
// available while Chrome restores documents in the new browser process.
export async function createStartupFixture() {
  const requests = [];
  const token = randomUUID();
  const paths = Object.fromEntries(['active', 'background', 'control'].map(name => [name, `/${name}-${token}`]));
  const urls = {};
  const serve = (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (!Object.values(paths).includes(url.pathname)) {
      response.writeHead(404); response.end(); return;
    }
    const documentId = randomUUID();
    requests.push({ host: url.hostname, path: url.pathname, documentId, at: Date.now() });
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(`<!doctype html><html><head><title>BD Startup Fixture</title></head>
      <body><p>Native startup document</p><script>window.__bdStartupDocument=${JSON.stringify(documentId)}</script></body></html>`);
  };
  const server = createServer(serve);
  const close = async () => {
    if (server.listening) {
      const closed = once(server, 'close');
      server.close(); server.closeAllConnections(); await closed;
    }
  };
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    // Distinct fixture hosts give daily accounting and Focus the same
    // unambiguous host-only rule contract, independently of ephemeral ports.
    for (const name of ['active', 'background', 'control']) {
      urls[name] = `http://startup-${name}.bd-e2e.test:${server.address().port}${paths[name]}`;
    }
    return { urls, endpoint, requests, close, owns: url => Object.values(urls).some(address => {
      const expected = new URL(address);
      return url.origin === expected.origin && url.pathname === expected.pathname;
    }) };
  } catch (error) { await close(); throw error; }
}

export const startupDailyRule = (id, url) => ({ id, blockURL: new URL(url).hostname, redirectURL: '',
  category: 'social', isWhitelist: false, assignments: [{ listId: 'general', disabledByUser: false,
    blockingMode: 'daily_limit', dailyLimit: { minutes: 3 }, schedule: null }] });

// Executed as a read-only observation in the actual MV3 worker. It neither
// activates a list nor starts/reconciles Focus or repairs startup state.
export async function startupSnapshot(urls) {
  const api = chrome;
  const local = await api.storage.local.get(['rules', 'ruleLists', 'activeRuleListId', 'dailyRuleUsage',
    'pendingDailyUsageRemaps', 'focusSession', 'rulesGeneration', 'ruleRevisions', 'ruleListRevisions', '__bdStartupRestore']);
  const sync = await api.storage.sync.get(['credentials', 'settings']);
  const tabs = await api.tabs.query({});
  const documents = [];
  for (const tab of tabs) {
    if (!urls.includes(tab.url) || tab.discarded || tab.status !== 'complete') continue;
    const [result] = await api.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({
      id: window.__bdStartupDocument, url: location.href, timeOrigin: performance.timeOrigin,
      visibility: document.visibilityState, focused: document.hasFocus()
    }) });
    documents.push({ tabId: tab.id, ...result.result });
  }
  return { ...local, ...sync, tabs: tabs.map(tab => ({ id: tab.id, windowId: tab.windowId,
    url: tab.url, active: tab.active, status: tab.status, discarded: tab.discarded })),
  documents, windows: await api.windows.getAll(), alarms: await api.alarms.getAll(),
  dnr: (await api.declarativeNetRequest.getDynamicRules()).map(rule => rule.id).sort((a, b) => a - b),
  marker: { global: globalThis.__bdStartupRestore ?? null,
    session: (await api.storage.session.get('__bdStartupRestore')).__bdStartupRestore ?? null }, at: Date.now() };
}

export function assertStartupBudget(before, after, cycle) {
  assert.equal(cycle.exit.exitCode, 0, 'normal owned browser exit');
  assert.equal(cycle.exit.signalCode, null, 'no forced termination');
  assert.notEqual(cycle.before.pid, cycle.after.pid, 'a new browser process');
  assert.ok(cycle.launchedAt - cycle.exit.observedAt >= 8000, 'a genuine interval with no browser process');
  assert.ok(before.dailyRuleUsage.lastSample?.timestamp <= cycle.exit.observedAt);
  const beforeUsage = before.dailyRuleUsage.usageSeconds;
  const afterUsage = after.dailyRuleUsage.usageSeconds;
  const liveMs = cycle.exit.observedAt - before.dailyRuleUsage.lastSample.timestamp + after.at - cycle.launchedAt;
  const gain = afterUsage['21:general'] - beforeUsage['21:general'];
  assert.ok(gain >= 0, 'startup cannot reset spent budget');
  assert.ok(gain <= Math.floor(liveMs / 1000), 'the closed-browser interval cannot be charged as foreground time');
  assert.equal(afterUsage['23:general'], beforeUsage['23:general'], 'restored background tab cannot spend budget');
  assert.deepEqual(after.dailyRuleUsage.lastSample?.assignmentKeys, ['21:general']);
  assert.deepEqual(after.pendingDailyUsageRemaps, []);
  return { gain, maximumLiveSeconds: Math.floor(liveMs / 1000), closedMs: cycle.launchedAt - cycle.exit.observedAt };
}

export function assertStartupDeadline(state, limitSeconds = 180) {
  const deadline = state.alarms.find(alarm => alarm.name === 'daily_limit_deadline');
  assert.ok(deadline, 'native foreground deadline restored');
  const expected = state.dailyRuleUsage.lastSample.timestamp +
    (limitSeconds - state.dailyRuleUsage.usageSeconds['21:general']) * 1000;
  assert.ok(Math.abs(deadline.scheduledTime - expected) < 1000, 'deadline retains the current remaining budget');
}
