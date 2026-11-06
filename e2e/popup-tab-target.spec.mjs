import { test } from './fixtures.mjs';
import { popupTabTargetScenarios } from './popup-tab-target-scenarios.mjs';

for (const scenario of popupTabTargetScenarios) {
  test(scenario.title, { tag: '@native-visibility' }, async ({ extension }) => scenario.run(extension));
}
