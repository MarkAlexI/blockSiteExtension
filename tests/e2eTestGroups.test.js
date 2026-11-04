import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { testFiles, macosSmokeFiles, selectTestFiles } from '../e2e/spec-groups.mjs';

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

test('macOS smoke retains the original order and excludes Linux-only lifecycle, toolbar and audio backends', () => {
  const selected = selectTestFiles('macos-smoke');
  assert.deepEqual(selected, testFiles.filter(file => macosSmokeFiles.includes(file)));
  assert.equal(selected.length, 5);
  for (const file of ['chromium.spec.mjs', 'readers.spec.mjs', 'stale.spec.mjs', 'focus.spec.mjs', 'frames-native.spec.mjs']) {
    assert.ok(selected.includes(file), `missing acceptance file ${file}`);
  }
  for (const file of ['focus-sound.spec.mjs', 'overdue.spec.mjs', 'upgrade.spec.mjs',
    'startup-restore-native.spec.mjs', 'session-restore-native.spec.mjs', 'popup-native.spec.mjs']) {
    assert.ok(!selected.includes(file), `unsupported smoke backend ${file}`);
  }
  assert.equal(new Set(selected).size, selected.length);
  assert.deepEqual(selectTestFiles(), testFiles, 'local full-suite selection is unchanged');
});
