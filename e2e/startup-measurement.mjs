import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { assertDnrReadiness } from './dnr-readiness.mjs';

const pressurePolicy = { leaseMs: 20_000, chunkMs: 8, intervalMs: 32, receiptIntervalMs: 250 };

// Serialized into the loopback HTTP worker. Healthy owner replies renew the
// same bounded lease; a lost owner, an expired lease or explicit Stop ends it.
export function runPressureWorker({ leaseMs, chunkMs, intervalMs }) {
  let busyMs = 0, running = true, expiresAt = performance.now() + leaseMs;
  const stop = reason => {
    if (!running) return;
    running = false; clearInterval(timer); postMessage({ type: 'stopped', reason });
  };
  const timer = setInterval(() => {
    if (performance.now() >= expiresAt) { stop('owner_lease_expired'); return; }
    const start = performance.now();
    while (performance.now() - start < chunkMs) {}
    busyMs += performance.now() - start;
    postMessage({ type: 'chunk', busyMs, start: performance.timeOrigin + start,
      end: performance.timeOrigin + performance.now() });
  }, intervalMs);
  globalThis.onmessage = ({ data }) => {
    if (!running || data?.type !== 'lease') return;
    if (data.continue === false) { stop('owner_stopped'); return; }
    if (data.continue === true && data.leaseMs === leaseMs && performance.now() < expiresAt) {
      expiresAt = performance.now() + leaseMs;
    }
  };
}

// Preserve every CPU chunk, with only one batched HTTP receipt in flight per
// document. CPU intensity is independent of this reporting interval.
export function runPressurePage({ id, receiptIntervalMs }) {
  const worker = new Worker('/worker.js?origin=' + performance.timeOrigin);
  const chunks = [];
  let pending = false, stopped = false;
  const stop = () => { if (stopped) return; stopped = true; clearInterval(timer); worker.terminate(); };
  const timer = setInterval(async () => {
    if (stopped || pending || !chunks.length) return;
    pending = true;
    const batch = chunks.splice(0);
    try {
      const response = await fetch('/pulse?id=' + id + '&origin=' + performance.timeOrigin,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch) });
      if (!response.ok) throw new Error('owner unavailable');
      const lease = await response.json();
      if (!stopped) worker.postMessage(lease);
    } catch { stop(); }
    finally { pending = false; }
  }, receiptIntervalMs);
  worker.onmessage = ({ data }) => {
    if (stopped) return;
    if (data.type === 'chunk') chunks.push(data);
    else if (data.type === 'stopped' || data.type === 'idle') stop();
  };
}

// A loopback server survives the browser exit and serves newly restored tabs.
// Each tab has a bounded real CPU workload, not emulated CDP CPU throttling.
export async function createPressureFixture() {
  const events = [], producers = new Map();
  let coldLaunchAt = null, closing;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    response.setHeader('cache-control', 'no-store');
    if (url.pathname === '/worker.js') {
      response.setHeader('content-type', 'text/javascript');
      const origin = Number(url.searchParams.get('origin'));
      const enabled = !closing && coldLaunchAt !== null && Number.isFinite(origin) && origin >= coldLaunchAt;
      response.end(enabled ? `(${runPressureWorker.toString()})(${JSON.stringify(pressurePolicy)});`
        : `postMessage({type:'idle'});`);
    } else if (url.pathname === '/pulse') {
      const id = url.searchParams.get('id'), origin = Number(url.searchParams.get('origin'));
      let chunks;
      try {
        if (request.method === 'POST') {
          let body = '';
          for await (const part of request) {
            body += part;
            if (body.length > 128_000) { response.writeHead(413); response.end(); return; }
          }
          chunks = JSON.parse(body);
        } else if (request.method === 'GET') chunks = [{ busyMs:Number(url.searchParams.get('busy')),
          start:Number(url.searchParams.get('start')), end:Number(url.searchParams.get('end')) }];
      } catch { response.writeHead(400); response.end(); return; }
      if (!/^\/tab\/(?:[0-9]|1[01])$/.test(id || '') || !Number.isFinite(origin) || origin <= 0 ||
          !Array.isArray(chunks) || !chunks.length || chunks.length > 1000 ||
          chunks.some(c => !c || ![c.busyMs,c.start,c.end].every(Number.isFinite) ||
            c.busyMs <= 0 || c.start < origin || c.end < c.start)) {
        response.writeHead(400); response.end(); return;
      }
      const enabled = !closing && coldLaunchAt !== null && origin >= coldLaunchAt;
      if (enabled) {
        const at = Date.now();
        events.push(...chunks.map(c => ({ at,id,origin,busyMs:c.busyMs,chunkStart:c.start,chunkEnd:c.end })));
        const key = `${id}:${origin}`;
        const producer = producers.get(key) || { id,origin,firstAt:at,renewals:0 };
        Object.assign(producer,{lastAt:at,renewals:producer.renewals+1}); producers.set(key,producer);
      }
      response.writeHead(200,{'content-type':'application/json'});
      response.end(JSON.stringify({ type:'lease',continue:enabled,leaseMs:pressurePolicy.leaseMs }));
    } else if (/^\/tab\/\d+$/.test(url.pathname)) {
      response.setHeader('content-type', 'text/html');
      response.end(`<!doctype html><title>BD startup load ${url.pathname}</title><p>Bounded local CPU fixture</p>
        <script>(${runPressurePage.toString()})(${JSON.stringify({id:url.pathname,
          receiptIntervalMs:pressurePolicy.receiptIntervalMs})});</script>`);
    } else { response.writeHead(404); response.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { events, policy:pressurePolicy, get producers(){return [...producers.values()];},
    urls: Array.from({length:12}, (_,i) => `${origin}/tab/${i}`),
    owns: url => url.origin === origin,
    startColdLaunch(at) {
      assert.ok(coldLaunchAt === null && !closing, 'cold workload can be armed only once');
      assert.ok(Number.isFinite(at) && at > 0, 'cold workload needs the new browser launch time');
      coldLaunchAt = at;
    },
    close() {
      if (!closing) {
        closing = once(server,'close'); server.close(); server.closeAllConnections();
      }
      return closing;
    } };
}

// Runs in a minimal packaged blocked.html host, before Popup is opened. The
// callback-based native message and native action request are each issued once.
export function installStartupMeasurement({ expectedRows }) {
  const state = window.__bdStartupMeasure = { firstReplies: 0, expectedRows, errors: [] };
  const button = document.createElement('button'); button.id = '__bdMeasureOpen';
  button.textContent = 'Measure native Popup'; document.body.prepend(button);
  button.onclick = event => {
    if (state.clickedAt !== undefined) throw new Error('Measurement may be triggered only once');
    state.trustedOpen = event.isTrusted;
    state.clickedAt = performance.now();
    state.clickedEpoch = performance.timeOrigin + state.clickedAt;
    chrome.runtime.sendMessage({ type: 'check_pro_status' }, response => {
      state.firstReplies++;
      state.firstReplyMs = performance.now() - state.clickedAt;
      state.firstResponse = response;
      if (chrome.runtime.lastError) state.errors.push(chrome.runtime.lastError.message);
    });
    chrome.action.openPopup().then(() => { state.openResolvedMs = performance.now() - state.clickedAt; },
      error => state.errors.push(String(error)));
    const observe = () => {
      const views = chrome.extension.getViews({type:'popup'}).filter(v => v.location.pathname === '/index.html');
      const view = views.length === 1 ? views[0] : null;
      const rows = view?.document.querySelectorAll('.rule[data-rule-id]:not([data-rule-id="null"])');
      const add = view?.document.getElementById('add-rule');
      if (view?.document.body?.classList.contains('ready') && add && !add.disabled && rows.length === expectedRows &&
          view.document.getElementById('start-focus-btn')?.textContent.trim()) {
        state.readyMs = performance.now() - state.clickedAt;
        state.readyEpoch = performance.timeOrigin + performance.now();
        state.popupTimeOrigin = view.performance.timeOrigin;
        return;
      }
      if (performance.now() - state.clickedAt > 15_000) { state.errors.push('Popup readiness deadline'); return; }
      setTimeout(observe,16);
    };
    observe();
  };
}

export function assertStartupMeasurement(report) {
  assert.notEqual(report.beforePid, report.afterPid, 'full new browser process');
  assert.equal(report.exit.exitCode, 0); assert.equal(report.exit.signalCode, null);
  assert.deepEqual(report.markers, { global: null, session: null, durable: report.token });
  assert.equal(report.installEvents, 0, 'persistent extension is not reinstalled');
  assert.equal(report.firstMessageCallbacks, 1, 'one first native message delivery');
  const m = report.popup;
  assertDnrReadiness(report.dnr);
  assert.ok(report.dnr.attempts[0].at <= m.clickedEpoch, 'native DNR probe issued before the first Popup command');
  assert.equal(m.trustedOpen, true);
  assert.equal(m.firstReplies, 1);
  assert.deepEqual(m.firstResponse, { isPro: true });
  assert.deepEqual(m.errors, []);
  for (const key of ['spawnToCdpMs','launchToFirstReplyMs','launchToPopupReadyMs']) {
    assert.ok(Number.isFinite(report[key]) && report[key] >= 0, key);
  }
  for (const key of ['firstReplyMs','openResolvedMs','readyMs']) assert.ok(Number.isFinite(m[key]) && m[key] >= 0,key);
  assert.equal(report.restoredTabs, 12);
  const during = report.pressure.filter(event => event.origin >= report.launchedAt &&
    event.chunkStart < m.readyEpoch && event.chunkEnd > m.clickedEpoch && event.busyMs > 0);
  assert.ok(new Set(during.map(event=>event.id)).size >= 2, 'real worker CPU pressure overlaps the Popup measurement');
  assert.equal(report.input.addClicks, 1); assert.equal(report.input.saveClicks, 1);
  assert.equal(report.input.trusted.length, 2);
  assert.ok(report.input.trusted.every(Boolean));
  assert.equal(report.input.requests.filter(request=>request.type === 'rules:add').length,1);
  assert.equal(report.input.savedRules,1);
  assert.ok(Number.isFinite(report.input.addToDraftMs) && report.input.addToDraftMs >= 0);
  assert.ok(Number.isFinite(report.input.saveToReplyMs) && report.input.saveToReplyMs >= 0);
}
