import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';

// A loopback server survives the browser exit and serves newly restored tabs.
// Each tab has a bounded real CPU workload, not emulated CDP CPU throttling.
export async function createPressureFixture() {
  const events = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    response.setHeader('cache-control', 'no-store');
    if (url.pathname === '/worker.js') {
      response.setHeader('content-type', 'text/javascript');
      response.end(`let busyMs=0; const end=performance.now()+20000;
        const timer=setInterval(()=>{const start=performance.now();
          while(performance.now()-start<8){} busyMs+=performance.now()-start;
          postMessage({busyMs,start:performance.timeOrigin+start,end:performance.timeOrigin+performance.now()});
          if(performance.now()>=end)clearInterval(timer);
        },32);`);
    } else if (url.pathname === '/pulse') {
      events.push({ at: Date.now(), id: url.searchParams.get('id'),
        origin: Number(url.searchParams.get('origin')), busyMs: Number(url.searchParams.get('busy')),
        chunkStart:Number(url.searchParams.get('start')),chunkEnd:Number(url.searchParams.get('end')) });
      response.writeHead(204); response.end();
    } else if (/^\/tab\/\d+$/.test(url.pathname)) {
      response.setHeader('content-type', 'text/html');
      response.end(`<!doctype html><title>BD startup load ${url.pathname}</title><p>Bounded local CPU fixture</p>
        <script>const w=new Worker('/worker.js');
        w.onmessage=e=>fetch('/pulse?id=${url.pathname}&origin='+performance.timeOrigin+'&busy='+e.data.busyMs+'&start='+e.data.start+'&end='+e.data.end).catch(()=>{});</script>`);
    } else { response.writeHead(404); response.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { events, urls: Array.from({length:12}, (_,i) => `${origin}/tab/${i}`),
    owns: url => url.origin === origin,
    async close() { const closed = once(server,'close'); server.close(); server.closeAllConnections(); await closed; } };
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
