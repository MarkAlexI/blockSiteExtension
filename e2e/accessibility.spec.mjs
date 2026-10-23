import { test } from './fixtures.mjs';
import { accessibilityScenarios } from './accessibility-scenarios.mjs';
for (const scenario of accessibilityScenarios) {
  test(scenario.title, scenario.nativeViewport ? { tag: '@native-visibility' } : {}, async ({ extension }) => scenario.run(extension));
}
