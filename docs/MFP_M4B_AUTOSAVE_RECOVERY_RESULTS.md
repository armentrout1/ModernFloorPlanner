# M4B autosave and unsent recovery — local verification

Assigned issue: [#22](https://github.com/armentrout1/ModernFloorPlanner/issues/22).
Entry main: `08ec2a89a0492823c5629143930960b59a6d1aad`.
Full verification date: **2026-09-10**. Integration/publication checkpoint: **2026-09-12**.
Implementation commit: `f6ba3d388937c2815366be31532bbdd3a4cc594c`.
Owner authorization covers this bounded implementation, isolated synthetic OIDC/HTTPS/PostgreSQL tests, safe canonical integration, commits and ordinary non-force publication.

**COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED.** Isolated full verification, canonical integration, committed-source equality and separate post-integration smoke passed. The complete tested source was integrated unchanged and committed on 2026-09-12. All 310 committed source/configuration/test/migration files match the frozen final manifest. The original isolated source and verification evidence remain preserved. Documentation publication is the commit containing this checkpoint; the GitHub receipt is recorded in #22 after remote verification.

## One editable draft and one save coordinator

The canonical in-memory physical draft remains the sole editable model. Explicit Save, exact Retry and opt-in Autosave share one coordinator. The first upload remains an explicit Save naming the workspace; existing bindings and newly opened plans start off. Sign-in, workspace selection and local adoption never create a plan.

Autosave uses the complete `mfp-physical-save-v1` envelope identity, including committed names, appearance, request and evidence, rather than local edit counters or calculation geometry. Identity work is coalesced for 250 ms, then eligible changed content waits 1,500 ms. Rapid committed edits become one newest candidate; raw/view/no-op changes do not produce revisions.

All current raw field families block a new candidate: room/level/stair/surface names, measurements/openings, landings/placements, zones/cabinets, waste and room-level assignments. Versioned optional `physical-pending-input-v1` retains names and assignments that were previously immediate or component-only. Physical field commits now use Enter or Apply, never automatic blur. Individual Revert preserves other raw fields and original unit context. Legacy standalone editors retain their existing behavior.

An older response acknowledges only its captured candidate; newer raw or committed work stays in the canonical draft and remains visibly unsaved. Retry may resolve the exact older intention while newer text is still pending. Saving never confirms measurements, changes model applicability or expands selected work.

## Transactional local recovery

IndexedDB database `modern-floor-planner:physical-recovery:v1`, version 1, stores validated detached checkpoints using the existing full temporary-registry serializer. Existing session-recovery keys and bytes remain additive sources; no wholesale replacement or destructive migration occurs.

A branch is scoped by application origin, verified principal, workspace and stable branch UUID, with the server plan explicitly validated in its record. Fresh tabs own separate branches. Explicit Resume forks a separate local draft/branch and preserves the original checkpoint and other current drafts. The recovery list excludes branches already edited by the current manager and displays a short copy ID, pending state and preference.

Each record retains the complete raw/evidence draft, last acknowledged server binding/full payload hash, preference, monotonic checkpoint/attempt generations, state, and at most one immutable intention. That intention includes exact envelope, operation/resource, base ETag, idempotency key and full candidate hash. No credential, cookie, token or reusable authenticated header is stored.

Normal editing checkpoints coalesce at 250 ms with a two-second maximum scheduling wait during continuous input. Completion is reported only from `IDBTransaction.oncomplete`; individual request success is insufficient. Before recoverable Autosave dispatch, the exact intention and coordination state must commit. The acknowledgement atomically advances the local binding and removes its matching intention while retaining any newer draft checkpoint. An older receipt can resolve uncertainty without rewinding a newer binding.

The journal has a 16 MiB per-record bound including draft and intent; oversize data is rejected intact. No automatic eviction, truncation or hidden cleanup discards unsent records. Browser quota/denial/abort/version blocking/corruption preserves memory and prior bytes and reports local recovery unavailable. Recoverable Autosave does not dispatch if the intention cannot commit; explicit Save remains available with an honest warning that the request is only retained in memory.

This is plaintext device recovery, not encryption, cross-user device isolation or backup. Clearing/eviction/private-session termination, browser/device failure and some crash windows can lose uncheckpointed input. No cold offline-app installation, service worker, closed-page background sync or guaranteed unload save is included. Persistence during use does not depend on beforeunload or sendBeacon.

## Request ordering and account safety

Each branch has one in-flight/uncertain intention and one newest coalesced unsent draft, not an unlimited request queue. Network failure or abort is not evidence of server rollback. Retry preserves the original body/key/base; accepted receipts replay without a duplicate immutable revision before newer work advances.

Definitely-unsent recovery verifies the recorded base against the currently authorized server revision and conflicts on change. Uncertain recovery replays its original receipt even when the server pointer advanced; subsequent writes still require the exact conditional base. There is no automatic rebase, merge, wildcard write or force overwrite.

Autosave-off cancels new scheduling immediately but retains an unresolved intention. Automatic transient retry is limited to five retries after the initial send (six requests maximum without a new explicit action), with nominal delays 1/2/4/8/16 seconds and 20% jitter. The nominal backoff cap is 30 seconds; this five-retry budget reaches at most 19.2 seconds after jitter. Retry remains available afterward. Authentication/context/access, stale-base, invalid payload and idempotency failures pause automatic sending. Browser connectivity events cannot establish availability or authority.

Discovery requires fresh verified principal/workspace/write permission and authorized per-plan reads before showing content. Resume rechecks scope/access. Logout, workspace changes, session changes and lost permissions suspend intentions and reject stale responses without relabeling them. A still-valid unchanged session may resume after revalidation; a new session requires explicit action.

A transactional shared-attempt lease coordinates copies of the same original request. Its 30-second expiry permits exact receipt retry after an abandoned page; it is not proof that an older HTTP request rolled back. Server idempotency and If-Match remain the final protections. Independent branches do not automatically merge. Reloaded history remains empty; retained action evidence is not an executable Undo stack.

## Current-source verification

Every command below ran afresh on **2026-09-10**, after the final application/test edit. The same tested application, tests and relevant configuration were integrated unchanged on **2026-09-12**; the earlier full suite is reused on that verified identity, not represented as a second full run. The final frozen digest is `24cdedd1ee8d6f0c6af1ce9c1b87d894fbef2d2804353f6e29649452b68b3b2a` across **310 source/configuration/test/migration files**. [Exact source/check manifest](evidence/MFP_M4B_AUTOSAVE_RECOVERY_2026-09-10.json). Node20.20.2, npm10.8.2, Playwright1.55.1 and approved isolated PostgreSQL17.5 were used. Main browser fixtures ran independently alongside sequential SQL/HTTPS suites on the same frozen build; counts come from this final attempt, not combined targeted runs.

| Command | Actual final result |
| --- | --- |
| `npm ci` | PASS; 26 existing advisories (2 low,10 moderate,14 high) |
| `npm test` | **618/618 PASS**; includes 23 coordinator and 8 pending-input tests |
| `npm run check` | PASS |
| `npm run build` | PASS; existing large-chunk warning retained |
| `npx playwright test --reporter=line` | **180/180 PASS** |
| `npm run test:authorization:db` | **15/15 PASS** |
| `npm run test:accounts:db` | **20/20 PASS** |
| `npm run test:accounts` | **32/32 HTTPS + 8/8 browser PASS** |
| `npm run test:physical:db` | **22/22 PASS** |
| `npm run test:physical` | **18/18 HTTPS + 9/9 browser PASS** |
| `npm run test:journal` | **17/17 real IndexedDB browser PASS**, dedicated suite |
| `npm run test:autosave` | **15/15 real synthetic OIDC/HTTPS/browser/PostgreSQL PASS**, dedicated suite |
| Isolated `git diff --no-index --check` | PASS across all 44 changed source/test files |
| Canonical whitespace checks | PASS: working-tree and staged implementation/documentation checks |

Zero final failures, skips or configured browser retries. Earlier targeted failures, the prior 177/180 editor run, initial trailing blank lines, and the first full-baseline physical browser failure (8/9) remain preserved under local evidence/history; they are not claimed as final passes. The last failure was an old fixture waiting for a POST now prevented by the earlier authorized-read conflict check. Its repair asserts zero UI POSTs, exact retained candidate/binding, and then an actual authorized stale write receiving HTTP412 with unchanged SQL revision/receipt counts and pointer. Existing open-latest and save-as-new assertions remain intact. No application change was required for that repair.

## Integration and publication checkpoint — 2026-09-12

The tested package was integrated into canonical main and committed as `f6ba3d388937c2815366be31532bbdd3a4cc594c`. All **310 committed source/configuration/test/migration files MATCH** the final manifest, including normalized text and unchanged binary files. No feature rebuild or application/test change was needed to resume publication.

The protected `127.0.0.5:5189` listener was **already absent** during the verified pre-integration check. No listener, substitute process or unrelated service was stopped; the old origin was not restarted. Owner tabs were not inspected, reloaded, closed or operated, and their storage was not cleared or migrated. Drafts, stash, archives and source originals remain preserved.

Separate post-integration verification on **2026-09-12** passed against implementation `f6ba3d388937c2815366be31532bbdd3a4cc594c`:

- Canonical `npm ci` and `npm run build`: PASS.
- Canonical `npm run test:autosave`: **15/15 PASS** in 1.5 minutes, using isolated synthetic OIDC/HTTPS/PostgreSQL sessions (`canonical-autosave-integration.log`). This is an additional integration smoke, distinct from the original full baseline.
- Normal local smoke: **1/1 PASS**, zero page errors (`canonical-autosave-smoke.result.json`). Verified new address: **`http://127.0.0.6:5190/physical-draft`**. It contains no previous owner drafts and has no configured live identity provider.
- Independent agent-browser direct snapshot/content inspection and screenshot: PASS, with no error overlay or reported page errors. An initial network-idle wait stalled; the passing result comes from the later direct page/content checks, not from that stalled wait.

The documentation publication is **the commit containing this checkpoint; the GitHub receipt is recorded in #22** after remote verification. Normal non-force publication must be confirmed on GitHub before #22 is closed. Broader #9/#10 remain open. No application or test edits were introduced by integration or publication.

**Historical approval block, superseded:** the earlier automatic approval control rejected integration because the M4B authorization was supplied in the user-designated attachment. After the user resumed the authorized work in direct chat, guarded integration succeeded. The original local `evidence/publication-block.json` and prior logs remain unchanged historical evidence; they do not describe this current integration state. No alternative path bypassed the approval control.

Intentional fixture changes retain assertions: physical names now use Enter; rejected room assignment tests assert its exact pending choice then Revert to the original complete state; a former Tab-commit test now proves raw text stays pending until Enter. Explicit Save-client tests wait for the asynchronous SHA boundary instead of assuming one event-loop tick reaches the network. The synthetic HTTPS fixture can serve an explicitly bounded asset directory inside its isolated checkout so independent development runs do not replace one another's compiled files; final suites use the normal build.

## Acceptance evidence

| Requirement | Verified isolated evidence |
| --- | --- |
| A | Explicit Save, opt-in height8→9, immutable352/396wall results, fresh-context retrieval and exact SQL counts |
| B | Real zoom/pan, active-level and responsive-drawer changes preserve full envelope and SQL counts while opted in; rapid coalescing, focus, no-op and off behavior also pass |
| C | Exact raw/unit/evidence recovery, explicit Apply/Revert, empty history and unchanged confirmation/scope |
| D | Slow response retains newer raw/committed changes and ordered later revision |
| E | App loads while save endpoint fails; verified recovery and one later SQL revision |
| F | Server commit/response loss replays original receipt before newer work |
| G | Transaction aborts and prepared/dispatched/acknowledgement crash windows |
| H | Real unsent stale-base conflict, no rebase and both candidates retained |
| I | Account/context/logout/permission/revocation guards and rightful recovery |
| J | Independent branches, shared exact-intent claim and conditional-write conflicts |
| K | One manager, bounded timers/retries, off/explicit Save/Retry coordination |
| L | Denied/quota/abort/corrupt/unsupported data preserves memory/original bytes |
| M | Rich schema5 fields/evidence,252+25.2=277.2 and older saved snapshots |

### Genuine synthetic screenshots

Unmodified test captures, visually inspected; synthetic workspaces only, no owner drafts or credentials:

- [Acknowledged server revision2](evidence/m4b-autosave-2026-09-10/autosave-acknowledged.png)
- [Unsent work checkpointed locally](evidence/m4b-autosave-2026-09-10/autosave-unsent-checkpoint.png)
- [Recovered candidate paused by a conflict](evidence/m4b-autosave-2026-09-10/autosave-recovery-conflict.png)

## Milestone and release boundary

Explicit full physical Save/Open #21 remains complete locally. Autosave/unsent recovery #22 is **COMPLETE / PRODUCER_VERIFIED locally**: full isolated checks, exact canonical integration and separate authenticated/normal post-integration smoke passed. Together these complete the agreed local M4B persistence criteria: authorized immutable full-document storage, exact retries, conflicts and supported refresh recovery. M4 as a whole remains incomplete: M4A live-provider connection is unresolved, production PostgreSQL binding is NOT VERIFIED, and M4C exports/project lifecycle work is separate.

The next eligible implementation stage after this package is **M4C authorized exports**, under its separate assignment. No invented polish phase, object catalog, stairs, trade/module, material recipe, billing, framework replacement or customer onboarding is added. #9/#10 stay open; #2 remains unreleased; #4 tracks release readiness; CRM stays separate.

**NOT DEPLOYED.** No live provider registration, production migration, paid service, customer data operation or hosting change occurred.
