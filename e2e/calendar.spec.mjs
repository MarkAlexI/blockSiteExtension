import { test } from './fixtures.mjs';
import { calendarScenarios } from './calendar-scenarios.mjs';

for (const scenario of calendarScenarios) {
  test(scenario.title, async ({ extension }) => {
    await scenario.run(extension);
  });
}
