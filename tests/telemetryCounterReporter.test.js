import test from 'node:test';
import assert from 'node:assert/strict';
import { recordTelemetryCounter } from '../telemetry/telemetryCounterReporter.js';

test('telemetry counter reporter sends allowlisted counters through Chromium messaging', () => {
  const messages = [];
  let lastErrorReads = 0;
  const runtimeApi = {
    get lastError() {
      lastErrorReads += 1;
      return { message: 'No receiver' };
    },
    sendMessage(message, callback) {
      messages.push(message);
      callback();
    }
  };

  const reported = recordTelemetryCounter('feedback_review_clicked', { runtimeApi });

  assert.equal(reported, true);
  assert.deepEqual(messages, [{
    type: 'telemetry:incrementCounter',
    name: 'feedback_review_clicked'
  }]);
  assert.equal(lastErrorReads, 1);
});

test('telemetry counter reporter rejects unknown counters before messaging', () => {
  let calls = 0;
  const runtimeApi = {
    sendMessage() { calls += 1; }
  };

  assert.equal(recordTelemetryCounter('feedback_private_value', { runtimeApi }), false);
  assert.equal(calls, 0);
});

test('telemetry counter reporter never propagates runtime messaging failures', () => {
  const runtimeApi = {
    sendMessage() { throw new Error('runtime unavailable'); }
  };

  assert.doesNotThrow(() => {
    assert.equal(recordTelemetryCounter('feedback_prompt_shown', { runtimeApi }), false);
  });
});
