# Chromium macOS CI follow-up — November 5, 2026

Inspected [run 41917095028](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/41917095028),
commit `c5b6f4d60add6fc55574da2c62e2ad5e95f41c54`.
All four Linux groups and Extension CI passed. macOS arm64 completed 23/24;
the x64 job was cancelled and has no retrievable log or result artifact.
Cancellation is not a passing or diagnosed browser result.

## Observed arm64 failure

Scenario 20 failed in the first reader check after a native browser restart:
rendered usage parsed as `null` instead of `[0, 10]`. The actual saved state shows
the correct current day, empty spent usage, no pending journal and the intact
Daily Limit rule. This is not evidence of failed day/journal recovery.

The read-only failure attachments show `chrome.i18n.getMessage()` returning empty
strings in the worker and every extension page, including for `@@extension_id`,
`@@ui_locale` and `@@bidi_dir`. Fetching the packaged default catalog returns
HTTP 200 with the correct strings/placeholders. Options titles are `header` and
Popup usage is the literal `daily_limit_usage`. No catalog bytes or native API
results were replaced in this inspection.

## Fixture correction and limits

The owned native launcher uses `--load-extension` on every ordinary process
restart. That performs a new CLI installation, but the old fixture skipped the
install/localization barrier whenever its in-memory `installed` flag was true.
The failed restart receipt confirms `installObserved: true` and
`installReady: null`; it cleared that new install view before localized readiness
was observed. Initial launches already had the stricter barrier.

Readiness now follows the actual startup arguments: a CLI-loaded restart keeps
the same install/localization barrier as the first launch. It observes the real
localized install title before any page cleanup or scenario CDP attachment.
Permanently registered profiles, whose startup arguments remove the CLI install
switches, retain their existing no-install-wait/session-restoration path.

Regression models cover pending localization during a seeded CLI restart and
explicit rejection of a literal translation key without closing/reloading that
view. Existing 15-second setup/scenario deadlines, native i18n assertions,
visibility checks, 24/24 acceptance and zero retries remain unchanged.

This corrects a demonstrated missing setup barrier. It remains a hypothesis
that premature cleanup caused the browser's empty native i18n cache: the next
real macOS run must confirm the effect. A still-empty native catalog fails setup;
there is no fallback catalog, reload retry, skipped scenario or claimed product
fix. Runtime sources and extension version 5.5.10 are unchanged.
