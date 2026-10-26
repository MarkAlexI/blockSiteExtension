import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupDeadline, closeNativeResources } from '../e2e/bounded-cleanup.mjs';

test('hung native context and transport cannot prevent the independent process cleanup', async () => {
  const calls = [];
  const hung = label => ({close(){calls.push(label);return new Promise(()=>{});}});
  const failures = await closeNativeResources({context:hung('context'),nativeBrowser:hung('transport'),
    nativeOwner:{async close(){calls.push('owned process');}}},{timeoutMs:10,ownerTimeoutMs:100});
  assert.deepEqual(calls,['context','transport','owned process']);
  assert.equal(failures.length,2);
  assert.ok(failures.every(v=>v.error.includes('cleanup deadline')));
});

test('a rejecting diagnostic and transport preserve orderly owned-process cleanup', async () => {
  await assert.rejects(cleanupDeadline(()=>Promise.reject(new Error('diagnostic failed')),'capture',100),/diagnostic failed/);
  let stopped = 0;
  const failures = await closeNativeResources({context:{async close(){throw new Error('context closed');}},
    nativeBrowser:{async close(){}},nativeOwner:{async close(){stopped++;}}});
  assert.equal(stopped,1); assert.match(failures[0].error,/context closed/);
});

test('an unresponsive process owner fails cleanup within its own deadline', async () => {
  await assert.rejects(closeNativeResources({nativeOwner:{close:()=>new Promise(()=>{})}},
    {ownerTimeoutMs:10}),/owned browser process exceeded cleanup deadline/);
});

test('healthy native cleanup preserves context, transport and owner order', async () => {
  const calls = [];
  const resource = name => ({async close(){calls.push(name);}});
  assert.deepEqual(await closeNativeResources({context:resource('context'),nativeBrowser:resource('transport'),
    nativeOwner:resource('owner')}),[]);
  assert.deepEqual(calls,['context','transport','owner']);
});
