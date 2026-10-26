import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createPressureFixture } from '../e2e/startup-measurement.mjs';

test('served preparation documents do not start CPU work, including a late old-document worker request', async () => {
  const fixture = await createPressureFixture();
  try {
    const base = new URL(fixture.urls[0]).origin;
    const inspect = async origin => {
      const source = await (await fetch(base+'/worker.js?origin='+origin)).text();
      const messages = [], intervals = [];
      vm.runInNewContext(source, { postMessage:value=>messages.push(value.type),
        performance:{now:()=>0}, setInterval:(fn,ms)=>{intervals.push(ms);return 1;}, clearInterval(){} });
      return { messages, intervals };
    };
    assert.deepEqual(await inspect(1000), { messages:['idle'],intervals:[] });
    fixture.startColdLaunch(2000);
    assert.deepEqual(await inspect(1000), { messages:['idle'],intervals:[] });
    assert.deepEqual((await inspect(2001)).intervals, [32]);
    assert.throws(()=>fixture.startColdLaunch(3000), /only once/);
  } finally { await fixture.close(); await fixture.close(); }
});

test('batched HTTP receipts preserve individual CPU intervals and reject an entire malformed batch', async () => {
  const fixture = await createPressureFixture();
  try {
    fixture.startColdLaunch(1000);
    const base = new URL(fixture.urls[0]).origin;
    const post = (origin,chunks) => fetch(base+'/pulse?id=/tab/0&origin='+origin,
      {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(chunks)});
    const chunks = [{busyMs:8,start:1010,end:1018},{busyMs:16,start:1042,end:1050}];
    assert.equal((await post(1000,chunks)).status,200);
    assert.deepEqual(fixture.events.map(v=>[v.chunkStart,v.chunkEnd]),[[1010,1018],[1042,1050]]);
    assert.equal(fixture.producers[0].renewals,1);
    assert.equal((await post(1000,[chunks[0],{...chunks[1],end:0}])).status,400);
    assert.equal(fixture.events.length,2);
    assert.equal((await (await post(900,chunks)).json()).continue,false);
    assert.equal(fixture.events.length,2,'pre-launch producers cannot renew a lease or supply evidence');
  } finally { await fixture.close(); }
});

test('served document batches all chunks with one request in flight and terminates on owner failure', async () => {
  const fixture = await createPressureFixture();
  try {
    const html = await (await fetch(fixture.urls[0])).text();
    const script = /<script>([\s\S]*)<\/script>/.exec(html)[1];
    const timers = new Map(), requests = [], replies = [];
    let worker, resolve, terminated = 0;
    vm.runInNewContext(script, {
      performance:{timeOrigin:1000},
      Worker:class { constructor(){worker=this;} postMessage(v){replies.push(v);} terminate(){terminated++;} },
      setInterval:(fn,ms)=>{assert.equal(ms,250);timers.set(1,fn);return 1;},
      clearInterval:id=>timers.delete(id),
      fetch:(url,options)=>{requests.push({url,chunks:JSON.parse(options.body)});return new Promise(r=>{resolve=r;});}
    });
    const chunk = n => ({type:'chunk',busyMs:n*8,start:1000+n*32,end:1008+n*32});
    worker.onmessage({data:chunk(1)}); worker.onmessage({data:chunk(2)});
    const first = timers.get(1)();
    worker.onmessage({data:chunk(3)});
    await timers.get(1)();
    assert.equal(requests.length,1,'a slow owner cannot create parallel receipt requests');
    resolve({ok:true,json:async()=>({type:'lease',continue:true,leaseMs:20000})}); await first;
    assert.equal(replies.length,1);
    const second = timers.get(1)();
    assert.deepEqual(requests.flatMap(v=>v.chunks).map(v=>v.start),[1032,1064,1096]);
    resolve({ok:false}); await second;
    assert.equal(terminated,1); assert.equal(timers.size,0);
  } finally { await fixture.close(); }
});
