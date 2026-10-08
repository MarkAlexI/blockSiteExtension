import { test } from './fixtures.mjs';
import { dayBoundaryScenarios } from './day-boundary-scenarios.mjs';

for (const scenario of dayBoundaryScenarios) {
  // Resolve the native process timezone once, immediately before the first
  // launch. A fresh install has the post-initialization Options barrier;
  // an empty-profile browser restart has no equivalent completion marker.
  const scenarioTest = test.extend({
    dayBoundarySetup: async ({}, use) => use(scenario.initialSetup()),
    initialTimezone: async ({ dayBoundarySetup }, use) => use(dayBoundarySetup.timezone)
  });
  scenarioTest(`${scenario.title} @native-visibility`, async ({ extension, dayBoundarySetup }) =>
    scenario.run(extension, dayBoundarySetup));
}
