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

This corrected a demonstrated missing setup barrier. In the subsequent native
run below, scenario 20 passed on both Mac architectures. That observation is
limited to the inspected runs, not a guarantee about every browser i18n failure.
A still-empty native catalog fails setup; no fallback catalog or reload retry
was added. Runtime sources and extension version 5.5.10 are unchanged.

## Subsequent native run: startup target discovery

[Run 41924762714](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/41924762714),
commit `bafcb92d73cafbbf77d012926e6289b788512f17`, passed all four Linux groups
and Extension CI. Intel macOS passed **24/24**, including report verification.
Apple Silicon completed 23/24; the previous reader/restart scenario passed.

The new arm64 failure was in scenario 08's **fixture setup**, before its body
started. The first `GET /json/list` timed out at its one-second request limit.
The owned process was still running, and the subsequent diagnostic query
successfully returned its blank tab and browser-UI target. No accounting or
visibility assertion ran in that failed scenario.

`prepareNativePages` now continues read-only target discovery after explicit
transport/timeout failures, within its original **15-second total setup budget**.
Each request still has at most one second and is capped by the remaining total
budget. HTTP errors, malformed JSON and non-list responses fail immediately.
The existing install/localization guard and its deadline remain in place.

Only `GET /json/list` startup observations continue this way. Target creation,
closure, installation, messages and scenario bodies are not replayed. Ordinary
`targetsAt` calls, idle/cold-worker observation and native session restoration
retain their strict single-request behavior. Successful setup receipts record
attempts/transient failures; exhausted discovery records its original budget,
attempt count and cause in `readinessFailure`.

The stalled-first-response regression failed on the preceding code and passes
after this change. Negative controls retain total-budget failure without page
mutation, immediate HTTP/protocol failure, and strict non-startup observation.
These are real loopback HTTP harness tests, not native macOS acceptance. The
next GitHub Mac run must confirm this setup change. The 24/24 gate, zero scenario
retries, workflow budgets, runtime and version remain unchanged.

## Subsequent native run: Pro panel action during expansion

[Run 41931618978](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/41931618978),
commit `f0380533e20b00577d607bbda204cf37f53000df`, passed all four Linux groups
and Extension CI. Apple Silicon passed **24/24**, including report verification.
Intel completed **23/24**, failing scenario 10 after its logout click: saved
`credentials.isPro` stayed true for the original 15-second assertion. Native
localization was correct in the worker and both Options pages.

The Playwright trace establishes a missing UI precondition. The logout action
started about 6 ms after the Pro-toggle click completed. The ancestor was still
in its 400 ms `max-height` transition, visibly clipping the panel. Playwright
reported the child button stable, then its scroll-into-view operation scrolled
the `overflow: hidden` wrapper. The input snapshot records wrapper `scrollTop`
224; the after snapshot 16 ms later records 207. The pointer coordinates did
not move with that 17 px layout shift. This can lose a click between pointer
press and release. The trace did not record DOM pointer events or worker
message receipt, so the precise event-dispatch outcome is not established.

The four Pro-action scenarios in `chromium.spec.mjs` now open the panel once
and observe that it is open, non-inert, fully expanded and has no running or
pending panel animation. Only then do the existing Playwright fill/click actions
run. This is read-only preparation before the action, with the existing default
15-second expectation budget. There is no fixed sleep, forced/JavaScript click,
animation override, repeated logout, credential write or scenario retry. The
same preparation already exists for Pro controls in the Firefox harness.

Node DOM/API-model checks exercise the reader with the real Pro toggle handler:
an open, non-inert panel is insufficient while clipped; full height is
insufficient during a running or pending transition; a settled panel permits
the subsequent single logout. Missing, closed and inert panels are rejected.
Observation does not change focus, credentials or worker messages. These models
do not reproduce macOS pointer dispatch or establish native acceptance.

The original assertions still require both already-open Options pages to lose
paid controls, subsequent paid intents to fail, the saved key to be cleared,
and a Free rule to commit and block real navigation. Runtime sources and
version 5.5.10, all 24 smoke bodies, zero retries and workflow budgets are
unchanged. A new native run is required to confirm the correction. Local native
E2E could not run because the browser download returned an unavailable-site
HTML response instead of the pinned Chromium archive.
