import { test } from './fixtures.mjs';
import { multiWindowScenarios } from './multi-window-scenarios.mjs';
import { startNativeWindowManager } from './native-window-manager.mjs';

let desktop;
test.beforeAll(async ({}, testInfo) => {
  desktop = await startNativeWindowManager(testInfo.outputPath('desktop'));
});
test.afterAll(async () => { await desktop?.close(); });
for (const scenario of multiWindowScenarios) {
  test(scenario.title, { tag: '@native-visibility' }, async ({ extension: e }, testInfo) => {
    await testInfo.attach('native-desktop', { contentType: 'application/json', body: JSON.stringify(desktop.evidence) });
    await scenario.run(e);
  });
}
