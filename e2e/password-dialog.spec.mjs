import { test } from './fixtures.mjs';
import { passwordDialogScenarios } from './password-dialog-scenarios.mjs';
for (const scenario of passwordDialogScenarios) {
  test(scenario.title, async ({ extension }) => scenario.run(extension));
}
