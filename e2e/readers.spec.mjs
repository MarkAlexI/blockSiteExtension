import { test } from './fixtures.mjs';
import { readerScenarios } from './reader-scenarios.mjs';

for (const scenario of readerScenarios) {
  test(scenario.persistent ? `${scenario.title} @native-visibility` : scenario.title, async ({ extension }) => scenario.run(extension));
}
