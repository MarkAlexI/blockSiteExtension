# macOS native browser acceptance

The Chromium E2E workflow runs an additional **24-scenario smoke subset** on
standard `macos-15` (Apple Silicon/arm64) and `macos-15-intel` (x64) runners.
Both run automatically on the existing push/PR/manual triggers. The original
Linux core, lifecycle, overdue and upgrade groups and assertions remain unchanged.
The existing `e2e` required check now needs Linux and **both** Mac jobs to succeed.

## Browser and runtime

Each job uses Node 22 and installs the Chromium revision pinned by the existing
Playwright **1.62.1** lockfile with `playwright install --no-shell chromium`.
The runner records the actual Node architecture and refuses an arm64/x64 mismatch
before installation. The smoke run remains headed on the native macOS desktop;
it does not use Xvfb, Openbox, XTEST or a visibility shim.

The runtime is built from committed HEAD with `npm run package:cws`, then
extracted as `BD_EXTENSION_PATH`. No CI/test files enter the runtime package.
This tests Playwright's Chromium with the CWS-target runtime, not signed CWS/Edge
store bytes or a native Edge installation.

## Coverage

`BD_E2E_GROUP=macos-smoke` selects the existing `chromium`, `readers`, `stale`,
`focus` and `frames-native` spec files. Together they run the same initial
acceptance scope as Firefox's 24 smoke scenarios:

| Area | Coverage |
| --- | --- |
| Rules and DNR | Concurrent additions, stale edits, import/delete, persisted usage remaps and real navigation blocking |
| Daily Limit | Foreground accounting, actual deadline alarm and hidden-tab pause/resume |
| Free/Pro/Legacy | Activation, logout, concurrent paid commits and verification recovery against the local fixture |
| Readers | Options/Popup consistency, spent budgets and expired-day recovery |
| Scheduling | Stale schedule/category revisions and native scheduled Focus start, restart and completion |
| UI and frames | Native keyboard focus/drafts and nested HTTP frame accounting with top-level blocking |

`verify-macos-result.mjs` requires 24 unique specs from all five files, each with
one actual passing body. Listing tests, skipped tests, expected failures and
retries cannot satisfy acceptance. The report must identify macOS and the
matrix's architecture. JSON/HTML metadata records actual platform, architecture,
Node version and group. An unfiltered local run still selects the full suite;
the smoke group does not change the Linux partition.

## Limits and evidence

The ordinary restart scenarios use the harness's existing CLI-loaded extension
profile. They exercise storage recovery, but do not establish native permanent
unpacked installation or session restoration on macOS. Popup coverage uses the
packaged Popup as a tab, not the genuine action panel lifecycle.

Audio, native shortcuts, idle/cold-worker probes, native startup/session restore,
version upgrades, process interruption, OS sleep/resume, live midnight/DST,
native Edge and signed-store parity remain separate tasks. Scheduled Focus
coverage does not establish active-Focus preservation through a version update.

`macos-environment.json`, results and runtime provenance are retained for seven
days. On failure/cancellation, Playwright reports, screenshots and traces are
retained for three days. Successful jobs upload the small result/provenance files
without their large trace directories.

The initial macOS run must still be executed and inspected on GitHub. Local
unit checks and `--list` only verify the harness/selection, not macOS behavior.
Extension version **5.5.10** is unchanged because this change affects only CI,
test selection, acceptance checks and developer documentation.

Sources:

- [Standard public-repository runners](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job)
- [GitHub Actions billing and artifact storage](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [Playwright Chrome extensions](https://playwright.dev/docs/chrome-extensions)
- [Playwright browsers and Chromium channel](https://playwright.dev/docs/browsers)
