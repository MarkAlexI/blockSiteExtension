import assert from 'node:assert/strict';
import { mkdtemp, mkdir, cp, readFile, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test as base } from 'playwright/test';
import { ExtensionHarness } from './fixtures.mjs';
import { extensionWorker } from './extension-worker.mjs';
import { startNativeWindowManager } from './native-window-manager.mjs';
import { readUpgradeBaseline } from './prepare-upgrade-baseline.mjs';
import { runVersionUpgrade, upgradeUntil, upgradeTimezone } from './version-upgrade.mjs';
import { runtimePaths } from '../tools/package-store.js';
import { expectedVersion } from './target-version.mjs';

base('native 5.4.14 to current version update preserves paid state, Focus and spent Daily Limit',
  {tag:['@native-visibility','@native-startup-restore','@native-activity-log']},async({},info)=>{
  assert.equal(info.project.use.headless,false);
  const previous=await readUpgradeBaseline();
  const current=path.resolve(process.env.BD_EXTENSION_PATH || fileURLToPath(new URL('..',import.meta.url)));
  const manifest=JSON.parse(await readFile(path.join(current,'manifest.json'),'utf8'));
  assert.equal(manifest.version,expectedVersion);
  const root=await mkdtemp(path.join(tmpdir(),'bd-chromium-upgrade-'));
  const stable=path.join(root,'runtime');await cp(previous.runtime,stable,{recursive:true});
  const e=new ExtensionHarness(path.join(root,'profile'),info,previous.manifest,stable);
  e.upgradeBaseline=previous;
  e.allowNativeUpgradeManager=true;
  let desktop,watermark=0;
  try {
    desktop=await startNativeWindowManager(info.outputPath('desktop'));
    await e.launch({timezone:upgradeTimezone()});
    const events=()=>{
      const log=e.nativeOwner.activity.snapshot(e.id);assert.deepEqual(log.errors,[]);
      return log.events.filter(v=>v.sequence>watermark&&v.category==='api_event_callback'&&v.api==='runtime.onInstalled')
        .map(v=>({at:v.at,extensionId:v.extensionId,details:{reason:v.args[0].reason,previousVersion:v.args[0].previousVersion}}));
    };
    await runVersionUpgrade(e,{
      identity:async()=>({pid:(await e.nativeOwner.diagnostics()).pid,profile:e.profile,
        ...await e.worker.evaluate(()=>({id:chrome.runtime.id,version:chrome.runtime.getManifest().version}))}),
      installObserver:async()=>{watermark=e.nativeOwner.activity.snapshot(e.id).events.at(-1)?.sequence||0;},
      events,
      update:async()=>{
        const oldWorker=e.worker;
        const stage=path.join(root,'next-runtime');await mkdir(stage);
        for(const name of runtimePaths)await cp(path.join(current,name),path.join(stage,name),{recursive:true});
        await rename(stable,path.join(root,'previous-runtime'));await rename(stage,stable);
        const manager=await e.context.newPage();await manager.goto('chrome://extensions/');
        // Native browser WebUI performs one reload of the installed unpacked
        // path. The native activity log must report update/previousVersion.
        await manager.evaluate(id=>new Promise((resolve,reject)=>{
          chrome.developerPrivate.reload(id,{failQuietly:false},()=>{
            const error=chrome.runtime.lastError;error?reject(new Error(error.message)):resolve();
          });
        }),e.id);
        await upgradeUntil(events,v=>v.length>0,'native Chromium update delivery');
        await upgradeUntil(()=>e.context.serviceWorkers().includes(oldWorker),present=>!present,'previous worker unloaded');
        e.manifest=manifest;e.options=[];
        const selected=await extensionWorker(e.context,manifest);e.worker=selected.worker;
        assert.equal(selected.identity.id,e.id);
      },
      evidence:value=>info.attach('native-version-upgrade',{body:JSON.stringify(value,null,2),contentType:'application/json'})
    });
    assert.deepEqual(e.pageErrors,[]);
  } finally {
    try {await e.close();} finally {await desktop?.close();
      if(e.browserCleanupComplete)await rm(root,{recursive:true,force:true});}
  }
});
