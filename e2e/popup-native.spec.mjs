import { test } from './fixtures.mjs';
import { popupNativeScenarios } from './popup-native-scenarios.mjs';

for (const scenario of popupNativeScenarios) {
  test(scenario.title, { tag: '@native-visibility' }, async ({ extension }) => scenario.run(extension));
}
