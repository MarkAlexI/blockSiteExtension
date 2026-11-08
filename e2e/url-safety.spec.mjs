import { test } from './fixtures.mjs';
import { urlSafetyScenarios } from './url-safety-scenarios.mjs';

for (const scenario of urlSafetyScenarios) {
  test(scenario.title, async ({ extension }) => scenario.run(extension));
}
