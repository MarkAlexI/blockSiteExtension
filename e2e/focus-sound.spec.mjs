import { test } from './fixtures.mjs';
import { focusSoundScenarios } from './focus-sound-scenarios.mjs';
for (const scenario of focusSoundScenarios) {
  test(scenario.title, async ({ extension }) => scenario.run(extension));
}
