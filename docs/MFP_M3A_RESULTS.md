# MFP-M3A implementation and evidence

Date: 2026-09-07.
Requirement: DR-002 / [M3A issue #7](https://github.com/armentrout1/ModernFloorPlanner/issues/7).
Dependency: [M2C issue #6](https://github.com/armentrout1/ModernFloorPlanner/issues/6).
Status: **PRODUCER_VERIFIED locally; M3A complete as assigned; NOT DEPLOYED**.
The owner accepted M2C's documented local producer verification as the entry gate.
M1–M2C remain NOT DEPLOYED; #2 remains open/unreleased; #4 remains PROPOSED.

Baseline / rollback reference: `87708cc6ba0f75ebf22bca1cb8ebdd73460e224c`.
Implementation commits:

- `7f6d7dc85813fd4669651075df9aa1ba7bed498b`: physical Quick Rooms draft actions and validated temporary recovery; 31 state regressions.
- `76faff10d51a7e307be4b04539dcee1452f37137`: real application route, room cards/engine summaries, navigation guards and 18 browser regressions.

This record and the screenshots accompany the documentation commit.
Delivery uses ordinary compatible commits to verified main. If rollback is assigned,
use reverse-order ordinary reverts to the baseline; no reset, force push or migration.

## Entry and preservation

Verified the existing product root, normalized origin
`https://github.com/armentrout1/ModernFloorPlanner.git`, main tracking origin/main,
HEAD, initially clean tree, retained M1 stash and archived original roadmap.
Safe fetch at entry and before delivery found no new upstream commits. Task/process
inventory and index-lock checks found no competing product writer; these observable
checks cannot establish universal process absence. This task is the sole checkout
writer and release owner. Helpers supplied isolated drafts and read-only review.

Read AGENTS, ECOSYSTEM, My Way, the canonical roadmap, M1/M2A/M2B/M2C evidence,
DOORS_AND_WINDOWS, relevant issues including #6 and #4, and shared contracts.
Searched existing issues, then created and claimed #7 before application writes.
Retained the unpublished-work stash and archived roadmap without reapplying,
discarding or overwriting them. No alternate checkout or other product changed.
BUILD_ROADMAP remains the only canonical build sequence.

## Implemented application workflow

The sketch header has a visible **Quick Rooms** link to `/quick-room`; its
**Sketch editor** link returns to `/`. The existing router and UI components are
retained. The new page is lazy-loaded; there is no framework or rendering-engine
replacement, new dependency, runtime upgrade or live API-format change.

Room cards expose visible labels for name, length, width and ceiling height,
text-input measurement examples, adjacent errors, and add/duplicate/protected
remove. Presets only supply Custom, Bedroom, Kitchen, Bathroom, Living Room or
Closet names. They never insert measurements or a typical ceiling height.
New room dimensions are unknown. Newly entered or duplicated known measurements
remain unconfirmed, with explicitly null unsaved document/revision identities.
Each room has a unique ID and four unique clockwise wall-face IDs.

The current engine selects floor area, flat-ceiling area and all four gross wall
faces with the existing rectangular-flat-v1 policy and zero waste. React does not
implement area/perimeter formulas. Per-room and same-output project summaries
use calculateQuantities and the shared display formatter. Wall areas are labeled
before door/window deductions. Unknowns are unavailable, partial subtotals are
explicitly incomplete, and entered measurements remain provisional. No room list
means an invitation to add a room rather than a verified zero project.

On desktop the summary sits beside the cards; on tablet/phone the cards and summary
stack, with editable rooms first. The existing canvas mobile scroll lock now applies
only outside Quick Rooms. Browser tests assert real page scrolling as well as
visible labels, long names and lack of horizontal overflow.

## Editing, duplication and recovery contract

One canonical schemaVersion-2 physical document holds committed measurements.
Raw text, dirty state and per-field input-unit context are separate. Valid input
commits on Enter or blur through the existing strict parser and measurement
correction action; Enter followed by blur produces one action. IME composition and
repeated keys do not commit twice or disrupt text entry. Same-unit fractional text
is retained instead of being reformatted on each keystroke.

Every unresolved edit masks its dependent canonical value in a detached engine
preview, even if the text is potentially valid. Invalid/partial text stays visible;
previous totals are not presented as current. Clearing commits an unknown value,
retains historical action evidence and does not fabricate a confirmation event.
An absent ceiling height leaves floor and flat ceiling available and blocks walls.

Unit changes alter presentation only. Clean values use the shared formatter at
six decimal places with trailing zero trimming, without changing physical values
or original provenance. Unresolved text retains its old unit until committed or
cleared. Resolution parses in that old context and then releases the field to the
current display unit; the next bare entry uses the selected unit. Displayed
quantities use two decimals, separately from canonical precision.

Duplicate creates detached nested data, a new room ID and four new face IDs, an
editable copy name and unconfirmed known values. Unresolved values stay unresolved.
Source measurements and evidence are unchanged; historical events are not relabeled
as fresh measurements for a copy. Opening-bearing or unsupported documents are
rejected rather than silently cloned with lost content. Room removal requires an
explicit native confirmation and retains other rooms and historical action evidence.

Both workflows remain mounted during in-app navigation, with independent state.
Inactive sketch keyboard listeners are disabled, transient side-panel portals are
unmounted and unfinished canvas gestures are canceled. Committed sketch rooms,
opening styles/placement and zoom remain. Quick Rooms never writes its physical
draft through the legacy save endpoint; the two views are explicitly separate.

Quick Rooms uses only `modern-floor-planner:quick-rooms:v1` in sessionStorage.
The strict `quick-room-draft-v1` envelope contains the physical document, raw field
text/context, display unit and existing correction-action evidence. No quantity
totals or immutable snapshots are cached. Recovery validates supported physical
content, clean text agreement, field sets and action evidence, rejects restored
confirmation authority, and recomputes engine results.

The UI states: “Temporary draft in this browser tab — not saved to an account.”
A working cache supports same-tab refresh. Corrupt/unsupported bytes are preserved,
editing is blocked until explicit draft-only discard, and unrelated storage is
untouched. A denied read leaves a usable memory draft without automatically writing
over unseen cache data. A quota/write failure preserves the prior cache and current
memory edits, displays unavailable refresh recovery, and stops automatic writes.
Discard confirms and removes this key only; a failed removal retains the draft.
No claim of tab-close/crash protection, durable server save or cross-device recovery.

## Actual acceptance

| Case | Observed result |
| --- | --- |
| A: 12 × 10 × 8 ft, no openings | Floor 120.00 sq ft; flat ceiling 120.00 sq ft; gross walls 352.00 sq ft; provisional. |
| B: clear ceiling height | Floor/ceiling remain 120.00; wall total unavailable with required-height explanation. |
| C: duplicate | Distinct room/face IDs and nested state; floor 240.00; gross walls 704.00. |
| D: change copy length to 15 ft | Original stays 12 × 10 × 8; floor 270.00; gross walls 752.00. |
| E: equivalent input and units | 12 ft 6 in, 12.5 ft and 3.81 m represent 3810 mm; display switches retain physical/provenance values. |
| F: invalid/partial edits | Raw text and errors preserved, stale dependent totals unavailable, correction restores output; partial projects label subtotals. |
| G: navigation/recovery | Unsaved sketch and Quick Rooms survive navigation; Quick Rooms refresh restores fields/evidence; cache failure cases preserve data; no Quick Rooms legacy write. |
| H: form safety | Text Delete/Backspace/IME remain local to input; protected removal, add/duplicate repeat guards, Enter/blur single action, visible labels/focus and long names pass. |
| Interrupted sketch interactions | Browser Back removes delete/style portals; pending draw/drag/resize cannot resume on return without a new gesture. |
| Old-unit resolution | Clear unfinished feet input while meters selected, then enter bare 3.81: 3810 mm; same-unit raw input remains stable. |

## Commands and checks

Actual environment: Windows x64; Node **20.20.2**, npm **10.8.2**,
TypeScript **5.6.3**, Vite **5.4.14**, Playwright **1.55.1** with installed Chromium.
No machine-wide runtime setting or repository runtime/dependency pin was changed.

| Command | Actual final result |
| --- | --- |
| `npm ci` | Exit 0; 505 packages added, 506 audited in 10 s. |
| `npm test` | Exit 0; **201/201** pass, 0 skipped/cancelled; 1098.8208 ms. Original 170 plus 31 new state cases. |
| `npm run check` | Exit 0; TypeScript passes. |
| `npm run build` | Exit 0; Vite 1791 modules, 2.88 s; Express bundle 14.6 kB. |
| `npx playwright test --reporter=line` | Exit 0; **43/43** pass in 1.2 min, 0 retries/skips; original 25 plus 18 new cases. |
| `git diff --check` and staged equivalent | Exit 0; no whitespace errors after removing trailing blank lines at EOF. |

All original test files remain unchanged, including 19 editor regressions and six
actual-browser/Node M2C parity cases. New browser cases exercise the real compiled
application. The existing acceptance API is disposable and loopback-only; it imports
the actual route handlers but does not access PostgreSQL or customer records.

Build output: legacy entry 487.94 kB (148.49 kB gzip), separate Quick Rooms chunk
137.70 kB (38.52 kB gzip), CSS 67.58 kB (12.03 kB gzip). No chunk-size warning after
lazy integration. Existing stale Browserslist data and test color-environment warnings
remain. Clean install reports 28 dependency advisories (4 low, 10 moderate, 14 high)
and esbuild-kit deprecation warnings; remediation remains separately scoped in #4.

During implementation, a TypeScript discriminated-union error was fixed; an initial
new browser expectation incorrectly required the literal word “corrupt” rather than
the actual unreadable-cache message. Screenshot inspection exposed inherited mobile
scroll locking, and a real scroll assertion was added. A focused rerun before rebuilding
still exercised the previous compiled assets and reported 16/17; the final full run
above follows a fresh build. Review also caught composition handling, inactive portals,
unfinished gestures and old-unit context release; regressions cover their fixes.
No prior failed/intermediate run is represented as final acceptance.

## Screenshots and local smoke

Real Chromium viewport emulation with two populated rooms, provisional floor
270.00 sq ft and gross walls 752.00 sq ft:

- [Desktop, 1440 × 1000 viewport](images/m3a-desktop.png).
- [Tablet, 820 × 1100 viewport](images/m3a-tablet.png).
- [Phone, 390 × 844 viewport](images/m3a-phone.png).

These are full-page captures inspected for usable fields, results and scrolling,
not physical-device certification. Installed Playwright Chromium was used when
agent-browser CLI was absent and computer-use tools could not initialize due to a
local ACL infrastructure failure.

From the repository root, using the verified local runtime:

```sh
npm ci
npm run dev:frontend
```

Open [Quick Rooms](http://127.0.0.1:5173/quick-room).
The Vite frontend is bound to loopback and does not require DATABASE_URL.
Live smoke loaded this route, added 12/10/8 ft, observed 120/120/352 provisional
quantities and navigated to the sketch and back with the draft intact and no page
errors. This frontend command does not provide cloud/legacy API saving; that
requires a separately verified backend. No production in-memory database fallback
or fabricated credentials were introduced.

## Release state and next gate

**NOT DEPLOYED.** Deployment ID/SHA, hosting binding, real PostgreSQL persistence,
authentication and tenant isolation are **NOT VERIFIED**. No services provisioned,
database migration, real customer mutation, cross-repo write or customer onboarding.
M3A issue #7 remains open for unreleased evidence tracking under My Way; local
acceptance completion does not constitute deployment or integration verification.

M3A is complete as assigned. **M3B is next eligible for a separate bounded
assignment and has not started**: opening forms, work/surface selection, synchronized
simple sketch and quantity breakdown. M3 as a whole is not complete; M3C remains
later. Hosting/runtime #4 stays PROPOSED; auth/durable saves/exports remain later gates.
The pilot under-two-minute usability target has not been measured or claimed.
