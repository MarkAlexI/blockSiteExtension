# Native version-update preservation — scenario 67

## Current upgrade matrix - 5.6.5

Native rule definitions must survive; current priorities are checked against
the explicit longest-filter / first-in-set policy introduced by the URL follow-up.

The historical 5.4.14 case is retained. The recent case now upgrades the actual
5.6.4 release at `21fb73506b22f95f4103868e75061028a5f3d483` to 5.6.5.
This pin uses the previously packaged release, not the later URL identity commit
that still carried the 5.6.4 version string.

Fresh Options readiness before retained-tab reload, exact Focus deadlines,
spent Daily Limits, native blocking, real rule edits and one natural completion
sound remain required. Both cases use their historical packagers and separate
profiles. Inventory is **89 = 74 core + 12 lifecycle + 1 overdue + 2 upgrade**;
macOS smoke remains 24 per architecture. This metadata update requires fresh
native CI; the sections below describe earlier matrices and evidence.


## Upgrade matrix — 5.6.2

Both actual historical packages are pinned in `upgrade-baseline.json`:

| Source | Commit | Focus control after update |
| --- | --- | --- |
| 5.4.14 | `4b154dbce16b9c463e9ac5d7d9e9ff9cb2f99e68` | Existing five-minute session and real Popup Stop |
| 5.6.1 | `e33fc4c5682160459061fcbb51a8792d9e08a98d` | One-minute session ends at its original native alarm deadline |

The preparation command below builds both packages with their own historical
packagers and verifies each archive, commit, manifest and extracted runtime.
Each test owns a separate profile and stable install directory. Source-version
selection cannot fall back to the other package. The older case remains intact.

The 5.6.1 case opens fresh current Options through the Popup's actual Scheduled
focus link (`target="_blank"`) before reloading any retained old document. The
ordinary Options button can reuse an existing tab. The original retained/closed
branch is recorded in either case. Saved budgets, paid state, alarm deadlines,
actual rule edits and post-update blocking remain required for both versions.

The recent case preserves sound=true, observes one native completion alarm and
one released offscreen Web Audio graph with an advancing native audio clock.
The same observer remains active through the later rule/budget controls to
reject duplicate playback. CI supplies its existing PulseAudio output backend
to upgrade as well as core. No synthetic alarm, rewritten deadline or audio
warm-up is used. The original scenario and job deadlines remain.

These are development-package tests. The new matrix still requires a fresh
native CI run. Kiwi store delivery, retained-tab behavior, physical speaker
output and Android completion remain separate manual acceptance. Sections below
retain the earlier fixture history and its then-current validation counts.

User-reported device acceptance on 2026-11-07 for the real Kiwi update to
5.5.11: accumulated Daily Limit usage survived, the active Focus session
continued, and its completion played exactly one sound.

## Activation candidate — 5.5.10

Fresh current Options must load and receive a real background health reply before
the retained old Options tab is reloaded. `retainedOptionsBeforeFresh` records
whether the native browser retained that old client or closed it during update.
Reloading the old document first could release a waiting worker and mask the
reported Kiwi failure. The same-process update, preserved Focus, spent usage,
alarms, DNR and subsequent native rule-action controls remain required.

This is development-package coverage. A browser that closes the old view does
not exercise a retained-client stall; Kiwi store-update acceptance is separate.


## Current acceptance extension — 5.5.9

Scenario 67 additionally reads the rendered current Options view, verifies both
saved rules and usable controls, reloads the pre-update tab if the browser retains
it, and saves then restores an actual rule toggle. The report records
`retainedOptions: reloaded` or `closed_by_browser`; the latter does not establish
coverage for a stale retained tab. Failed view probes attach their local recovery
report. This adds assertions to the existing scenario; inventory, deadlines and
retry policy are unchanged. Native execution of the new assertions is pending.

The sections below describe the original preservation fixture and its historical
validation, not acceptance of the 5.5.9 investigation candidate.


Tests only, based on `5ab41d6b4b9879f551eb4e428563bd05f617deea`. Runtime remains **5.4.15**.
Current inventory: **65 = 53 core + 10 lifecycle + 1 overdue + 1 upgrade**. CI runs the new
`upgrade` group separately, and the existing required `e2e` check requires all
four groups. Existing test deadlines and retry policy are unchanged.

## Actual previous package

`upgrade-baseline.json` pins **5.4.14** at
`4b154dbce16b9c463e9ac5d7d9e9ff9cb2f99e68`. Preparation uses that commit's
actual store packager, verifies its build receipt and archive SHA-256, checks
ZIP CRC, and records hashes of the extracted runtime files. It does not edit
a current manifest to pretend to be an older release.

`prepare-upgrade-baseline.mjs` fetches the exact commit if missing from a shallow
checkout, creates an isolated detached Git worktree, and removes that worktree
after success or failure. The old runtime and receipt live under
`RUNNER_TEMP` / the system temporary directory, outside the repository; only a
small ignored pointer is written to `e2e/upgrade-baseline.local.json`, outside
the runner output directory so Playwright cleanup cannot remove it.
CI exports `BD_PREVIOUS_EXTENSION_PATH` for the next step. Keeping the historical
source outside the repository also prevents Node from discovering its old tests.

From the repository root, before running the new group or a full suite:

```bash
node e2e/prepare-upgrade-baseline.mjs
cd e2e
npm ci
npx playwright install --with-deps --no-shell chromium
# Linux also needs Openbox, x11-utils and xdotool, as in the workflow.
BD_E2E_GROUP=upgrade xvfb-run -a npm test
```

When `BD_EXTENSION_PATH` is set, the target is the unpacked current store
package. CI already builds it before preparing the previous runtime. The
previous package reader verifies its pinned version, commit and runtime hashes
again immediately before use.

## Native transition and assertions

Chromium installs the old unpacked package at a stable path, then replaces its
runtime bytes and invokes the native extensions manager reload once. Native
ActivityLog must report `runtime.onInstalled` with `reason: update` and
`previousVersion: 5.4.14`; the old worker must disappear before selecting the
current worker. The browser process, profile and installed extension ID stay
the same. Chrome documents unpacked reload as an update in
[runtime.onInstalled](https://developer.chrome.com/docs/extensions/reference/api/runtime#event-onInstalled).

Before replacement, the real old runtime receives two rules, multiple list
assignments, Pro test credentials, a non-default setting and spent Daily Limit
budgets of 45/60 seconds and 840/1200 seconds. The old Popup starts a real
five-minute Focus session; its schedule is saved through the production router.
A durable marker distinguishes preserved storage from a fresh fixture.
There are no fixture writes after the update.

Acceptance requires exactly one native update event with the correct previous
version and extension ID; preserved rules, lists, revisions, credentials,
settings, usage and migration journal; unchanged active Focus and deadline;
and the expected native DNR rules and native alarms. The browser timezone keeps
this preservation case away from a legitimate local-day rollover without
changing the host clock.

The reopened current Popup must acknowledge readiness and accept one real Stop
click. The remaining 15 seconds are then consumed by a real foreground tab,
with a future native Daily Limit alarm and actual DNR blocking at exhaustion.
The inactive list's 840 seconds must remain unchanged. A final event read rejects
late duplicate deliveries. Node negative controls reject install, same-version
reload, restart, different ID/profile, duplicate events and lost state.

## Verification and scope

- `npm run check`: **2277/2277** Node tests, extension validation and 70 contrast
  pairs passed. All 65 browser tests enumerate; this is not browser execution.
- Both actual pinned packages also prepare successfully from fresh shallow
  checkouts. A real-Git regression checks private worktree cleanup on success
  and build failure without changing the current branch or working files.
- A real Playwright run reproduced the old pointer loss during output cleanup;
  the same runner check passes with the pointer outside the output directory.
- Local native Chromium execution is blocked by the container's AF_UNIX
  `Operation not permitted` restriction. The new headed `upgrade` CI result is
  pending after the owner applies and pushes this patch.
- The preceding 64-scenario base passed in
  [run 40337712471](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/40337712471);
  that run did not include this new test.

This tests native development-package upgrade behavior. It does not establish
signed store automatic-update delivery, Edge/Safari, Android, macOS or minimum
browser-version acceptance. Runtime sources, manifests, version and
`update/update.js` are unchanged.
