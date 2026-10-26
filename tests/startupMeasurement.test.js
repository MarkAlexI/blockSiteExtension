import test from 'node:test';
import assert from 'node:assert/strict';
import { assertStartupMeasurement } from '../e2e/startup-measurement.mjs';

// Receipt-model checks exercise the acceptance oracle; they are not native
// browser timings and must never be published as benchmark results.
function receipt() {
  return { beforePid:101,afterPid:102,exit:{exitCode:0,signalCode:null},
    token:'fixture',markers:{global:null,session:null,durable:'fixture'},installEvents:0,
    firstMessageCallbacks:1,spawnToCdpMs:400,launchToFirstReplyMs:450,launchToPopupReadyMs:550,
    launchedAt:1000,restoredTabs:12,
    popup:{trustedOpen:true,firstReplies:1,firstResponse:{isPro:true},errors:[],firstReplyMs:20,
      openResolvedMs:40,readyMs:100,clickedEpoch:1450,readyEpoch:1550},
    pressure:[{id:'a',origin:1100,busyMs:8,chunkStart:1448,chunkEnd:1456},
      {id:'b',origin:1150,busyMs:8,chunkStart:1510,chunkEnd:1518}],
    input:{addClicks:1,saveClicks:1,trusted:[true,true],requests:[{type:'rules:add'}],savedRules:1,
      addToDraftMs:18,saveToReplyMs:25} };
}
test('startup measurement receipt model accepts independent cold identity, overlapping real-work receipts and one trusted mutation',()=>{
  assertStartupMeasurement(receipt());
});
for (const [name,change] of [
  ['warm process',r=>{r.afterPid=r.beforePid;}],
  ['retained session',r=>{r.markers.session=r.token;}],
  ['reinstallation',r=>{r.installEvents=1;}],
  ['duplicate first message',r=>{r.firstMessageCallbacks=2;}],
  ['pressure outside measurement',r=>{r.pressure.forEach(e=>{e.chunkStart=2000;e.chunkEnd=2010;});}],
  ['old pressure process',r=>{r.pressure.forEach(e=>{e.origin=900;});}],
  ['synthetic activation',r=>{r.input.trusted[1]=false;}],
  ['duplicate mutation request',r=>{r.input.requests.push({type:'rules:add'});} ],
  ['missing timing',r=>{delete r.popup.firstReplyMs;}]
]) test(`startup measurement receipt model rejects ${name}`,()=>{
  const report=receipt();change(report);assert.throws(()=>assertStartupMeasurement(report));
});
