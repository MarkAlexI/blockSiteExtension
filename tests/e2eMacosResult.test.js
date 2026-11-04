import test from 'node:test';
import assert from 'node:assert/strict';
import { macosSmokeFiles } from '../e2e/spec-groups.mjs';
import { verifyMacosResult } from '../e2e/verify-macos-result.mjs';

const passed = architecture => ({
  config: { metadata: { platform: 'darwin', architecture, group: 'macos-smoke' } }, errors: [],
  suites: [{ suites: [{ specs: Array.from({ length: 24 }, (_, index) => ({
    id: `acceptance-${index}`, title: `acceptance ${index}`, file: macosSmokeFiles[index % macosSmokeFiles.length],
    tests: [{ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed' }] }]
  })) }] }], stats: { expected: 24, skipped: 0, unexpected: 0, flaky: 0 }
});

test('macOS acceptance requires native execution on the requested architecture', () => {
  for (const architecture of ['arm64', 'x64']) {
    assert.equal(verifyMacosResult(passed(architecture), architecture).passed, 24);
  }
  assert.throws(() => verifyMacosResult(passed('x64'), 'arm64'), /architecture/);
  assert.throws(() => verifyMacosResult(passed('x64'), undefined), /architecture/);
  const linux = passed('x64'); linux.config.metadata.platform = 'linux';
  assert.throws(() => verifyMacosResult(linux, 'x64'), /macOS/);
});

test('a green summary cannot hide skipped bodies, expected failures, retries or duplicate specs', () => {
  const cases = [
    spec => { spec.tests[0].results = []; },
    spec => { spec.tests[0].results[0].status = 'skipped'; },
    spec => { spec.tests[0].expectedStatus = 'failed'; },
    spec => { spec.tests[0].results.push({ status: 'passed' }); },
    spec => { spec.tests[0].status = 'flaky'; }
  ];
  for (const mutate of cases) {
    const report = passed('arm64'); mutate(report.suites[0].suites[0].specs[0]);
    assert.throws(() => verifyMacosResult(report, 'arm64'));
  }
  const duplicate = passed('arm64'); duplicate.suites[0].suites[0].specs[0].id = 'acceptance-1';
  assert.throws(() => verifyMacosResult(duplicate, 'arm64'), /unique/);
  const error = passed('arm64'); error.errors.push({ message: 'setup interrupted' });
  assert.throws(() => verifyMacosResult(error, 'arm64'), /runner errors/);
});
