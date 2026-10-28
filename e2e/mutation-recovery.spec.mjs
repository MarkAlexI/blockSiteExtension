import { test } from './fixtures.mjs';
import { interruptedMutationScenarios, mutationContinuityScenario } from './mutation-recovery-scenarios.mjs';
import { createMutationNavigationFixture } from './mutation-navigation.mjs';
import { startNativeWindowManager } from './native-window-manager.mjs';

let desktop;
test.beforeAll(async ({}, info) => { desktop = await startNativeWindowManager(info.outputPath('mutation-desktop')); });
test.afterAll(async () => { await desktop?.close(); });

for (const scenario of interruptedMutationScenarios) test(scenario.title,
  { tag: ['@native-visibility', '@native-startup-restore'] }, async ({ extension }) => scenario.run(extension));

test(mutationContinuityScenario.title, { tag: ['@native-visibility', '@native-startup-restore'] }, async ({ extension: e }) => {
  const probe = await createMutationNavigationFixture();
  e.mutationNavigation = probe;
  e.startupFixture = { owns: url => probe.owns(url) };
  try { await mutationContinuityScenario.run(e); }
  finally { await probe.close(); }
});
