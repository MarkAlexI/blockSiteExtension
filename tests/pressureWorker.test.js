import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createPressureFixture } from '../e2e/startup-measurement.mjs';

// Execute the actual HTTP-served worker script with a controlled clock. These
// are API-model controls, not native CPU measurements or browser proof.
async function workerFixture(run) {
  const fixture=await createPressureFixture();
  try {
    fixture.startColdLaunch(1000);
    const base=new URL(fixture.urls[0]).origin;
    const source=await (await fetch(base+'/worker.js?origin=1000')).text();
    let clock=0, id=0;const timers=new Map(),messages=[];
    const realm={performance:{timeOrigin:1_000_000,now:()=>clock++},
      setInterval:fn=>{timers.set(++id,fn);return id;},clearInterval:key=>timers.delete(key),
      postMessage:message=>messages.push(structuredClone(message))};
    vm.runInNewContext(source,realm);
    await run({fixture,base,messages,timers,
      tick(at){clock=at;for(const callback of [...timers.values()])callback();},
      reply(value){realm.onmessage?.({data:value});}});
  } finally {await fixture.close();}
}
test('owner replies keep the served workload alive through a 36-second browser attachment',async()=>{
  await workerFixture(async({tick,reply,messages,timers})=>{
    for(let at=1000;at<=37000;at+=1000){tick(at);reply({type:'lease',continue:true,leaseMs:20000});}
    assert.equal(timers.size,1);
    assert.ok(messages.some(message=>message.start>=1_036_000),'real script still works after the CI preparation interval');
  });
});
test('a missing owner expires the same 20-second lease before another CPU chunk',async()=>{
  await workerFixture(async({tick,messages,timers})=>{
    tick(20001);assert.equal(timers.size,0);
    assert.equal(messages.some(message=>message.start!==undefined),false);
    assert.equal(messages.at(-1).reason,'owner_lease_expired');
  });
});
test('unrelated or malformed replies cannot extend the workload',async()=>{
  await workerFixture(async({tick,reply,messages,timers})=>{
    tick(19000);
    for(const value of [{continue:true,leaseMs:20000},{type:'lease',continue:true,leaseMs:999999},null])reply(value);
    tick(20001);assert.equal(timers.size,0);assert.equal(messages.at(-1).reason,'owner_lease_expired');
  });
});
test('explicit owner Stop and expired workers cannot be restarted by a late reply',async()=>{
  for(const mode of ['stop','expiry']) await workerFixture(async({reply,tick,messages,timers})=>{
    if(mode==='stop')reply({type:'lease',continue:false});else tick(20001);
    assert.equal(timers.size,0);
    const before=messages.length;reply({type:'lease',continue:true,leaseMs:20000});tick(30000);
    assert.equal(messages.length,before);
  });
});
test('the HTTP fixture renews valid producers and rejects malformed receipts',async()=>{
  await workerFixture(async({base,fixture})=>{
    const good=await fetch(base+'/pulse?id=/tab/0&origin=1000&busy=8&start=1001&end=1009');
    assert.equal(good.status,200);
    assert.deepEqual(await good.json(),{type:'lease',continue:true,leaseMs:20000});
    assert.equal(fixture.producers[0].renewals,1);
    const bad=await fetch(base+'/pulse?id=/tab/0&origin=NaN&busy=8&start=1001&end=1009');
    assert.equal(bad.status,400);assert.equal(fixture.events.length,1);
  });
});
