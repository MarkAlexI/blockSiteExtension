// Preserve the unfiltered local suite and its ordering. CI runs the same files
// in isolated jobs; native timers remain serial inside each job.
export const testFiles = Object.freeze([
  'dialogs.spec.mjs',
  'password-dialog.spec.mjs',
  'accessibility.spec.mjs',
  'chromium.spec.mjs',
  'recovery.spec.mjs',
  'readers.spec.mjs',
  'stale.spec.mjs',
  'focus.spec.mjs',
  'focus-sound.spec.mjs',
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
  'no-vary-search.spec.mjs',
  'popup-tab-target.spec.mjs',
  'pro-feedback.spec.mjs',
  'startup-restore-native.spec.mjs',
  'overdue.spec.mjs',
  'startup-responsiveness.spec.mjs',
  'upgrade.spec.mjs',
  'mutation-recovery.spec.mjs'
]);

const lifecycleFiles = new Set([
  'day-boundary.spec.mjs',
  'scheduled-expiry.spec.mjs',
  'idle-native.spec.mjs',
  'alarm-batch-native.spec.mjs',
  'cold-message-native.spec.mjs',
  'startup-restore-native.spec.mjs',
  'startup-responsiveness.spec.mjs',
  'mutation-recovery.spec.mjs'
]);

// Same initial acceptance scope as Firefox's 24 macOS smoke scenarios. These
// files use native headed browsers without Linux-only shortcuts or audio.
export const macosSmokeFiles = Object.freeze([
  'chromium.spec.mjs', 'readers.spec.mjs', 'stale.spec.mjs',
  'focus.spec.mjs', 'frames-native.spec.mjs'
]);

export function selectTestFiles(group = 'all') {
  if (!['all', 'core', 'lifecycle', 'overdue', 'upgrade', 'macos-smoke'].includes(group)) throw new Error(`Unknown BD_E2E_GROUP: ${group}`);
  if (group === 'macos-smoke') return testFiles.filter(file => macosSmokeFiles.includes(file));
  return testFiles.filter(file => group === 'all' ||
    (file === 'upgrade.spec.mjs' ? group === 'upgrade' :
      file === 'overdue.spec.mjs' ? group === 'overdue' :
      !['overdue','upgrade'].includes(group) && lifecycleFiles.has(file) === (group === 'lifecycle')));
}
