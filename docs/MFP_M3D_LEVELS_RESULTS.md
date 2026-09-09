# MFP-M3D first slice: building levels and selection

Date: 2026-09-08. Entry main: `4a44aaf92bea57819956414e9f90c49895caf032`.
Implementation issue: [#16](https://github.com/armentrout1/ModernFloorPlanner/issues/16); broader requirements: [#9](https://github.com/armentrout1/ModernFloorPlanner/issues/9).
Application/test commit: `6274e181388b8a74116fd90ecd1ae529780ce17d`. Documentation accompanies the canonical roadmap update; normal main publication is verified in the linked issue closeout.

Decision: **FIRST M3D SLICE COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED**. The final full run, source equality and canonical local smoke passed. M3B and M3C retain their local completion; all M3D is not complete.

## Implemented behavior and contract

One level-enabled physical draft contains its levels, rooms, openings, measurements, explicit takeoff request and retained evidence. New building draft starts with one editable Main floor. New physical draft retains the historical schema 2 path; Upgrade to building levels creates an explicit detached copy of its current state. These entry points preserve existing standalone/import workflows.

Physical document schema 3 requires `buildingLevels.version = building-levels-v1`. Each level has a stable ID, editable name, distinct display order, assigned/unassigned ownership status and explicit unknown finished-floor elevation. The authoritative `roomLevels` own-property map has exactly one existing level ID for each current room. Rooms, wall faces and openings do not gain redundant writable level IDs. Walls follow their room; ordinary opening attachments and room groups must remain on one level. Validators reject missing/extra/dangling ownership, duplicate identities/order, conflicting representations and unknown physical extensions. Prototype-like IDs remain owned keys rather than being normalized away.

**Elevation is unknown-only in this slice:** `{state: 'unknown', valueMm: null, reference: null, reason}`. Zero, a known elevation, a datum, slab thickness and stair rise are not inferred. Room ceiling height keeps its existing measurement meaning. Names and display order establish no vertical measurement.

The compact shared level selector supports add, explicit rename, reorder and select. New rooms belong to the active level. Room assignment changes ownership only: room/wall/opening IDs, dimensions, plan positions, appearance, measurement provenance and explicit quantity target IDs survive. Partial reassignment of grouped rooms or shared-opening dependencies is blocked with the related rooms/openings identified; no automatic selection expansion occurs. A successful assignment reveals the exact moved room even when the destination already has a remembered selection.

Quick Rooms, the drawing, inspector targets and opening hit/drop inputs show only the active level. Coincident plan positions on separate levels remain independent. Empty levels offer Add a room. Existing per-level camera and selection context are retained during the page session; active level is persisted in recovery. Switching levels cancels transient gestures, advances the guarded local edit revision and rejects callbacks from the previous context. The completed manual view tabs, responsive drawer and field Revert behavior remain in use.

Editing level and takeoff scope are visibly separate. Current level's current targets and all levels' current targets capture explicit room/wall/opening IDs, alongside existing individual selectors. Switching views does not alter `draft.request`, apply waste again or expand selected work. Reassigning or adding a room does not reinterpret the saved IDs as a live filter. Full valid documents go to the shared engine; only request selections are scoped. Project quantities count each selected target once, including explicitly selected unassigned rooms. Locate source reveals its level and highlight without changing scope; Edit source selects and opens the intended inspector.

## Compatibility, history and recovery

Schema 2 and its versioned legacy importers remain supported with their original semantics. The explicit schema 3 upgrade clones the **full current draft**, including pending room/opening/waste fields, unit contexts, request, groups, door/window data, source originals, review and measurement/history captures. `physical-level-upgrade-v1` lineage records the exact source draft, ID, revision and timestamp. The source registry entry is not replaced or merged. Historical rooms initially share an explicitly unassigned/existing level; stale compatibility originals are never reimported over current edits. Active request and deletion-recovery policy snapshots are deliberately converted to policy 3, while the exact prior versions remain in lineage.

The existing single per-draft history coordinator owns committed level creation, rename, order and room assignment. New typed level targets use `physical-history-evidence-v2`; original capture values remain retained, and v1 evidence cannot claim these new target types. Undo/Redo remains chronological across levels, labels the affected level and publishes an exact accepted target reveal. Global takeoff changes are labeled project-wide instead of naming an unrelated viewed floor. Raw edits, camera, unit and active-level changes do not create committed history or clear redo. Existing review/confirmation boundaries and guarded opening-delete recovery remain intact.

Pending level names are stored separately in `levelView.pendingNames`; switching levels and reloading preserve exact text without committing a rename. Rename applies only that field; retyping the committed name clears only its pending marker. A pending name blocks history that would remove or overwrite that level name until resolved. Existing room/opening/waste raw strings, units, evidence and scope guards are likewise preserved through view transitions.

Recovery envelope `mfp-editor-draft-v2` uses `modern-floor-planner:editor-draft:v2`. When absent, the store validates the prior v1 key as a read-only fallback. The first accepted write carries the full registry to v2 without silently upgrading schema 2 documents or altering original v1 bytes. Both the original fallback bytes and absence of the new key are checked before that write; concurrent changes cause a visible conflict rather than an overwrite. Corrupt/unsupported new data blocks fallback; corrupt old data is preserved. Quota/read failure retains accepted newer memory and existing bytes. Recovery validates full ownership, active level, pending-name references, lineage and evidence; it stores no authoritative totals. Reload restores current data and starts empty session Undo/Redo history.

Quantity policy/result/engine/snapshot dispatch uses `rectangular-flat-v3`, `quantity-result-v3`, `rectangular-engine-v3` and `quantity-snapshot-v3`. Existing arithmetic is reused. The version 3 geometry/content scopes bind level identities and room ownership; changing ownership changes fingerprints even when quantities coincide. Names, display order and camera do not affect quantity/geometry/content identity. Elevation explanation belongs to content evidence, not numeric geometry. Full snapshot capture retains complete source/display data. Previously captured v1/v2 snapshots are regenerated and verified byte-for-byte with their historical hashes; unsupported version tuples fail explicitly.

## Actual checks and acceptance coverage

Runtime: Node 20.20.2, npm 10.8.2, Playwright 1.55.1. After the last application/test edit, one fresh sequence passed npm ci, all 437 unit tests, TypeScript, build and the complete 158 browser tests, with zero failures/retries/skips. A focused 8/8 sanity run on the same source preceded the full browser run and is not added to its count. All 249 frozen non-document source hashes match the integrated canonical checkout and application commit. [Source/check manifest](evidence/MFP_M3D_LEVELS_2026-09-08.json) records actual commands, UTC times, durations and screenshot hashes. Earlier interrupted/targeted attempts are described separately below.

Baseline: all 399 unit and 150 browser cases retained. Added: 25 state/history/recovery units, 13 domain/quantity/snapshot units and 8 browser cases. Two predecessor storage fixtures were adapted solely for the required new-key plus legacy-fallback read protocol (`m3b-draft.test.ts`, `physical-history-boundaries.test.ts`); substantive behavioral assertions remain. No existing test was skipped or weakened.

| Final check | Actual status | Duration |
| --- | --- | --- |
| npm ci | PASS | 10.63s |
| npm test | 437/437 PASS | 3.74s |
| npm run check | PASS | 5.76s |
| npm run build | PASS | 4.43s |
| npx playwright test --reporter=line | 158/158 PASS; zero failures/retries/skips | 407.96s |
| git diff --check / staged check | PASS | Before commit |
| Exact frozen-source/canonical equality | PASS, all 249 files | Before and after integration |
| Canonical local smoke | 1/1 PASS at 5184 | 7.98s |

Install retains the existing 28 advisories: 4 low, 10 moderate and 14 high. Build retains outdated Browserslist-data and large-chunk warnings. No dependency/runtime upgrade is included.

The main browser fixture is created and edited through the public UI, with explicitly supported room models and work selections. Independent answers: Basement 12×10×8 ft gives 120 sq ft floor/flat ceiling and 352 sq ft gross walls; Main floor 15×10×9 ft gives 150 and 450; both populated levels give 270 and 802. Upper floor is empty. Advanced coincident/group/shared and malformed-recovery cases use isolated synthetic fixture setup through supported constructors/serialization or explicit invalid recovery bytes. The legacy-upgrade case creates one synthetic sketch through the local test fixture API, then loads/adopts/upgrades it through the UI. This is not an owner or production write, and the full suite is not described as having zero API writes.

All A–L coverage below passes in the fresh 437-unit/158-browser run. The main UI fixture verifies 120/352 and 150/450 independently, and 270/802 together.

| Requirement | Exact proof in new coverage |
| --- | --- |
| A — One draft, active-level rooms/openings | B1 switches Basement/Main/empty Upper, asserts same draft identity, visible targets and hidden-target absence. |
| B — Coincident plans remain independent | B5 uses coincident imported placements, excludes hidden hit targets, cancels a held gesture on level switch and moves only the visible window; domain projection/hit regression checks all level inputs. |
| C — Explicit level/project takeoff | B1/B2 assert 270/802 across view switches and Basement-only 120/352 while viewing Main; domain tests independently assert 120/352, 150/450 and 270/802. |
| D — Rename/order/camera preserve geometry | B1/B3/B8 retain physical IDs, dimensions, unknown elevations and outputs; per-level camera/selection returns; domain fingerprints exclude names/order/presentation. |
| E — Safe room assignment and history | B3 preserves room/opening geometry and selected IDs, reveals the moved room on a populated destination, and Undo/Redo restores ownership; state tests assert exact revision/target reveal. |
| F — Groups and shared openings | B6 rejects both partial assignments with unchanged relationships/history; schema and state tests reject cross-level attachments/groups. |
| G — New rooms do not expand scope | B2 adds a 6×5×8 room after explicit scope, retains 120/352, then explicit all-level selection gives 300/978; 10% floor waste stays 330 through view switches. |
| H — Pending text, units and redo | B4 preserves room/opening/waste strings and old-unit context, blocks hidden-floor Delete, exercises phone drawer Revert and exact reload; B3/B4 and state units retain unfinished level names. |
| I — Locate versus Edit across levels | B2 reveals Basement source without altering scope; Edit selects Main's exact room and inspector. |
| J — Older sources and snapshots | B7 upgrades the edited current Quick Rooms/legacy copies, retains source bytes, groups, recorded window height and door style/hand; domain tests verify fixed historical v1/v2 snapshot bytes/hashes. |
| K — Recovery and stale context | B4 exact reload; B8 malformed versions/membership preserves downloadable original bytes; state units cover stale revisions, either-key conflict, quota failure and guarded pending names. |
| L — Fingerprint/Browser–Node parity | B8 uses the actual browser fingerprint implementation and Node evaluation; ownership changes hashes, presentation changes do not; domain tests reject mismatched result/snapshot versions. |

B1–B8 are the eight tests in `tests/browser/physical-levels.spec.ts`, in file order. Domain coverage is `tests/m3d-levels-domain.test.ts`; command/history/recovery coverage is `tests/m3d-level-state.test.ts`.

Preliminary findings are separate from final acceptance: the first focused run passed 1/8; a real new-opening selection defect blocked five cases, and two advanced fixtures omitted required appearance metadata. Selection and fixtures were corrected. The next focused run passed 6/8; the remaining two cases used a test locator for “+” although the accessible control is “Zoom in”; those locators now use Zoom in/out. Code review additionally found destination-selection restoration after assignment and unpersisted pending level names; both received bounded fixes and regression assertions. The first final-sequence attempt was then interrupted at 41/158 browser cases for a definite new-test harness defect: B8 created an independent browser context without baseURL. Its one-line fix does not change application behavior. Install/unit/typecheck/build results and the partial browser log are preserved under `aborted-final01`; the complete final sequence was rerun successfully after the correction. Original logs/artifacts remain preserved. No preliminary or interrupted attempt is represented as the final full-suite result.

The first canonical-smoke invocation selected zero tests because its external grep filter was anchored before Playwright’s full title. It exited 1 and is preserved as `canonical-levels-smoke-attempt01.*`. Correcting only that external filter selected exactly one frozen case; the separate rerun passed 1/1. No application or test-source change occurred, so the full-suite source binding remains intact.

## Screenshots and safe local review

Genuine final-source screenshots were copied, hashed and visually inspected; [visual review](evidence/m3d-levels/VISUAL_REVIEW.md):

- [Populated Basement drawing](evidence/m3d-levels/levels-desktop-basement.png)
- [Populated Main floor drawing](evidence/m3d-levels/levels-desktop-main-floor.png)
- [Phone drawer with retained pending opening text](evidence/m3d-levels/levels-phone-pending-drawer.png)

The preserved local evidence copies use `final-` prefixes. Screenshots are genuine browser renders of populated flows. Viewport/touch emulation does not certify physical-phone keyboards, native browser zoom, screen readers or a complete accessibility audit.

Safe fresh review: [http://127.0.0.1:5184/physical-draft](http://127.0.0.1:5184/physical-draft), HTTP 200, canonical Vite listener 38368, application source `6274e181388b8a74116fd90ecd1ae529780ce17d`. The separate fresh-context canonical UI smoke passed 1/1. Immediately before integrating the tested source, protected 5183 listener 36008/parent 31120 and its exact Vite command were reverified; only that watcher was stopped. No owner tab, draft, recovery bytes or standalone Quick Rooms storage was read/reloaded/transferred. The new origin does not contain the prior tab's drafts. Stash `779950aeaa1b81fc8955ad8f399ab87ae5e59063` and the preserved original roadmap hash remain unchanged.

Three short owner checks:

1. Start a disposable New building draft; name Basement/Main/Upper and switch populated floors, then check that empty Upper offers Add a room.
2. Choose all-level work, switch the editing level, then choose current-level targets; confirm the displayed takeoff scope changes only when explicitly requested.
3. Leave a measurement unfinished, switch away/back, then assign a room and Undo/Redo; confirm the text survives and the moved room is revealed on the correct floor.

## Remaining scope and release status

This package completes only building-level ownership/selection locally. Linked straight stairs and landings are the next existing M3D slice, requiring explicit destination levels and separate floor/ceiling-opening rules; **NOT STARTED**. Populated-level deletion, measured finished-floor elevations, stairs, voids, stacked/ghost views, new room/group dragging, kitchen/bath/trade systems, purchasing, exports and account persistence are not implemented here.

**NOT DEPLOYED.** No hosting, auth/database binding, live migration or customer onboarding is verified by this local task. React/Vite, current rendering and shared arithmetic remain. M3B/M3C completion is preserved; #10 remains a release tracker, #2 is unreleased, hosting #4 is PROPOSED and CRM work stays separate.
