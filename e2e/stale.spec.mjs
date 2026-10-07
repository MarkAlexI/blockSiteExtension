import { test } from './fixtures.mjs';
import { staleScenarios } from './stale-scenarios.mjs';

for (const scenario of staleScenarios) {
  test(scenario.title, async ({ extension }) => {
    if (scenario.timeout) test.setTimeout(scenario.timeout);
    await scenario.run(extension);
  });
}
