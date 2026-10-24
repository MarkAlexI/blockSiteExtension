import { defineConfig } from 'playwright/test';
import { selectTestFiles } from './spec-groups.mjs';

export default defineConfig({
  testDir: '.',
  testMatch: selectTestFiles(process.env.BD_E2E_GROUP),
  fullyParallel: false,
  workers: 1,
  // Visibility/accounting scenarios require a browser with a real tab strip.
  // Linux without a desktop display uses xvfb-run (also in the CI workflow).
  use: { headless: process.env.BD_E2E_HEADLESS === '1' },
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: process.env.BD_E2E_RESULTS || 'test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: process.env.BD_E2E_HTML || 'playwright-report', open: 'never' }],
    ['json', { outputFile: process.env.BD_E2E_JSON || 'results.json' }]
  ],
  projects: [{ name: 'chromium-extension' }]
});
