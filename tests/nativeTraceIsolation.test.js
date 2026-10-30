import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function configure(state) {
  const source = await readFile(new URL('../e2e/fixtures.mjs', import.meta.url), 'utf8');
  const body = source.match(/  async configureContext\(\) \{([\s\S]*?)\n  \}\n/);
  assert.ok(body);
  return vm.runInNewContext(`(async function() {${body[1]}\n})`).call(state);
}

for (const tags of [[], ['@native-visibility'], ['@native-visibility', '@native-no-activation']]) {
  test(`actual trace configuration isolates only activation-free probes ${JSON.stringify(tags)}`, async () => {
    const calls = [];
    const state = { testInfo: { tags }, context: { tracing: { async start(options) {
      calls.push({ kind: 'trace', options: structuredClone(options) });
    } }, async route() { calls.push({ kind: 'route' }); } } };
    await configure(state);
    assert.deepEqual(calls.map(call => call.kind), ['trace', 'route']);
    assert.deepEqual(calls[0].options, { screenshots: true,
      snapshots: !tags.includes('@native-no-activation'), sources: true });
    assert.equal(state.traceStarted, true);
  });
}

test('a trace setup failure cannot be reported as an isolated sound environment', async () => {
  let routed = false;
  const state = { testInfo: { tags: ['@native-no-activation'] }, context: {
    tracing: { async start() { throw new Error('trace setup refused'); } },
    async route() { routed = true; }
  } };
  await assert.rejects(configure(state), /trace setup refused/);
  assert.equal(routed, false);
  assert.equal(state.traceStarted, undefined);
});

test('the real native audio specification applies the activation-isolation tag', async () => {
  const source = await readFile(new URL('../e2e/focus-sound.spec.mjs', import.meta.url), 'utf8');
  assert.match(source, /tag: \['@native-visibility', '@native-no-activation'\]/);
});
