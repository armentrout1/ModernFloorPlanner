# MFP-M1 implementation and evidence

Issue: [#2](https://github.com/armentrout1/ModernFloorPlanner/issues/2). Date: 2026-09-06.
Status: PRODUCER_VERIFIED locally; not deployed. Issue #2 remains open with release status explicit.
Production branch: main. Implementation baseline: `05c622b746368846dd1187ce9447cdb5eb21dc2a`.

Implementation commit: `f18517495c4dad9d88121139acf38a09ce71966c`.
Rollback reference: the planning baseline above; no database rollback is needed because no schema/data migration ran.

## Entry and roadmap reconciliation

Verified the existing checkout's actual root, normalized origin, main/upstream,
HEAD and dirty files before application writes. Initial HEAD was
`876968e78d7070775e7924f33a3164ba20905d42`; the only tracked change was the prior
unpublished ecosystem roadmap. The local task inventory showed no other active
Modern Floor Planner task, no Git index lock existed, and the filtered process
inventory showed no competing repo writer. These are observable checks, not a
claim that a process inventory proves every possible writer is absent.

Preserved the original standalone roadmap and unpublished ecosystem roadmap as
local copies, retained a binary diff, and created the named stash
`MFP-M1 preserve unpublished roadmap before 05c622b reconciliation`. Fetched
origin/main and fast-forwarded to the published planning commit; no local changes
were discarded and the stash remains intact. The local output received an archive
banner while its original content was retained. No additional clone or worktree
was made. Issue #2 was claimed before application edits. One task/release owner
coordinated bounded implementation and review subtasks in the same checkout.

The complete local draft was read and reconciled against BUILD_ROADMAP:

| Earlier local draft | Canonical disposition |
| --- | --- |
| M0 baseline plus repair parts of old M1 | Current M1, issue #2 only. |
| Physical model and full quantities in old M1 | M2; deliberately not implemented here. |
| Old M2–M7 | Current M3–M8, same broad product/partner/material direction. |
| Old 80-inch-door fixture, 320 sq ft net walls | Different input from canonical Q-001's 84-inch door/319 sq ft; preserve both historical inputs, use Q-001 for M2 acceptance. |
| Pricing and independence/ownership | Same launch hypotheses and independent product boundaries; canonical packaging controls. |
| Faster pilot timings, 10/100/500-room profiles and cost scenarios | Retained as historical hypotheses for later scoped usability/capacity work, not M1 commitments or measured results. |
| Partner-funded/direct-paid access and quotas | Retained considerations for M5/M6, subject to explicit entitlement scope and no duplicate sale of the same access. |
| Advanced geometry/overrides | Canonical initial rectangle/flat-ceiling limit controls; later assignments must explicitly define unsupported geometry handling. |

`docs/BUILD_ROADMAP.md` is the single active build sequence. The ecosystem document
is a capability mapping, this file is an evidence record, and the local complete
roadmap is an archived source snapshot. M2–M8 were not started.

## Bounded changes

- Quantity arithmetic contributes each perimeter once and subtracts precise door
  widths once from both baseboard and base shoe; elevated windows change neither.
  Entered door dimensions are inches, with pixel-size fallback for older doors.
  Grouping no longer rounds to half feet; the material table shows inches.
- Inconsistent saved door widths generate a visible review warning. Calculation
  uses entered width without rewriting saved JSON; Properties offers an explicit
  confirmation that synchronizes the legacy size field only when clicked.
- Opening selection keeps its actual parent through cross-room moves; opening
  clicks no longer clear selection by bubbling to the room. A single deletion
  handler serves keyboard and Properties actions, with opening priority.
- Undo delete restores complete room/opening objects and ordering while retaining
  unrelated subsequent edits. It keeps the last 20 deletions in the current sketch
  session. New/load operations clear that history after confirmation. This is not
  persistent recovery, autosave or full editing history (later milestones).
- Shared shortcut guards cover editable controls, open dialogs, handled/repeated
  events and composition. Duplicate canvas Delete handling was removed. The browser
  suite also found a tooltip timer broadcasting Escape to the entire document;
  auto-close now updates only that tooltip's local open state, so it cannot close
  a save dialog or door-style menu. The
  previously unwired Fit to Screen/Pan controls are connected and Vite's server
  options are typed without suppressing errors.
- Save and rename failures retain entered data and allow retry; synchronous pending
  guards prevent overlapping requests. Loading over current rooms asks before
  replacing them.
- A separate legacy API adapter validates create/PATCH bodies, finite positive
  dimensions, opening enum/ranges, unique sketch IDs and route IDs before storage.
  Valid old pixel sketches, optional opening properties, timestamps and nested
  metadata retain their format. Reads are not migrated. Invalid input returns
  400; storage failures return redacted 500. Malformed JSON/oversized requests get
  redacted 400/413 and later requests still work. Response-body logging was removed.
- Added a lockfile-pinned Playwright 1.55.1 harness and cross-platform Node test
  runner. No renderer, database schema, customer identity model, billing, partner
  integration or other product repository was changed.

## Baseline observations

On the untouched planning commit, Node 24.11.1/npm 10.9.2:

- `npm ci`: exit 0; 502 packages added, 503 audited.
- `npm run check`: exit 2. CanvasControls was missing three required props;
  Vite's widened `allowedHosts: boolean` failed its `true | string[]` type.
- `npm run build`: exit 0. The existing build was not broken.
- The first complete browser regression run found 12 passing and 2 failing cases:
  opening-click propagation cleared selection, blocking styles and deleting the
  room. Those failures drove the event fix; they were not waived.
- A temporary older Playwright candidate introduced a download-certificate advisory.
  The committed pin is patched 1.55.1; the final dependency scan returned the
  pre-existing 28 affected entries (4 low, 10 moderate, 14 high; no critical).
  No broad or forced dependency upgrade was performed.

## Final checks

All final checks below passed on the implementation tree committed as `f185174`.
Windows runtime: Node **20.20.2**, npm **10.8.2**; no global Node switch was made.

| Executed check | Actual result |
| --- | --- |
| `npm ci` | Exit 0; clean install added 505 packages, audited 506. Lockfile unchanged by install. |
| `npm test` | Exit 0; 24 passed: 13 quantity, 3 deletion/recovery, 8 HTTP/validation/error tests. |
| `npm run check` | Exit 0; TypeScript green, no suppressions added. |
| `npm run build` | Exit 0; Vite frontend and esbuild server bundle produced. Final frontend JS 485.62 kB / 147.57 kB gzip; server bundle 14.6 kB. |
| `npx playwright install chromium` | Exit 0; browser installation completed for pinned Playwright 1.55.1. |
| `npx playwright test --reporter=line` | Exit 0; **19 passed in 52.0 seconds**, one worker, no retries. Uncaught browser-error assertions all passed. |
| `git diff --check` | Exit 0; no whitespace errors. Git notes Windows LF/CRLF normalization only. |
| `agent-browser` local smoke | Built page loaded, controls and sketch rendered, no uncaught errors reported; 12×10 ft + 36-inch door + elevated window visibly showed 120 sq ft, 41.0 ft baseboard/base shoe, 44.0 ft perimeter. Screenshot retained locally. |

Browser cases cover eight door/window placements across all four walls with
save/reload; door/window dragging within and between rooms and subsequent resize;
all four door styles, 32-inch width and swing edits; window-width edits; keyboard
and Properties deletion/undo; editable/modal/repeat/handled guards; save and rename
failure/retry preservation; explicit legacy-width confirmation; canceled New/Load;
and a save dialog surviving the old tooltip timeout. Tests use real UI and real
HTTP routes with disposable in-memory storage on loopback. They do **not** prove
PostgreSQL durability, tenant isolation or deployed behavior.

An intermediate clean run passed 17/18 cases and exposed the tooltip's synthetic
Escape. Diagnostic event/stack evidence identified the sender; the final 19-case
suite includes a deterministic timer regression and passes without forced clicks,
skipped cases, disabled animations or retries. Popup helpers wait for actual portal
removal so they do not reopen controls during exit animation. Failed-save cases
intentionally generate server failures and expected client error logs.

Remaining warnings: stale Browserslist data and npm's 28 pre-existing dependency
advisories. The Playwright advisory from the rejected older candidate is absent.
These checks do not establish exploitability or waive dependency review before
customer release. There were no performance/load or mobile-browser certifications.


## Deployment, database and auth inventory

**Owner clarification during this task:** the app is not hosted yet. Vercel is
intended for future hosting. There is no existing deployment to smoke-test; the
Replit files are historical configuration. No new deployment or database was
provisioned by M1.


- GitHub's default branch and documented release target are main. Repository
  homepage points to the Replit project, not a verified live deployment URL.
- `.replit` declares Node 20, PostgreSQL 16, autoscale deployment, build/start
  commands and internal port 5000 mapped to 80. These are configuration evidence,
  not proof of the current host binding.
- GitHub API inventories returned no deployment records, Actions runs or webhooks.
  No new deployment provider, preview/staging flow or database was provisioned.
- `server/db.ts` uses postgres-js/Drizzle with DATABASE_URL. No local env file or
  DATABASE_URL/REPL_ID process binding was present. No credential values were read
  into reports. Live database identity, schema, role, plan ownership and backup/
  restore remain NOT VERIFIED. No production queries or migrations were run.
- Auth libraries/users table exist, but runtime routes/storage contain no session
  authentication or workspace ownership predicates. This source-level gap remains
  the M4 customer/partner launch blocker. No production customer records were
  enumerated to test it; current external exposure is NOT VERIFIED.
- The known Replit project URL did not resolve through the available web reader.
  The owner confirmed there is no current live site. A source push is not a deployment.

## Acceptance and remaining gate

M1's nine producer acceptance items in issue #2 are complete **locally**: installation,
checks/build, the four specified trim/door cases, deletion/recovery/keyboard safety,
invalid-write/save-failure behavior, opening regressions and this evidence record.

Deployment: **NOT DEPLOYED; live smoke NOT VERIFIED**. The owner confirmed there is
no current host, so there is no existing deployment to inspect. A first Vercel
setup/database connection is separate work; this task does not provision it or
onboard customers. Live database configuration/ownership and M4 authentication/
workspace isolation remain unverified/unimplemented. Existing dependency advisories
also require scoped review before public customer use.

Issue #2 stays open with producer verification and unreleased status recorded.
The next build task after M1 sign-off is **M2A: shared physical-unit schemas,
parsers and a versioned legacy adapter**. No M2–M8 work was started. Do not use the
absence of a deployment as a reason to rewrite the editor or mandate staging.

## Vite versus Next.js decision raised during M1

Keep the existing React/Vite editor and Express backend for the fastest path.
[Vercel supports Vite](https://vercel.com/docs/frameworks/frontend/vite) and
[Express](https://vercel.com/docs/frameworks/backend/express). Vite is a build tool,
not a hosting provider. This app's Replit-oriented server entry and static output
will need a bounded Vercel deployment adapter/routing configuration plus a verified
PostgreSQL connection. Vercel's Express runtime serves static assets from its
public output rather than express.static; verify both frontend and API when that
setup is assigned. No new deployment configuration was implemented in M1.

Next.js migration could reuse React components, but adds routing/server/build and
regression work. It does not supply the missing quantity engine, quick-room UI,
workspace authorization or dependable storage. Those remain M2–M4 regardless of
frontend choice. Cross-company API reuse does not require identical frontend
frameworks. Standardization can be reconsidered for a concrete requirement;
there is no current Vercel compatibility reason to rebuild the drawing engine.
