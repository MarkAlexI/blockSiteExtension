import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { installAddFocusTimerBarrier } from '../e2e/add-focus-timer-barrier.mjs';

function fixture() {
  const target = () => {
    const listeners = new Map();
    return {
      addEventListener(type, handler) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(handler);
      },
      removeEventListener(type, handler) { listeners.get(type)?.delete(handler); },
      click() { for (const handler of [...(listeners.get('click') || [])]) handler(); },
      count() { return [...listeners.values()].reduce((sum, items) => sum + items.size, 0); }
    };
  };
  const add = target(), window = target(), timers = new Map();
  let now = 0, serial = 0;
  const nativeSet = window.setTimeout = (callback, delay, ...args) => {
    const id = ++serial;
    timers.set(id, { at: now + Number(delay), callback, args });
    return id;
  };
  const nativeClear = window.clearTimeout = id => timers.delete(id);
  const document = { querySelector: () => add, activeElement: null };
  const field = () => ({ focus() { document.activeElement = this; } });
  const url = field(), chosen = field();
  vm.runInNewContext(`(${installAddFocusTimerBarrier.toString()})()`, { window, document });
  return {
    window, document, url, chosen, nativeSet, nativeClear, add,
    barrier: window.__bdAddFocusTimerBarrier,
    click(schedule = () => {}) { add.click(); schedule(); window.click(); },
    async advance(ms) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at > now) continue;
        timers.delete(id);
        timer.callback(...timer.args);
      }
      await Promise.resolve();
    }
  };
}

test('a 243ms automation delay still selects the field before delivery of the Add timer', async () => {
  const f = fixture();
  let observed;
  f.click(() => {
    f.url.focus();
    f.window.setTimeout(() => { observed = f.document.activeElement; }, 100);
  });
  await f.advance(243);
  assert.equal(observed, undefined);
  f.chosen.focus();
  const evidence = await f.barrier.release();
  assert.equal(observed, f.chosen);
  assert.equal(evidence.held, 1);
  assert.equal(evidence.delivered, 1);
  assert.equal(f.document.activeElement, f.chosen);
});

test('the barrier exposes the former focus-stealing callback instead of cancelling it', async () => {
  const f = fixture();
  f.click(() => {
    f.url.focus();
    f.window.setTimeout(() => f.url.focus(), 100);
  });
  await f.advance(243);
  f.chosen.focus();
  await f.barrier.release();
  assert.equal(f.document.activeElement, f.url, 'the regression really executes after field selection');
  assert.throws(() => assert.equal(f.document.activeElement, f.chosen), assert.AssertionError);
});

test('only 100ms function timers scheduled during Add are held; arguments and receiver survive', async () => {
  const f = fixture(), calls = [];
  f.window.setTimeout(() => calls.push('before'), 100);
  f.click(() => {
    f.window.setTimeout(() => calls.push('99'), 99);
    f.window.setTimeout(() => calls.push('101'), 101);
    f.window.setTimeout(function (...args) {
      assert.equal(this, f.window);
      calls.push(args.join(':'));
    }, '100', 'held', 7);
  });
  f.window.setTimeout(() => calls.push('after'), 100);
  await f.advance(243);
  assert.deepEqual(calls, ['before', '99', '101', 'after']);
  await f.barrier.release();
  assert.deepEqual(calls, ['before', '99', '101', 'after', 'held:7']);
  assert.equal(f.barrier.read().held, 1);
});

test('cancelling a held timer before or after its native deadline never delivers it', async () => {
  for (const due of [false, true]) {
    const f = fixture();
    let id;
    f.click(() => { id = f.window.setTimeout(() => assert.fail('cancelled callback ran'), 100); });
    if (due) await f.advance(243);
    f.window.clearTimeout(id);
    await f.barrier.release();
    assert.equal(f.barrier.read().delivered, 0);
  }
});

test('release waits for the real deadline and permits cancellation while waiting', async () => {
  const f = fixture();
  let id, completed = false;
  f.click(() => { id = f.window.setTimeout(() => assert.fail('cancelled callback ran'), 100); });
  const release = f.barrier.release().then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false);
  f.window.clearTimeout(id);
  await release;
  assert.equal(f.window.setTimeout, f.nativeSet);
  assert.equal(f.window.clearTimeout, f.nativeClear);
  assert.equal(f.add.count() + f.window.count(), 0);
});

test('cleanup restores native timers and listeners even when a held callback throws', async () => {
  const f = fixture();
  f.click(() => { f.window.setTimeout(() => { throw new Error('callback failed'); }, 100); });
  await f.advance(243);
  await assert.rejects(f.barrier.release(), /callback failed/);
  assert.equal(f.window.setTimeout, f.nativeSet);
  assert.equal(f.window.clearTimeout, f.nativeClear);
  assert.equal(f.add.count() + f.window.count(), 0);
});
