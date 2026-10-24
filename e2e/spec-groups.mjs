// Preserve the unfiltered local suite and its ordering. CI runs the same files
// in two isolated jobs; native timers remain serial inside each job.
export const testFiles = Object.freeze([
  'dialogs.spec.mjs',
  'password-dialog.spec.mjs',
  'accessibility.spec.mjs',
  'chromium.spec.mjs',
  'recovery.spec.mjs',
  'readers.spec.mjs',
  'stale.spec.mjs',
  'focus.spec.mjs',
  'popup-native.spec.mjs',
  'calendar.spec.mjs',
  'day-boundary.spec.mjs',
  'scheduled-expiry.spec.mjs',
  'idle-native.spec.mjs',
  'alarm-batch-native.spec.mjs',
  'cold-message-native.spec.mjs',
  'multi-window-native.spec.mjs',
  'session-restore-native.spec.mjs',
  'frames-native.spec.mjs',
  'pro-feedback.spec.mjs',
  'startup-restore-native.spec.mjs'
]);

const lifecycleFiles = new Set([
  'day-boundary.spec.mjs',
  'scheduled-expiry.spec.mjs',
  'idle-native.spec.mjs',
  'alarm-batch-native.spec.mjs',
  'cold-message-native.spec.mjs',
  'startup-restore-native.spec.mjs'
]);

export function selectTestFiles(group = 'all') {
  if (!['all', 'core', 'lifecycle'].includes(group)) throw new Error(`Unknown BD_E2E_GROUP: ${group}`);
  return testFiles.filter(file => group === 'all' || lifecycleFiles.has(file) === (group === 'lifecycle'));
}
