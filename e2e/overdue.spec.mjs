import { test } from './fixtures.mjs';
import { overdueScenarios } from './overdue-scenarios.mjs';

for (const scenario of overdueScenarios) {
  test(scenario.title, { tag: '@native-visibility' }, async ({ extension }) => {
    test.setTimeout(scenario.timeout);
    await scenario.run(extension);
  });
}
