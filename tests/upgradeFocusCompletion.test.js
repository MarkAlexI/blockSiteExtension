import test from 'node:test';
import assert from 'node:assert/strict';
import { assertUpgradeFocusCompletion } from '../e2e/upgrade-focus-completion.mjs';

function sample() {
  const before={focusSession:{focusActive:true,focusEndTime:61000},settings:{focusSessionSound:true},
    rules:[{id:901},{id:902}],dailyRuleUsage:{usageSeconds:{'902:general':45,'902:list-1':840}}};
  const completed={...structuredClone(before),now:61050,focusSession:{focusActive:false},
    alarms:[],dnr:[{id:901}]};
  const audio={activity:{errors:[],events:[
    {category:'api_event_callback',api:'alarms.onAlarm',args:[{name:'end_focus_session',scheduledTime:61000}]},
    {category:'api_call',api:'offscreen.createDocument'},
    {category:'api_call',api:'offscreen.closeDocument'}]},
  clock:{errors:[],dropped:0,targets:[{connected:true,domainEnabled:true,createdAt:61010,destroyedAt:61950,
    contexts:[{contextId:'sound',contextType:'realtime'}],samples:[
      {contextId:'sound',currentTime:0.01},{contextId:'sound',currentTime:0.2}]}]}};
  return {before,completed,audio};
}

test('post-update Focus completion needs the preserved native alarm and one advancing, released audio graph',()=>{
  const s=sample();assertUpgradeFocusCompletion(s.before,s.completed,s.audio);
});

for(const [name,change] of [
  ['early completion',s=>s.completed.now=60000],
  ['still active Focus',s=>s.completed.focusSession.focusActive=true],
  ['completion alarm left armed',s=>s.completed.alarms=[{name:'end_focus_session'}]],
  ['lost Basic protection',s=>s.completed.dnr=[]],
  ['lost spent limit',s=>s.completed.dailyRuleUsage.usageSeconds['902:general']=0],
  ['changed saved rules',s=>s.completed.rules=[]],
  ['lost sound setting',s=>s.completed.settings.focusSessionSound=false],
  ['missing alarm delivery',s=>s.audio.activity.events.shift()],
  ['duplicate alarm delivery',s=>s.audio.activity.events.push(structuredClone(s.audio.activity.events[0]))],
  ['different alarm deadline',s=>s.audio.activity.events[0].args[0].scheduledTime++],
  ['duplicate sound attempt',s=>s.audio.activity.events.push({category:'api_call',api:'offscreen.createDocument'})],
  ['unreleased offscreen document',s=>s.audio.activity.events.pop()],
  ['native activity overflow',s=>s.audio.activity.errors.push('overflow')],
  ['missing playback graph',s=>s.audio.clock.targets=[]],
  ['duplicate playback target',s=>s.audio.clock.targets.push(structuredClone(s.audio.clock.targets[0]))],
  ['sound during update',s=>s.audio.clock.targets[0].createdAt=10000],
  ['unreleased target',s=>s.audio.clock.targets[0].destroyedAt=null],
  ['duplicate AudioContext in one target',s=>s.audio.clock.targets[0].contexts.push({contextId:'other'})],
  ['frozen audio clock',s=>s.audio.clock.targets[0].samples[1].currentTime=0.01],
  ['samples belonging to another graph',s=>s.audio.clock.targets[0].samples[1].contextId='other'],
  ['failed native audio observer',s=>s.audio.clock.errors.push('CDP error')],
  ['dropped playback evidence',s=>s.audio.clock.dropped=1]
]) test(`post-update completion rejects ${name}`,()=>{
  const s=sample();change(s);
  assert.throws(()=>assertUpgradeFocusCompletion(s.before,s.completed,s.audio));
});
