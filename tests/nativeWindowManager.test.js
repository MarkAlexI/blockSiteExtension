import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readNativeWindowManager, startNativeWindowManager } from '../e2e/native-window-manager.mjs';

function desktop({child='0x123',supported=true,deleted=false}={}) {
  const calls = [];
  return {calls,run:async(command,args)=>{
    calls.push({command,args});
    if (args[0]==='-id') {
      if (deleted) throw Object.assign(new Error('BadWindow'),{code:1});
      return {stdout:`_NET_SUPPORTING_WM_CHECK(WINDOW): window id # ${child}`};
    }
    return {stdout:args.at(-1)==='_NET_SUPPORTED' ?
      `_NET_SUPPORTED(ATOM) = _NET_WM_STATE${supported?', _NET_ACTIVE_WINDOW':''}` :
      '_NET_SUPPORTING_WM_CHECK(WINDOW): window id # 0x000123'};
  }};
}

test('a live self-referencing EWMH check window with activation support is reusable', async () => {
  const model = desktop();
  assert.match(await readNativeWindowManager(model),/0x000123/);
  assert.equal(model.calls.length,3);
});

for (const [name,options] of [['deleted child',{deleted:true}],['different child',{child:'0x456'}],
  ['missing native activation',{supported:false}]]) {
  test(`a ${name} cannot satisfy native desktop readiness`, async () => {
    assert.equal(await readNativeWindowManager(desktop(options)),null);
  });
}

test('a stale desktop marker starts an owned manager and stops only that process once', async () => {
  const output = await mkdtemp(path.join(tmpdir(),'bd-window-manager-'));
  const stale = desktop({deleted:true}), live = desktop();
  let spawned = false;
  const kills = [];
  const child = new EventEmitter(); child.pid=12345;
  child.kill = signal => {kills.push(signal);queueMicrotask(()=>child.emit('exit',0));return true;};
  try {
    const manager = await startNativeWindowManager(output,{platform:'linux',env:{DISPLAY:':99'},
      run:(...args)=>(spawned?live:stale).run(...args),
      spawnProcess:(command,args)=>{assert.equal(command,'openbox');assert.deepEqual(args,['--sm-disable']);spawned=true;return child;}});
    assert.equal(manager.evidence.processId,12345);
    await manager.close(); await manager.close();
    assert.deepEqual(kills,['SIGTERM']);
  } finally {await rm(output,{recursive:true,force:true});}
});

test('a healthy pre-existing manager is never replaced or killed', async () => {
  const model = desktop();
  const manager = await startNativeWindowManager('unused',{platform:'linux',env:{DISPLAY:':99'},run:model.run,
    spawnProcess:()=>assert.fail('do not replace a healthy system desktop')});
  assert.equal(manager.evidence.source,'existing window manager'); await manager.close();
});
