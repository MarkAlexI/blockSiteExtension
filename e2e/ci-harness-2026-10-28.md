# Chromium E2E failures observed on October 28, 2026

Source: [run 40668357788](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/40668357788),
commit `6ca3f8f90db80cd4cc83c4abbf92175f26c9fec0`, extension 5.5.4,
Playwright 1.62.1 / Chromium 151.0.7922.34 / Ubuntu 24.04 / X11.
The Node job passed. Native lifecycle (including DNR startup) and overdue passed.
Core failed only sound scenarios 68/69; upgrade failed during initial installation.
Firefox's corresponding [run 40668566658](https://github.com/MarkAlexI/blockSiteFirefox/actions/runs/40668566658)
passed all groups, including its new DNR scenario.

## Sound: observed failure and scoped isolation change

Both sound assertions failed before sending a preview request: `hasBeenActive`
and `isActive` changed from false on `about:blank` to true on the Options page.
The same failures predate the DNR patch in
[run 40503038981](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/40503038981).
The trace contains no public `Frame.evaluate` before these assertions; the
localization reads visible later in the trace are teardown diagnostics.
The trace alone does not identify the exact source of activation.

These scenarios previously used `launchPersistentContext` with normal framework
overrides even though their explicit reads used raw `Runtime.evaluate` with
`userGesture:false`. They now select the existing owned native launch and
`connectOverCDP({noDefaults:true})`, with an owned window manager. The sound helper
rejects the framework-created Chromium context before opening a page. The native
connection avoids the default focus/media emulation used by the ordinary fixture.

The strict activation assertions, in-request activation guard, native playback,
trusted Listen click, alarm completion and resource-close checks remain. No
activation is cleared, fabricated or waited out. Tracing remains enabled. Firefox
keeps its existing native BiDi path. This is a test-environment isolation change;
a hosted browser run must confirm whether it resolves the observed activation.
Production audio behavior is not diagnosed as defective by these failures.

## Upgrade: observed failure and native dialog handling

The upgrade scenario failed before checking update behavior. The setup artifact
contains no extension worker or Options target, no installation receipt, and GTK
`WIDGET_REALIZED_FOR_EVENT` errors during native path input. The previous run's
upgrade was green. This supports an input/setup failure but does not prove which
individual input was lost.

Native directory entry now uses xdotool's standard 12 ms typing pace instead of
a zero-delay key burst. After the single Open action, setup waits for the owned
dialog to disappear before querying installed metadata. A dialog that stays open
or changes identity fails explicitly. The original 15-second deadline, exact
path/version/UNPACKED/ENABLED checks and one installation attempt remain.

On failure, `native-cdp-setup-failure.nativeInstallationFailure` records the stage,
expected path/version, owned dialog state, elapsed time and last metadata observed
from `developerPrivate.getExtensionsInfo`. This distinguishes a dialog acceptance
problem from a closed dialog with absent or incorrect installed metadata.

## Verification and next native acceptance

Run `npm run check` from the repository root. Focused regression models:

```bash
node --test tests/soundOptions.test.js tests/nativeInstall.test.js
```

These models verify context rejection, gesture-free reads, retained activation
failures, dialog closure and strict metadata diagnostics. They are not browser
acceptance. Apply this patch after the DNR patch; version remains 5.5.4 because
only `e2e/` and `tests/` change.

The unchanged CI matrix must run `core` and `upgrade` to confirm the fixes.
No retry, timeout increase, disabled assertion, production change or store release
is included. Check the delivery checkpoint for completed local checks and pending
native results.
