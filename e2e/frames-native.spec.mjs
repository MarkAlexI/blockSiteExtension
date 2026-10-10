import { test } from './fixtures.mjs';
import { frameScenarios } from './frame-scenarios.mjs';

for (const scenario of frameScenarios) test(scenario.title, { tag: '@native-visibility' }, async ({ extension }) => {
  await scenario.run(extension);
});
