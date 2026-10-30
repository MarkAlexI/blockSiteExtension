import { test } from './fixtures.mjs';
import { focusSoundScenarios } from './focus-sound-scenarios.mjs';
import { startNativeWindowManager } from './native-window-manager.mjs';

// Use the same noDefaults native connection as visibility/lifecycle probes.
// A raw evaluation on a framework-emulated page is not sufficient isolation.
let desktop;
test.beforeAll(async ({}, info) => {
  desktop = await startNativeWindowManager(info.outputPath('sound-desktop'));
});
test.afterAll(async () => { await desktop?.close(); });
for (const scenario of focusSoundScenarios) {
  test(scenario.title, { tag: ['@native-visibility', '@native-no-activation'] }, async ({ extension }) => scenario.run(extension));
}
