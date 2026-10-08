import { test } from './fixtures.mjs';
import { scheduledExpiryScenarios } from './scheduled-expiry-scenarios.mjs';

for (const scenario of scheduledExpiryScenarios) {
  test(scenario.title, async ({ extension }) => {
    test.setTimeout(scenario.timeout);
    await scenario.run(extension);
  });
}
