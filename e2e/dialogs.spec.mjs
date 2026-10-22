import { test } from './fixtures.mjs';
import { dialogScenarios } from './dialog-scenarios.mjs';
for (const scenario of dialogScenarios) {
  test(scenario.title, async ({ extension }) => scenario.run(extension));
}
