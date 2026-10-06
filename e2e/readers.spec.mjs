import { test } from './fixtures.mjs';
import { readerScenarios } from './reader-scenarios.mjs';

for (const scenario of readerScenarios) {
  test(scenario.title, async ({ extension }) => scenario.run(extension));
}
