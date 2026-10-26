# Chromium lifecycle correction (2026-10-26)

Test-only patch on `fa5ae71e8936328b178527c3aee3b629e51b5792`.
Runtime/version remain 5.4.15. No permission, dependency or production change.

## Observed CI evidence

[Run 40316864463](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/40316864463)
completed Linux dependency installation in 17-29 seconds. Core passed 53/53.
Lifecycle passed 8/10; overdue failed 0/1. The three failures are distinct:

- Scenario 66 hit its existing 120-second body limit and then another
  120-second teardown limit. `native-owner-final` still shows the original
  browser PID 7829, nine load documents `/tab/0` through `/tab/8` and nine
  workers. There is no measurement receipt or evidence of a cold relaunch.
  This run cannot establish a Popup performance regression.
- The following startup-restore scenario failed during native installation:
  `xdotool windowactivate --sync` reported missing `_NET_ACTIVE_WINDOW`.
  The old desktop helper accepted a root marker without checking its child
  window or activation capability. A stale marker causing this particular
  CI failure is an inference; the artifact does not include its X properties.
- Overdue trace `call@190` observed `focusActive: false`, empty Focus DNR and
  both native alarm events at epoch 1793014983112, but no next scheduled alarm.
  The old polling predicate had already accepted this intermediate snapshot.
  Alarm delivery alone does not establish completion of queued handler work.

## Correction

Preparation pages now receive an idle worker script. After a clean browser
exit, the fixture is armed once for documents born at the new launch time.
Only restored documents can produce load and renew leases. Preparation and
late requests from old documents cannot start work or contribute evidence.
Twelve restored tabs, real CPU 8 ms / 32 ms and the same 20-second owner lease
remain required. Chunk receipts are batched every 250 ms, with one in-flight
request per document. All individual CPU intervals are retained. This reduces
reporting/interception traffic; CI CPU utilization was not measured and
reporting overhead has not been isolated as the sole cause of the timeout.

Before evaluating acceptance, the test waits for receipt delivery to catch up.
The unchanged oracle still requires actual chunks from at least two new
documents overlapping the original Popup click-to-ready window. Later CPU work
does not count. Cold identity, persistent installation, exactly one first
message, trusted Add/Save and one saved mutation remain checked.

Fixture teardown independently stops the loopback workload, including when
the body is stuck before its own finally. Diagnostic captures share a
five-second budget, with a maximum of three seconds per capture. Context and
CDP disconnect waits are each bounded at three seconds; the owned browser's
existing process cleanup is attempted even if either stalls. Its wait is
bounded at seven seconds, encompassing the existing SIGTERM/SIGKILL fallback.
If process cleanup fails, the isolated profile is retained for diagnosis.
Stage and workload evidence can be attached without a responsive renderer.

Desktop readiness now requires a live, self-referencing EWMH check window and
advertised `_NET_ACTIVE_WINDOW` support. A stale root marker cannot satisfy it.
A healthy pre-existing manager is reused and never killed by this fixture.

Overdue polling now includes the next future scheduled alarm and the absence
of the completed Focus alarm. The same 15-second observation deadline and all
following assertions remain. A production schedule-controller test holds its
real `alarms.create` dependency: the old observation is already true while
rearming is pending; after release, the controller correctly arms tomorrow's
occurrence without activation or a durable schedule change. This reproduces a
test observation race, not a confirmed production scheduler defect.

## Verification and limits

- `npm run check`: 2255/2255 tests, zero skips/failures, extension validation
  and all 70 contrast checks passed.
- Focused suite: 30/30, including served HTTP/worker/page scripts, per-chunk
  receipt preservation, delayed-owner backpressure, rejected stale producers,
  hung/rejected cleanup, EWMH readiness and the actual schedule controller.
- Baseline red control: the served preparation test fails on exact `fa5ae71`
  because the original worker immediately installs a 32 ms CPU interval.
- An additional Node/V8-thread HTTP integration probe ran the actual served
  page and worker scripts for 21.35 seconds: preparation was idle, both fresh
  producers survived the original 20-second lease boundary, all 1274 CPU
  receipts were retained in 166 requests, and both stopped after owner close.
  This exercises real CPU work and reporting, not browser startup or extension E2E.
- All 64 E2E scenarios still enumerate in 22 files. Matrix groups remain
  53 core + 10 lifecycle + 1 overdue, serial with zero retries. Scenario,
  functional-readiness and 20-minute job deadlines are unchanged.

Local AF_UNIX creation still fails with EPERM, blocking native Chromium's
ProcessSingleton before scenario execution. The corrected Chromium tests and
performance measurement have not passed locally. After applying this patch,
the owner must commit/push and check a new run: all three groups and the final
`e2e` gate must pass. Model checks are not substitutes for that native result.
Firefox's green native run is evidence for its current commit, not this patch.

## References

- [EWMH root and child check-window contract](https://specifications.freedesktop.org/wm/latest/ar01s03.html).
- [Playwright routing contract](https://playwright.dev/docs/api/class-browsercontext#browser-context-route): intercepted requests wait for their route action.
- [Chrome alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms): native delivery and scheduling contract.

Retrospective research also checked Playwright issue
[#10376](https://github.com/microsoft/playwright/issues/10376), closed in
December 2025, and wOxxOm's June 2023
[late-listener discussion](https://stackoverflow.com/questions/76438846/chome-alarms-onalarm-not-triggered-when-a-listener-is-in-an-async-function).
Neither establishes the current failure's cause. The extension already
registers its alarm listener at module scope; no historical workaround or
Chromium feature flag is introduced here.
