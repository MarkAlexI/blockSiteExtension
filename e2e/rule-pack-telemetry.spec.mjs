import { test } from './fixtures.mjs';
import { rulePackTelemetryScenarios } from './rule-pack-telemetry-scenarios.mjs';

for (const scenario of rulePackTelemetryScenarios) {
  test(scenario.title, async ({ extension }) => scenario.run(extension));
}
