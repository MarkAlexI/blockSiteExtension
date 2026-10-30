import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { interruptedMutationScenarios } from '../e2e/mutation-recovery-scenarios.mjs';

async function method(name = 'interruptAndRestart') {
  const source = await readFile(new URL('../e2e/fixtures.mjs', import.meta.url), 'utf8');
  const body = source.match(new RegExp(`  async ${name}\\(\\) \\{([\\s\\S]*?)\\n  \\}\\n`));
  assert.ok(body, `actual harness ${name} method`);
  return body[1];
}
const expect = actual => ({ toBe: expected => assert.equal(actual, expected),
  not: { toBe: expected => assert.notEqual(actual, expected) } });

test('the actual harness kills its owned process, retains failure evidence and restarts without reseeding', async () => {
  const calls = [];
  let state;
  const interruptProfileBrowser = async input => { calls.push('kill'); assert.equal(input.profile, state.profile);
    return { signal: 'SIGKILL', pid: input.pid }; };
  const run = vm.runInNewContext(`(async function() {${await method()}\n})`, {
    interruptProfileBrowser, expect, assert, EnvironmentError: Error
  });
  if ((await readFile(new URL('../e2e/fixtures.mjs', import.meta.url), 'utf8')).includes('class ExtensionHarness')) {
    // Both variants use the same test; select the API by the method's native
    // ownership contract rather than importing the browser automation package.
    const chromium = (await method()).includes('this.nativeOwner');
    if (chromium) {
      const owner = { diagnostics: async () => ({ pid: 700 }), waitForExit: async () => {
        calls.push('prove-signal-exit'); return { signalCode: 'SIGKILL' };
      } };
      state = { profile: '/tmp/owned-interruption', nativeOwner: owner, installed: true, startupInstallation: {},
        id: 'owned', interruptionBaseline: { extensionId: 'owned', profile: '/tmp/owned-interruption' },
        saveTrace: async () => { calls.push('trace'); },
        async launch() { calls.push('launch'); assert.equal(this.worker, null); assert.equal(this.options.length, 0);
          this.nativeOwner = { diagnostics: async () => ({ pid: 701 }) }; }, seed() { assert.fail('never reseed'); } };
      const result = await run.call(state);
      assert.deepEqual(calls, ['trace', 'kill', 'prove-signal-exit', 'launch']);
      assert.equal(result.afterPid, 701); assert.equal(result.beforePid, 700);
    } else {
      state = { profile: '/tmp/owned-interruption', config: { installation: 'persistent' }, sessionReady: true,
        result: { browser: { 'moz:processID': 700 } }, driver: { quit() { assert.fail('never graceful quit'); } },
        bidi: { close: async () => { calls.push('close-bidi'); } }, service: { kill: async () => { calls.push('close-driver'); } },
        async launch(options) { calls.push('launch'); assert.equal(options.restarted, true);
          assert.equal(this.driver, null); this.result.browser['moz:processID'] = 701; }, seed() { assert.fail('never reseed'); } };
      const result = await run.call(state);
      assert.deepEqual(calls, ['kill', 'close-bidi', 'close-driver', 'launch']);
      assert.equal(result.afterPid, 701); assert.equal(result.beforePid, 700);
    }
    assert.equal(state.interruptionEvidence.signal, 'SIGKILL');
  } else assert.fail('missing extension harness');
});

test('the actual harness refuses an unowned or nonpersistent browser before signaling', async () => {
  let killed = false;
  const run = vm.runInNewContext(`(async function() {${await method()}\n})`, {
    interruptProfileBrowser: async () => { killed = true; }, expect, assert, EnvironmentError: Error
  });
  await assert.rejects(run.call({ config: { installation: 'temporary' } }));
  assert.equal(killed, false);
});

function baselineFixture({ exitCode = 0, signalCode = null, nextId = 'owned', nextPid = 701 } = {}) {
  const calls = [];
  const state = { profile: '/tmp/owned-interruption', id: 'owned', installed: true,
    startupInstallation: { id: 'owned' }, worker: {}, options: [{}],
    nativeOwner: { diagnostics: async () => ({ pid: 700 }), async waitForExit() {
      calls.push('prove-clean-exit'); return { exitCode, signalCode };
    } },
    nativeBrowser: { async newBrowserCDPSession() { return { async send(command) {
      assert.equal(command, 'Browser.close'); calls.push('Browser.close');
    } }; } },
    async saveTrace() { calls.push('trace'); },
    async launch() {
      calls.push('launch-saved-profile');
      assert.equal(this.installed, true, 'the installer must not run again');
      assert.equal(this.worker, null);
      assert.equal(this.options.length, 0);
      this.nativeOwner = { diagnostics: async () => ({ pid: nextPid }) };
      this.id = nextId;
    },
    seed() { assert.fail('baseline cannot seed or repair production state'); }
  };
  return { state, calls };
}

test('a clean installation baseline proves saved identity before any mutation or SIGKILL', async () => {
  const run = vm.runInNewContext(`(async function() {${await method('prepareInterruptionBaseline')}\n})`, { expect });
  const { state, calls } = baselineFixture();
  const result = await run.call(state);
  assert.deepEqual(calls, ['trace', 'Browser.close', 'prove-clean-exit', 'launch-saved-profile']);
  assert.equal(result, state.interruptionBaseline);
  assert.equal(result.extensionId, 'owned');
  assert.equal(result.profile, state.profile);
  assert.equal(result.beforePid, 700); assert.equal(result.afterPid, 701);
});

for (const exit of [{ exitCode: 1 }, { signalCode: 'SIGTERM' }]) {
  test(`an unclean installation baseline cannot proceed to relaunch or mutation ${JSON.stringify(exit)}`, async () => {
    const run = vm.runInNewContext(`(async function() {${await method('prepareInterruptionBaseline')}\n})`, { expect });
    const { state, calls } = baselineFixture(exit);
    await assert.rejects(run.call(state));
    assert.equal(calls.includes('launch-saved-profile'), false);
    assert.equal(state.interruptionBaseline, undefined);
  });
}

for (const options of [{ nextId: 'different' }, { nextPid: 700 }]) {
  test(`a mismatched saved installation cannot qualify for interruption ${JSON.stringify(options)}`, async () => {
    const run = vm.runInNewContext(`(async function() {${await method('prepareInterruptionBaseline')}\n})`, { expect });
    const { state } = baselineFixture(options);
    await assert.rejects(run.call(state));
    assert.equal(state.interruptionBaseline, undefined);
  });
}

test('interruption requires the baseline of the same profile and extension before signaling', async () => {
  let killed = false;
  const run = vm.runInNewContext(`(async function() {${await method()}\n})`, {
    interruptProfileBrowser: async () => { killed = true; }, expect
  });
  for (const interruptionBaseline of [undefined, { extensionId: 'other', profile: '/tmp/owned' },
    { extensionId: 'owned', profile: '/tmp/other' }]) {
    await assert.rejects(run.call({ id: 'owned', profile: '/tmp/owned', installed: true,
      startupInstallation: {}, nativeOwner: {}, interruptionBaseline }), /verified clean installation baseline/);
  }
  assert.equal(killed, false);
});

for (const scenario of interruptedMutationScenarios) {
  test(`scenario ${scenario.id} rejects a failed installation baseline before seeding`, async () => {
    const calls = [];
    const e = { result: {}, async prepareInterruptionBaseline() {
      calls.push('baseline'); throw new Error('baseline refused');
    }, seed() { assert.fail('no mutation fixture before verified installation'); } };
    await assert.rejects(scenario.run(e), /baseline refused/);
    assert.deepEqual(calls, ['baseline']);
    assert.equal(e.result.mutationEvidence.at(-1).value.stage, 'verify persistent installation before mutation seeding');
  });
}
