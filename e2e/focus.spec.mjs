import { test } from './fixtures.mjs';
import { focusScenarios } from './focus-scenarios.mjs';
for (const scenario of focusScenarios) {
  test(scenario.title, async ({ extension }) => scenario.run(extension));
}
