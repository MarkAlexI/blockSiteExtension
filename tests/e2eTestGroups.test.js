import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { testFiles, selectTestFiles } from '../e2e/spec-groups.mjs';

test('the full E2E list includes every actual spec file exactly once', async () => {
  const specs = (await readdir(new URL('../e2e/', import.meta.url))).filter(file => file.endsWith('.spec.mjs')).sort();
  assert.equal(new Set(testFiles).size, testFiles.length);
  assert.deepEqual([...testFiles].sort(), specs);
  assert.deepEqual(selectTestFiles(), testFiles);
});

test('the CI groups are nonempty, disjoint and cover the full suite', () => {
  const groups = ['core', 'lifecycle', 'overdue', 'upgrade'].map(selectTestFiles);
  assert.ok(groups.every(group => group.length > 0));
  const combined = groups.flat();
  assert.equal(new Set(combined).size, combined.length);
  assert.deepEqual(combined.sort(), [...testFiles].sort());
  assert.deepEqual(selectTestFiles('overdue'), ['overdue.spec.mjs']);
  assert.deepEqual(selectTestFiles('upgrade'), ['upgrade.spec.mjs']);
});

test('long expiry and idle-alarm scenarios keep their native tests in the lifecycle group', () => {
  const lifecycle = selectTestFiles('lifecycle');
  for (const file of ['scheduled-expiry.spec.mjs', 'idle-native.spec.mjs', 'alarm-batch-native.spec.mjs',
    'cold-message-native.spec.mjs', 'startup-restore-native.spec.mjs', 'startup-responsiveness.spec.mjs']) assert.ok(lifecycle.includes(file), file);
});

test('an invalid group fails instead of silently selecting an incomplete suite', () => {
  for (const value of ['', 'native', 'CORE', 'core,lifecycle', null]) assert.throws(() => selectTestFiles(value), /Unknown BD_E2E_GROUP/);
});
