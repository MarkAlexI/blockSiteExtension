import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { test, expect } from './fixtures.mjs';
import { launchNativeChromium } from './native-launch.mjs';
import { extensionWorker } from './extension-worker.mjs';
import { nativeMessageCallbacks } from './native-activity.mjs';
import { startNativeWindowManager } from './native-window-manager.mjs';
import { nativeTabShortcutBackend } from './native-tab-shortcut.mjs';
import { createPressureFixture, installStartupMeasurement, assertStartupMeasurement } from './startup-measurement.mjs';
import { createDnrStartupFixture, dnrReadinessReport, assertDnrReadiness, measurementEnvironment } from './dnr-readiness.mjs';

const execute = promisify(execFile);
let desktop;
test.beforeAll(async ({}, info) => {
  desktop = await startNativeWindowManager(info.outputPath('desktop'));
  await nativeTabShortcutBackend();
});
test.afterAll(async () => { await desktop?.close(); });

test('cold browser startup measures the first reply and genuine Popup readiness under restored-tab CPU pressure',
  { tag: ['@native-visibility','@native-startup-restore','@native-activity-log'] }, async ({ extension: e }, info) => {
  assert.equal(info.project.use.headless,false);
  const fixture = await createPressureFixture();
  let dnr, dnrMeasurement;
  const dnrObserver = new AbortController();
  e.startupFixture = { owns: url => fixture.owns(url) || Boolean(dnr?.owns(url)) };
  e.stopStartupPressure = async () => { await fixture.close(); await dnr?.close(); };
  const report = { schemaVersion:2, scenario:'66', token:randomUUID(), thresholds:'measurement only; 15s functional readiness deadline',
    initializationOverlap:'not established by this natural-startup measurement', platform:process.platform, node:process.version,
    environment:measurementEnvironment() };
  e.startupReport = report;
  report.stage = 'prepare profile';
  try {
    dnr = await createDnrStartupFixture();
    const reachable = await e.newPage(dnr.urls.reachable);
    assert.equal(await reachable.evaluate(() => document.documentElement.dataset.dnrFixture), dnr.token,
      'the ruled host really reaches the same HTTP fixture before rule setup');
    const rule = { id:991, blockURL:dnr.host,redirectURL:'',category:'social',isWhitelist:false,
      assignments:[{listId:'general',disabledByUser:false,blockingMode:'always',schedule:null,dailyLimit:null}] };
    await e.seed({rules:[rule]});
    const options = await e.openOptions(); await e.reconcile(options);
    await e.assertBlocked(dnr.urls.target, 'always');
    const beforeState=await e.state();
    await e.worker.evaluate(async token => {
      globalThis.__bdMeasureMarker=token;
      await chrome.storage.local.set({__bdMeasureMarker:token});
      await chrome.storage.session.set({__bdMeasureMarker:token});
    },report.token);
    const tabs=[];
    for (const url of fixture.urls) {
      report.stage = `prepare tab ${tabs.length + 1}/12`;
      tabs.push(await e.newPage(url));
    }
    const dnrDriver = await e.newPage(dnr.urls.control);
    await dnrDriver.bringToFront();
    report.stage = 'close prepared browser';
    for (const page of e.context.pages()) if (!tabs.includes(page) && page !== dnrDriver) await page.close();
    report.beforePid=(await e.nativeOwner.diagnostics()).pid;
    const executablePath=process.env.BD_CHROMIUM_BINARY || chromium.executablePath();
    await e.saveTrace('before-measurement-trace');
    const command=await e.nativeBrowser.newBrowserCDPSession();
    await command.send('Browser.close'); report.exit=await e.nativeOwner.waitForExit();
    e.context=e.nativeBrowser=e.nativeOwner=e.worker=null; e.options=[];
    const server=createServer(); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const port=server.address().port; await new Promise(resolve=>server.close(resolve));
    report.launchedAt=Date.now();
    fixture.startColdLaunch(report.launchedAt);
    dnr.startColdLaunch(report.launchedAt);
    report.stage = 'cold launch';
    e.nativeOwner=await launchNativeChromium({executablePath,profile:e.profile,port,headless:false,
      restoreSession:true,activityLog:true,args:['--host-resolver-rules=MAP *.bd-e2e.test 127.0.0.1, MAP blockdistraction.com ~NOTFOUND']});
    report.spawnToCdpMs=Date.now()-report.launchedAt;
    report.afterPid=(await e.nativeOwner.diagnostics()).pid;
    let preparedAt=Date.now(); report.preparation={};
    report.stage = 'attach restored browser';
    e.nativeBrowser=await chromium.connectOverCDP(e.nativeOwner.webSocketDebuggerUrl,{noDefaults:true,isLocal:true});
    report.preparation.cdpAttachMs=Date.now()-preparedAt; preparedAt=Date.now();
    [e.context]=e.nativeBrowser.contexts();
    const observationFloorAt = Date.now();
    report.stage = 'start independent native DNR observer';
    const blockedPage = () => e.context.pages().find(page => {
      const url = new URL(page.url());
      return url.protocol === 'chrome-extension:' && url.host === e.id && url.pathname === '/blocked.html' &&
        url.searchParams.get('url') === dnr.host && url.searchParams.get('reason') === 'always';
    });
    // Observe independently: Popup input must not wait for DNR to become ready.
    // Consume rejection immediately and cancel the timer on every failure path.
    dnrMeasurement = (async () => {
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        dnrObserver.signal.throwIfAborted();
        const page = blockedPage();
        if (page) {
          const document = await page.evaluate(() => ({ url: location.href, documentOrigin: performance.timeOrigin }));
          report.dnr = dnrReadinessReport(dnr, { ...document, at: Date.now() }, {
            extensionOrigin: `chrome-extension://${e.id}`, observationFloorAt });
          assertDnrReadiness(report.dnr);
          return;
        }
        await delay(50, undefined, { signal: dnrObserver.signal });
      }
      throw new Error('No native cold-start DNR redirect observed within 15 seconds');
    })().then(() => ({ error: null }), error => ({ error }));
    await e.configureContext();
    report.preparation.traceAndRoutesMs=Date.now()-preparedAt; preparedAt=Date.now();
    await expect.poll(()=>new Set(fixture.events.filter(event=>event.origin>=report.launchedAt).map(event=>event.id)).size).toBeGreaterThanOrEqual(2);
    report.pressureReadyMs=Date.now()-report.launchedAt;
    report.preparation.pressureWaitMs=Date.now()-preparedAt; preparedAt=Date.now();
    // A minimal packaged page sends no production runtime messages on load.
    // Do not obtain/warm the worker or poll startup readiness before this input.
    report.stage = 'measure native Popup';
    const host=await e.context.newPage();
    await host.goto(`chrome-extension://${e.id}/blocked.html`);
    await host.evaluate(installStartupMeasurement,{expectedRows:1});
    report.preparation.hostSetupMs=Date.now()-preparedAt;
    await host.locator('#__bdMeasureOpen').click();
    await expect.poll(()=>host.evaluate(()=>Boolean(window.__bdStartupMeasure.readyMs !== undefined &&
      window.__bdStartupMeasure.firstReplyMs !== undefined && window.__bdStartupMeasure.openResolvedMs !== undefined))).toBe(true);
    report.popup=await host.evaluate(()=>window.__bdStartupMeasure);
    report.stage = 'native Add and Save';
    report.launchToFirstReplyMs=report.popup.clickedEpoch+report.popup.firstReplyMs-report.launchedAt;
    report.launchToPopupReadyMs=report.popup.readyEpoch-report.launchedAt;
    const view=fn=>host.evaluate(new Function(`const v=chrome.extension.getViews({type:'popup'})[0];return (${fn.toString()})(v);`));
    await view(v=>{
      const s=v.__bdInputMeasure={addClicks:0,saveClicks:0,trusted:[],requests:[]};
      v.document.addEventListener('click',event=>{
        if(event.target.id==='add-rule'){s.addClicks++;s.addAt=v.performance.now();s.trusted.push(event.isTrusted);}
        if(event.target.matches('.save-btn')){s.saveClicks++;s.saveAt=v.performance.now();s.trusted.push(event.isTrusted);}
      },true);
      const original=v.chrome.runtime.sendMessage.bind(v.chrome.runtime);
      v.chrome.runtime.sendMessage=(...args)=>{
        if(args[0]?.type?.startsWith('rules:')){
          s.requests.push({type:args[0].type});
          const callback=args.at(-1);
          if(typeof callback==='function') args[args.length-1]=(...reply)=>{
            s.saveToReplyMs=v.performance.now()-s.saveAt;callback(...reply);
          };
        }
        return original(...args);
      };
      v.document.addEventListener('focusin',()=>{
        if(s.addToDraftMs===undefined && s.addAt!==undefined &&
           v.document.activeElement?.matches('.rule[data-rule-id="null"] input:first-child')) s.addToDraftMs=v.performance.now()-s.addAt;
      });
      v.document.getElementById('add-rule').focus();
    });
    const key=async args=>{
      const active=(await execute('xdotool',['getactivewindow'])).stdout.trim();
      const property=(await execute('xprop',['-id',active,'_NET_WM_PID'])).stdout;
      assert.match(property,new RegExp(`= ${report.afterPid}\\s*$`),'keyboard targets only the owned native browser');
      await execute('xdotool',args,{timeout:3000});
    };
    await key(['key','--clearmodifiers','Return']);
    await expect.poll(()=>view(v=>Boolean(v.document.querySelector('.rule[data-rule-id="null"] .save-btn') &&
      v.document.activeElement?.matches('.rule[data-rule-id="null"] input:first-child')))).toBe(true);
    assert.equal(await view(v=>Number.isFinite(v.__bdInputMeasure.addToDraftMs)),true,'actual native focus event measured Add response');
    await key(['type','--clearmodifiers','--delay','0','measurement-new.bd-e2e.test']);
    await view(v=>v.document.querySelector('.rule[data-rule-id="null"] .save-btn').focus());
    await key(['key','--clearmodifiers','Return']);
    await expect.poll(()=>view(v=>v.__bdInputMeasure.saveToReplyMs!==undefined)).toBe(true);
    report.input=await view(v=>v.__bdInputMeasure);
    const selected=await extensionWorker(e.context,e.manifest);e.worker=selected.worker;
    report.browser=await e.nativeBrowser.version();report.version=selected.identity.version;
    report.markers=await e.worker.evaluate(async()=>({global:globalThis.__bdMeasureMarker??null,
      session:(await chrome.storage.session.get('__bdMeasureMarker')).__bdMeasureMarker??null,
      durable:(await chrome.storage.local.get('__bdMeasureMarker')).__bdMeasureMarker??null}));
    const state=await e.state();report.input.savedRules=state.rules.filter(r=>r.blockURL==='measurement-new.bd-e2e.test').length;
    assert.equal(state.rules.length,2);
    assert.deepEqual(state.rules.filter(r=>r.id===991),beforeState.rules);
    assert.deepEqual(state.dailyRuleUsage.usageSeconds,beforeState.dailyRuleUsage.usageSeconds);
    assert.deepEqual(state.pendingDailyUsageRemaps,[]);
    report.restoredTabs=await e.worker.evaluate(async urls=>(await chrome.tabs.query({})).filter(t=>urls.includes(t.url)).length,fixture.urls);
    const log=e.nativeOwner.activity.snapshot(e.id);assert.deepEqual(log.errors,[]);
    report.installEvents=log.events.filter(v=>v.api==='runtime.onInstalled').length;
    report.firstMessageCallbacks=nativeMessageCallbacks(log,{extensionId:e.id,producerUrl:host.url()}).length;
    // Let batched observations catch up; acceptance still requires actual CPU
    // chunks inside the original click-to-ready interval, not later work.
    await expect.poll(()=>new Set(fixture.events.filter(event=>event.origin>=report.launchedAt &&
      event.chunkEnd>=report.popup.readyEpoch).map(event=>event.id)).size).toBeGreaterThanOrEqual(2);
    report.pressure=fixture.events;
    report.pressurePolicy=fixture.policy; report.pressureProducers=fixture.producers;
    const dnrResult = await dnrMeasurement;
    if (dnrResult.error) throw dnrResult.error;
    report.dnr.observedBeforePopup = report.dnr.observation.at <= report.popup.clickedEpoch;
    if (report.dnr.earlyAllowedRequests) info.annotations.push({ type: 'dnr-startup-traffic',
      description: `${report.dnr.earlyAllowedRequests} main-frame requests reached HTTP before the first observed block` });
    assertStartupMeasurement(report);
    report.stage = 'complete';
  } finally {
    dnrObserver.abort();
    await dnrMeasurement;
    report.pressure=fixture.events;
    report.pressurePolicy=fixture.policy; report.pressureProducers=fixture.producers;
    report.dnrPartial = dnr?.snapshot();
    await e.stopStartupPressure();
    await info.attach('cold-startup-popup-measurement',{body:JSON.stringify(report,null,2),contentType:'application/json'});
    e.startupReportAttached = true;
  }
});
