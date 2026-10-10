import { test } from './fixtures.mjs';
import { sessionRestoreScenarios } from './session-restore-scenarios.mjs';
import { nativeTabShortcutBackend } from './native-tab-shortcut.mjs';
import { startNativeWindowManager } from './native-window-manager.mjs';

let desktop, keyboard;
test.beforeAll(async ({}, testInfo) => {
  desktop = await startNativeWindowManager(testInfo.outputPath('desktop'));
  keyboard = await nativeTabShortcutBackend();
});
test.afterAll(async () => { await desktop?.close(); });
for (const scenario of sessionRestoreScenarios) {
  test(scenario.title, { tag: '@native-visibility' }, async ({ extension: e }, testInfo) => {
    await testInfo.attach('native-tab-shortcut-backend', { contentType: 'application/json', body: JSON.stringify(keyboard) });
    await scenario.run(e);
  });
}
