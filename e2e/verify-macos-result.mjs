import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { macosSmokeFiles } from './spec-groups.mjs';

export function verifyMacosResult(report, architecture) {
  assert.ok(['arm64', 'x64'].includes(architecture), 'expected native architecture is required');
  assert.equal(report.config?.metadata?.platform, 'darwin', 'results must come from macOS');
  assert.equal(report.config?.metadata?.architecture, architecture, 'native architecture must match the job');
  assert.equal(report.config?.metadata?.group, 'macos-smoke');
  assert.deepEqual(report.errors, [], 'runner errors must not be hidden');
  const specs = [];
  const visit = suites => {
    for (const suite of suites) {
      specs.push(...(suite.specs || []));
      visit(suite.suites || []);
    }
  };
  visit(report.suites);
  assert.equal(specs.length, 24, 'all 24 acceptance specs must execute');
  assert.equal(new Set(specs.map(spec => spec.id)).size, 24, 'spec identities must be unique');
  assert.deepEqual([...new Set(specs.map(spec => spec.file))].sort(), [...macosSmokeFiles].sort());
  for (const spec of specs) {
    assert.equal(spec.tests.length, 1, 'each spec must use exactly one browser project');
    const test = spec.tests[0];
    assert.equal(test.expectedStatus, 'passed', 'expected failures cannot satisfy acceptance');
    assert.equal(test.status, 'expected', `${spec.title} must pass`);
    assert.equal(test.results.length, 1, 'listing or retries cannot satisfy acceptance');
    assert.equal(test.results[0].status, 'passed', `${spec.title} body must pass`);
  }
  assert.equal(report.stats?.expected, 24);
  for (const status of ['skipped', 'unexpected', 'flaky']) assert.equal(report.stats?.[status], 0);
  return { platform: 'darwin', architecture, passed: specs.length, scope: 'macos-smoke' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = JSON.parse(await readFile(new URL('./results.json', import.meta.url), 'utf8'));
  console.log(JSON.stringify(verifyMacosResult(report, process.env.BD_EXPECTED_ARCH), null, 2));
}
