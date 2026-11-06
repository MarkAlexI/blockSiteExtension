import assert from 'node:assert/strict';
import { observeNativeAudioClock } from './native-audio-clock.mjs';

export async function observeUpgradeFocusAudio(e) {
  const owner=e.nativeOwner, extensionId=e.id;
  const watermark=owner.activity.snapshot(extensionId).lastSequence;
  const clock=await observeNativeAudioClock({browser:e.nativeBrowser,endpoint:owner.endpoint,
    offscreenUrl:`chrome-extension://${extensionId}/scripts/sound-offscreen.html`});
  return {read:()=>({clock:clock.read(),activity:owner.activity.snapshot(extensionId,watermark)}),
    close:()=>clock.close()};
}

// This proves one native playback graph and advancing audio time in the CI
// output backend. Physical speaker volume and Android delivery remain manual.
export function assertUpgradeFocusCompletion(before,completed,audio) {
  const deadline=before.focusSession.focusEndTime;
  assert.equal(before.settings.focusSessionSound,true);
  assert.ok(completed.now>=deadline,'the inherited deadline must expire naturally');
  assert.equal(completed.focusSession.focusActive,false);
  assert.equal(completed.alarms.some(alarm=>alarm.name==='end_focus_session'),false);
  assert.deepEqual(completed.dnr.map(rule=>rule.id),[901],'only Basic blocking remains after Focus');
  assert.deepEqual(completed.dailyRuleUsage.usageSeconds,before.dailyRuleUsage.usageSeconds);
  assert.deepEqual(completed.rules,before.rules,'Focus completion preserves saved rules');
  assert.equal(completed.settings.focusSessionSound,true);
  assert.deepEqual(audio.activity.errors,[]);
  const calls=api=>audio.activity.events.filter(event=>event.category==='api_call'&&event.api===api);
  const alarms=audio.activity.events.filter(event=>event.category==='api_event_callback'&&
    event.api==='alarms.onAlarm'&&event.args?.[0]?.name==='end_focus_session');
  assert.equal(alarms.length,1,'one real Focus completion alarm delivery');
  assert.equal(alarms[0].args[0].scheduledTime,deadline,'the pre-update alarm deadline is retained');
  assert.equal(calls('offscreen.createDocument').length,1,'one native sound document was created');
  assert.equal(calls('offscreen.closeDocument').length,1,'the native sound document was released');
  assert.deepEqual(audio.clock.errors,[]);
  assert.equal(audio.clock.dropped,0);
  assert.equal(audio.clock.targets.length,1,'one native sound target throughout update and completion');
  const target=audio.clock.targets[0];
  assert.ok(target.connected&&target.domainEnabled);
  assert.ok(target.createdAt>=deadline-1000,'the update itself must not play a completion sound');
  assert.ok(Number.isFinite(target.destroyedAt),'playback resources are released');
  assert.equal(target.contexts.length,1,'one native AudioContext, including no duplicate playback');
  const context=target.contexts[0];
  assert.equal(context.contextType,'realtime');
  const samples=target.samples.filter(sample=>sample.contextId===context.contextId);
  assert.ok(samples.length>=2&&samples.at(-1).currentTime>samples[0].currentTime,
    'the native audio clock actually advances');
}
