import { test } from './fixtures.mjs';
import { proFeedbackScenarios } from './pro-feedback-scenarios.mjs';
for (const scenario of proFeedbackScenarios) {
  test(scenario.title, async ({ extension }) => scenario.run(extension));
}
