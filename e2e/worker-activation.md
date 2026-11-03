# Chromium waiting-worker mitigation — 5.5.10

## Observed case

On Kiwi 137.0.0.0, Options 5.5.9 finished module setup, access and all saved-state
reads, but its read-only `rules:health` request timed out. The native browser's
worker internals showed one registration with an old active/stopped worker and
a new installed/running **waiting** worker. Options remained an extension client.

Closing all extension pages, without restarting the browser or pressing worker
management buttons, allowed the waiting worker to become active/running. Options
then worked again. This establishes the activation stall for that occurrence.
Earlier reports requiring a full browser restart were not inspected this way and
must not automatically be assigned the same cause. Internal worker Version IDs
identify worker instances, not extension release versions.

## Change and limits

The packaged Chromium worker synchronously registers standard `install` and
`activate` listeners before its normal initialization. Install requests
`skipWaiting()`; activate calls `clients.claim()`. Both use `event.waitUntil()`.
Unavailable APIs leave the remaining extension listeners usable. Synchronous
throws and rejected promises are handled with fixed debug warning codes so a
failed mitigation does not itself reject worker installation.

These hooks neither register/unregister another worker nor reload extension
pages. They do not clear or rewrite rules, credentials, Focus, usage, alarms or
DNR, and do not replay messages. Normal idle wakes only register the listeners;
they do not execute either lifecycle operation. Claiming is restricted by the
browser to the worker's own extension scope. The worker has no fetch handler.

This deliberately changes control of already-open extension clients. Runtime
message types, mutation payloads and health protocol 1 remain compatible with the
preceding release. The patch targets Chromium MV3; Firefox uses a different
background architecture and does not receive these hooks.

The result is a mitigation for the observed waiting state, not proof that all
browser update or registration failures are resolved. Browser-native and real
Kiwi acceptance of 5.5.10 remain required.

## Sources and evidence strength

- [Chrome's documented extension lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
  expects activation after installation; normal idle shutdown is separate.
- [MDN: skipWaiting](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting)
  and [Clients.claim](https://developer.mozilla.org/en-US/docs/Web/API/Clients/claim)
  describe the standard operations and their effect on current clients.
- [Chromium Extensions discussion, July 2023](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/4Vk49_HFy6Y)
  describes the Options/waiting-worker symptom. Simeon Vincent corrected his
  initial suggestion to an install-time `skipWaiting()` call. Historical Chrome
  fix-version statements are not proof of the state of Kiwi 137.
- [Chromium Extensions discussion, July–August 2024](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/yo_2j-N0-Vg)
  includes wOxxOm's install/activate suggestion and Oliver Dunk's caution that
  manual registration intervention is not the intended extension lifecycle.
  Those reports guide this narrow mitigation; they do not independently prove
  the cause of every BlockDistraction incident.

## Verification and acceptance

The real worker entry is imported in API-model tests with standard lifecycle
events. Tests verify synchronous event lifetime extension, correct native method
receivers, deferred completion, no install-time data changes, rejection handling,
no retries and continued health routing. These test the code contract, not a
native browser's worker activation state machine.

Native scenario 67 opens current Options and requires its genuine health reply
**before** reloading the old Options tab. The report records whether the browser
retained that client. It also requires the same native process/profile/extension,
the update event, preserved active Focus/deadline, daily usage, credentials,
rules, native alarms and DNR, then a real Stop, rule toggle and remaining-budget
exhaustion. Closing the old tab is never used to make readiness pass.

For Kiwi, update from the previous release with Options left open. Reload that
page and reopen Options through Popup; both must load without closing all
extension pages or restarting the browser. Verify that worker internals do not
retain an installed waiting worker, and that saved rules, spent Daily Limit time
and any active Focus deadline remain correct. Also check an ordinary browser
restart and one idle wake. Record the exact browser build and update source.
