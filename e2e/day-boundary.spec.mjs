import { test } from './fixtures.mjs';
import { dayBoundaryScenarios } from './day-boundary-scenarios.mjs';

for (const scenario of dayBoundaryScenarios) {
  test(`${scenario.title} @native-visibility`, async ({ extension }) => scenario.run(extension));
}
