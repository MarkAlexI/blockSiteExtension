import { test } from './fixtures.mjs';
import { popupLayoutScenarios } from './popup-layout-scenarios.mjs';

for (const scenario of popupLayoutScenarios) {
  test(scenario.title, scenario.nativeToolbar ? { tag: '@native-visibility' } : {},
    async ({ extension }) => scenario.run(extension));
}
