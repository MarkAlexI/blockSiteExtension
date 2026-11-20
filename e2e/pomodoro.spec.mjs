import { test } from './fixtures.mjs';
import { pomodoroScenarios } from './pomodoro-scenarios.mjs';
for (const scenario of pomodoroScenarios) {
  test(scenario.title, async ({ extension }) => scenario.run(extension));
}
