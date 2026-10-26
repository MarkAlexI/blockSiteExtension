# Chromium E2E groups

## Dependency setup correction (2026-10-26)

At `3a5132404cdf7ac22ed775f7757f2046df0dba05`,
[run 40307908607](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/40307908607)
was cancelled at the existing 20-minute job limit. The core test step passed
**53/53** scenarios, including the corrected Focus Start/Stop case; its job
was nevertheless cancelled around artifact upload/cleanup. Overdue passed
**1/1**. Lifecycle never reached package construction or the test step:
Playwright/browser preparation took about 11 minutes, followed by over nine
minutes downloading native desktop dependencies from `azure.archive.ubuntu.com`.
This run provides no result for the corrected cold-startup/Popup measurement.

The workflow now pins the same Ubuntu 24.04 release used in that run. Before
either APT install, it replaces the runner's mirror list with the official
Ubuntu HTTPS archives, retaining mirror failover and package signature checks.
APT gets two retries and 20-second connection/data timeouts; these are not a
total download deadline. Linux dependency setup has a separate five-minute
step limit so a slowly progressing transfer cannot consume the whole job.
Npm installation and browser download each have two-minute step limits.

Openbox, `x11-utils` and `xdotool` are installed without optional recommended
packages. Full headed Chromium is still installed from the pinned Playwright
1.62.1 dependency; its unused separate headless shell is omitted. Xvfb, native
window management, installation, test assertions, scenario deadlines, serial
execution, zero retries and the 20-minute job limit remain in place.

Applying the patch and choosing **Re-run jobs** on the old run would still use
the old workflow. Push the new commit, or start a fresh workflow dispatch on
the updated branch. All three groups and the final `e2e` check must finish
successfully before accepting the new Chromium measurement.

Local verification: actionlint 1.7.12 and shell syntax passed; `npm run check`
passed 2240/2240 tests, extension validation and all 70 palette checks. The
pinned Playwright installer accepts `--no-shell` and selects full Chromium
151.0.7922.34 without the separate headless shell. All 64 scenarios enumerate.
The official HTTPS archives returned signed Noble release metadata verified
with the Ubuntu archive keyring. A full APT installation could not be exercised
in the local container because its APT privilege transitions are unavailable.
This does not establish a successful hosted-runner setup or native E2E result;
those require the fresh CI run described above. Runtime version stays 5.4.15.

References: the [runner image's APT configuration](https://github.com/actions/runner-images/blob/ubuntu24/20261012.334/images/ubuntu/scripts/build/configure-apt-sources.sh),
[Ubuntu mirror transport](https://manpages.ubuntu.com/manpages/noble/man1/apt-transport-mirror.1.html),
[APT connection/data timeouts](https://manpages.ubuntu.com/manpages/noble/man1/apt-transport-http.1.html)
and [Playwright browser installation](https://playwright.dev/docs/browsers).

## Current test addition — 2026-10-26

Version 5.4.15 now enumerates **64 = 53 core + 10 lifecycle + 1 overdue**.
The cold-startup/Popup measurement is in lifecycle; the process-pause scenario
has its own overdue job. Every group keeps the existing 20-minute job limit,
serial tests and zero retries. Required check `e2e` requires the entire matrix.
Use `BD_E2E_GROUP=overdue npm test` for that new group.

The preceding 5.4.15 base already passed both original CI groups in
[run 40278059684](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/40278059684).
The new groups and measurement require CI after applying this patch.
See [overdue evidence and limits](overdue-alarms.md) and
[measurement semantics](startup-responsiveness.md).

The following dated record describes the original two-group change on
2026-10-24. Its counts and then-pending acceptance refer to that historical
change, not the current inventory.

## Evidence and change

At base `7ad075c542fd611fa563882bba8f72996ded0365`,
[run 40073224267](https://github.com/MarkAlexI/blockSiteExtension/actions/runs/40073224267)
logged **61 passed (19.4m)** before its job was cancelled. This includes the
native startup-restore scenario. The test summary appeared less than one second
before cancellation, after dependency/browser preparation in the same job.
The timing is consistent with the existing 20-minute job limit; it does not
establish a teardown hang or a failed extension assertion.

The workflow now runs two independent matrix jobs with that same 20-minute
limit. `lifecycle` contains the six files for day boundaries, scheduled expiry,
native idle, alarm batches, cold messages and startup restore (9 scenarios).
`core` contains the remaining 14 files (52 scenarios). The division uses native
timer costs observed in the run, rather than equal file counts. It is not a
guarantee of future runner speed.

Each job retains serial execution (`workers: 1`), zero retries, existing test
deadlines, native installation and assertions. `fail-fast: false` allows both
groups to report. Artifact names end in `-core` or `-lifecycle`.

The final job keeps the existing check name **`e2e`**. It runs with `always()`
and succeeds only if the matrix result is `success`; failure, cancellation or
a skipped matrix fails the gate. Thus a successful group alone cannot satisfy
the original required check.

## Commands

From `e2e/`, after `npm ci` and browser/native desktop setup:

```bash
npm test
BD_E2E_GROUP=core npm test
BD_E2E_GROUP=lifecycle npm test
```

The first command preserves the complete original file order. An unknown or
empty `BD_E2E_GROUP` fails configuration instead of selecting a partial suite.
Use the same environment with `npx playwright test --list` to inspect selection
without launching a browser. The workflow invokes each group through Xvfb.

## Verification and remaining acceptance

- `npm run check`: **2206/2206** Node tests, extension validation and all 70
  palette contrast checks passed.
- Playwright enumeration: **61 = 52 + 9**, with identical `(file, title)` sets,
  no omissions or duplicates. No scenario/spec file changed.
- Four Node tests enforce complete spec coverage, disjoint groups, native timer
  placement and invalid-group rejection. The workflow YAML parsed successfully;
  its actual gate command accepted `success` and rejected `failure`, `cancelled`,
  `skipped` and an empty result.

The new matrix has not run in GitHub Actions yet. No full native Chromium run
was performed locally for this workflow-only change. The earlier 61 passing
tests are evidence for the base, not a green result for the new workflow.
After applying and pushing, both groups, their artifacts and the final `e2e`
check must complete successfully. Runtime, manifest, dependencies and extension
version **5.4.14** are unchanged.

References: [Playwright sharding](https://playwright.dev/docs/test-sharding)
describes file-level balancing and uneven durations;
[GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
documents matrix jobs, `needs`, conditions and job time limits.
