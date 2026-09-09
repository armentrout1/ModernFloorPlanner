# MFP-M3D — Minimal room uses, functional zones and fixed cabinet blocks

Date: 2026-09-09. Entry main: `94f1b325d399703540fad9c20480c8883c02c055`.
Implementation issue: [#18](https://github.com/armentrout1/ModernFloorPlanner/issues/18), linked to broader [#9](https://github.com/armentrout1/ModernFloorPlanner/issues/9), completed levels [#16](https://github.com/armentrout1/ModernFloorPlanner/issues/16) and completed stairs [#17](https://github.com/armentrout1/ModernFloorPlanner/issues/17).
Application/test commit: `9d19deae6328e5b47b2754ff5f81d55847a64540`. Application and documentation publication SHA/remote-convergence evidence are recorded in the [issue #18 closeout](https://github.com/armentrout1/ModernFloorPlanner/issues/18).

Decision: assigned package #18 and the initial three-part M3D foundation are **COMPLETE / PRODUCER_VERIFIED locally**. **NOT DEPLOYED.** M3B, M3C, levels and stairs keep their prior local completion.

## Implemented contract and supported workflow

Physical schema 5 adds the required strict `layoutContract.version = room-layout-v1`. The existing `building-levels-v1` and `straight-stairs-v1` contracts remain in the same document. `roomUses` contains exactly one explicit declaration for every current room. Each declaration separates use from room name, carries an explicit source and optional Custom text, and supports Unspecified, Kitchen, Bathroom, Living/Recreation, Bedroom, Utility/Laundry, Storage and Custom. A Custom selection may have an empty label while intent is unfinished. Older rooms start unspecified; their names are not parsed into functional use.

A functional zone has a stable ID and editable name, one authoritative parent room, explicit use, width/length and room-local placement. A cabinet block has a stable ID/name, one parent room, length/depth/height and placement, plus an optional explicit association with a zone in that same room. Both carry `quantityEffect: layout-only`. Cabinetry is the only new fixed-object family. One block represents a run or island footprint, not inferred individual cabinet products. Parent room ownership determines the level; neither entity has a second writable level assignment.

Create zone and Add cabinet block use the current active room. New plan dimensions are unknown. The visible origin placement is explicitly unconfirmed; it is not a field measurement. The list and drawing select the same physical ID. Zones use labeled dashed virtual boundaries rather than filled physical walls; cabinet blocks have a distinct rectangular representation. Unknown plan dimensions do not create a measured drawing boundary. Cabinet height may remain unknown while known length/depth support a plan footprint. No volume, countertop, installation or product count is invented.

The placement convention reuses the existing `room-local-top-left` anchor. X increases rightward, Y downward, and 0/90/180/270-degree rotations retain the top-left of the rotated axis-aligned bounding rectangle. Zone width and cabinet length follow local X at zero rotation; zone length and cabinet depth follow local Y. A 90- or 270-degree rotation swaps those plan extents. Coordinates and measurement provenance are physical document values; view scale, automatic room arrangement and camera position do not become geometry.

Edge-touching zones and cabinet blocks are allowed. Fit uses the existing 0.01 mm tolerance and bounded arithmetic precision checks. Invalid placement is rejected rather than silently clamped, shrunk or moved. A parent-room resize retains its children and exposes fit findings. Missing dimensions/coordinates remain undetermined. Overlapping zones produce functional-layout review findings; they are not partitioned into rooms or allocated material quantities. Moving a cabinet beyond its associated zone preserves the association and shows a review mismatch.

Drawing inputs are active-level scoped. Selection and movement reuse the physical drawing and current coordinate transform. A successful real-mouse drag records one command after zoom, pan and responsive reflow. Escape followed by pointer release changes no geometry. A demonstrated secondary-pointer ownership defect was repaired before the freeze; the regression combines real primary mouse input with explicitly identified synthetic secondary-touch packets and verifies exact durable state and cleared gesture ownership. This is not physical multitouch-device certification. View/level/draft transitions retain raw text and cancel transient gestures.

## Quantity and capture boundaries

Room use, virtual zones and cabinet blocks do not change existing finish arithmetic, applicability declarations, measurement approval or selected work. Zone area is not additional room floor area; zone boundaries generate no walls, trim or framing. Cabinet footprints do not deduct flooring, cabinet height does not deduct wall finish, and contact with a wall does not interrupt trim. Neither entity belongs to door/window inventory or represents a floor/ceiling void. Cabinet materials, product counts and finish exclusions remain explicitly outside this layout feature.

The shared pure geometry helper computes any displayed gross footprint and labels it **“Gross plan footprint — within parent room; not additive.”** This is a dimension-based layout area, not a net finish result or an allocation among overlapping zones. Position/fit findings remain separate. Pending plan dimensions hide a stale footprint; pending height does not invalidate a separately known plan area.

Policy `rectangular-flat-v4`, engine `rectangular-engine-v4` and result `quantity-result-v4` are unchanged. The full valid building document and explicit request still go through the shared engine. Existing independent floor/ceiling holes continue to deduct their rectangular union once, with affected-only readiness, gross basis and waste after net. Active level and drawing visibility do not redefine takeoff scope.

Physical source schema 5 requires `quantity-snapshot-v5`, `physical-geometry-v5` and `calculation-content-v5`. These are explicit capture/identity boundaries rather than new finish formulas. Layout IDs, parent/zone relationships, dimensions and placements participate in geometry identity. Functional uses, labels and source/provenance participate in content identity. Camera and visibility remain presentation. Full snapshot source capture retains the document. Earlier schema/import paths remain strict about unsupported physical extensions; historical v1–v4 snapshots retain their original policy branches, capture semantics and hashes. The new v4 golden was generated using the published pre-layout shared implementation through read-only imports, then verified against the new code.

## Upgrade, history and temporary recovery

Enable room layout creates a new draft from the **complete CURRENT edited schema-4 draft**, with `physical-layout-upgrade-v1` lineage recording source ID/revision/time and the exact source draft. Existing rooms, groups, openings, stairs, landings, surface holes, raw strings/unit contexts, takeoff request, measurement/review/history evidence and earlier upgrade lineage are retained. The UI carries its existing per-level selection/camera context to the copy. The source registry entry and compatibility originals are not overwritten or reimported. Quantity request policy stays 4.

The existing single per-draft history coordinator handles room-use changes; zone creation/name/use/geometry/deletion; and cabinet creation/name/dimensions/placement/rotation/association/deletion. New targets use `physical-history-evidence-v4`. Raw keystrokes, selections and camera changes do not become committed actions. The 50-action session limit, monotonic revision guards, review boundaries, exact target checks and empty session history after reload remain. Inverse/reapply reveals the affected level/target without changing unrelated selected work.

Changed known measurements restored by Undo/Redo retain their prior evidence but become unconfirmed. Equal coordinates retain their exact approval/evidence, including rotation-only changes. Whole-entity delete Undo restores unchanged captured values with their exact approval/evidence; it does not blanket-downgrade those measurements. Unrelated pending text survives; conflicting text that would be overwritten or lose its owner blocks the inverse. Raw label/measurement fields are retained in full captures and are excluded from committed entity equality, so typing an unfinished name does not impersonate a geometry change. Numeric no-op comparison has a bounded roundoff allowance rather than growing with coordinate magnitude.

Deleting a zone explicitly unlinks and retains its cabinets and parent room, with a notice; Undo restores the zone and its associations atomically. Deleting a cabinet leaves its zone and room intact. Room reassignment carries these children through the parent reference while existing stair/group/shared-opening guards remain binding. Undo that would remove a room with later dependent children is rejected with named dependencies.

Recovery envelope `mfp-editor-draft-v4` uses `modern-floor-planner:editor-draft:v4`. When absent, validated v3, v2 and v1 keys are read-only fallbacks. Original older bytes remain; corrupt/unsupported newer bytes are not bypassed and rewritten. The first accepted write checks current-key absence and every observed fallback to detect races. Validation covers new references, raw targets and committed values, history replay and full source lineage. Read/quota failures preserve accepted in-memory work and recoverable bytes. No authoritative totals are cached, no server persistence is added, and physical documents are not sent through the lossy legacy save API.

## Actual acceptance and checks

Recorded predecessor baseline: 475 unit and 166 browser tests. The final run retains those cases and adds 41 unit and 8 browser cases: **516/516 unit tests and 174/174 browser tests, zero failures, skips or retries.** Three predecessor unit expectations changed only for the new recovery envelope/key sequence. Counts are distinct cases in one fresh final run, not accumulated focused reruns.

Runtime: **Node 20.20.2 / npm 10.8.2 / Playwright 1.55.1**. All five commands ran in order after the last application/test edit against the same frozen **275-file source**. The [published source/check/screenshot manifest](evidence/MFP_M3D_OBJECTS_ZONES_2026-09-09.json) identifies every file, command time and result. The unfiltered browser run ended at 2026-09-09 22:34:58.474 UTC.

| Final command | Actual result | Duration |
| --- | --- | --- |
| `npm ci` | PASS | 14.497 s |
| `npm test` | PASS — 516/516 | 4.870 s |
| `npm run check` | PASS | 7.462 s |
| `npm run build` | PASS | 5.402 s |
| `npx playwright test --reporter=line` | PASS — 174/174, no failures/retries/skips | 552.694 s |

Canonical integration, 275-file source equality, `git diff --check` and fresh-origin smoke: **PASS — all 275 canonical source hashes match; working/staged Git whitespace checks pass; HTTP 200 and 1/1 browser smoke at [the fresh 5186 review](http://127.0.0.1:5186/physical-draft), 9.808 s command time (9.1 s Playwright), against `9d19deae6328e5b47b2754ff5f81d55847a64540`**. Publication SHA and remote convergence are recorded in issue #18 closeout, separately from these local checks.

Earlier focused runs remain separate evidence: preliminary01 was interrupted after driver locator timeouts; preliminary02 passed 6/8 with strict floating-point literal and empty-level Fit-driver mistakes; preliminary03 passed 7/8 with a drag-anchor helper incorrectly using SVG painted bounds; preliminary04 passed 8/8 after using the model-plane anchor. The one-CSS-pixel movement tolerance and exact metadata/history comparisons remain. The final full suite above is the acceptance result. The secondary-pointer ownership application repair was included before the freeze.

Install reported **28 dependency audit findings: 4 low, 10 moderate and 14 high**. Build retained Browserslist-age and chunk-size warnings. No dependency/runtime overhaul or automatic audit fix was performed.

The preserved local `BLOCKED_RESULTS.md` records the earlier automatic-approval rejection before canonical integration. That dated state is superseded by the owner's subsequent explicit plain-chat authorization to integrate and publish this package. The tested source was reused; the earlier blocked record, logs and source evidence were not overwritten. Canonical integration and publication remain normal guarded operations, with their actual results recorded below and in issue #18.

The primary arithmetic fixture is an explicitly entered Basement room, 20 by 15 ft with an 8 ft flat ceiling and uniform walls, no openings, Living/Recreation use, explicit floor/ceiling/gross-wall targets. Expected quantities are **300/300/560 sq ft**. Kitchenette zone 8 by 6 ft gives gross footprint **48 sq ft**; cabinet block 6 by 2 ft gives **12 sq ft**, with an explicitly entered example height. These are synthetic inputs, not construction standards.

### A — One active document and exact selection

**PASS.** Drawing and list identify the same zone/cabinet IDs in one document and active level. Both open the existing inspector/drawer. Coverage: `tests/browser/physical-objects-zones.spec.ts`, “UI room use, virtual Kitchenette and one cabinet block retain the measured 300 square foot parent” and the selection/rotation/drag case.

### B — Non-additive footprint display

**PASS.** Zone 48 and cabinet 12 sq ft use the shared footprint helper and the non-additive gross-plan label. Unknown height remains independent. Domain coverage: shared gross footprint and unknown-height case.

### C — Parent/project quantities unchanged

**PASS.** Selected floor/ceiling remain 300 and gross walls 560 after zones/cabinets, including overlapping zones. They do not become 348/360 or cabinet-deducted amounts. Domain coverage compares entire v4 calculation results before and after layout adoption.

### D — Functional intent does not rewrite measurements

**PASS.** Room use and zone labels/type changes preserve room geometry, approval and selected work. Explicit Custom text survives without inference from room names. Coverage: “functional use stays separate from room names and confirmed measured geometry.”

### E — Exact movement, rotation and transforms

**PASS.** Numeric position and all four rotations agree with the shared anchor; successful drags create one transaction through zoom/pan/reflow/unit changes. Escape cancellation and the explicit secondary-pointer ownership regression preserve exact durable data; state tests also reject stale revisions and target conflicts. Coverage: selection/rotation/drag browser case and all-rotation/range domain cases.

### F — Unknown and invalid geometry retained honestly

**PASS.** Missing dimensions remain unknown; rejected placement is not clamped; shrinking a room preserves children with correction findings. Coverage: unknown/overlap/out-of-bounds browser case and fit-tolerance/extent domain cases.

### G — Overlap and prior void deductions

**PASS.** Zone overlap is review-only and creates no floor or trim. Existing stair/surface holes remain independent and unioned once. Retained fixture: 252 net floor, 25.2 allowance and 277.2 adjusted at 10% waste after unrelated layout objects are added.

### H — Levels, pending input and IME

**PASS.** Switching levels hides only the corresponding objects, retains pending room/zone/cabinet/stair/waste text and original units, and cancels transient gestures. Coverage: “level changes, phone IME and reload preserve unrelated room zone cabinet stair and waste drafts.”

### I — Deletion and chronological history

**PASS.** Zone deletion unlinks cabinets; cabinet deletion preserves zone/room; Undo/Redo restores IDs/associations/evidence and preserves unrelated scope. Coverage: “zone unlink and cabinet deletion stay chronological while room reassignment carries the same children,” plus targeted state/history cases.

### J — Parent dependencies and hidden selections

**PASS.** Room assignment carries children without bypassing existing stair/group/shared-opening restrictions. Room removal cannot erase later children. Hidden-level selections cannot mutate old targets. Coverage: assignment browser case and explicit state dependency/guard tests.

### K — Validated recovery and corrupt bytes

**PASS.** Current layout data and unfinished labels/measurements reload with empty session history. Future/missing-reference/corrupt recovery is preserved or rejected explicitly. Coverage: “validated layout recovery retains original bytes for future contracts and missing room or zone references,” plus fallback/race/quota units.

### L — Current-source upgrade and historical parity

**PASS.** Representative current schema-4 stairs/landings/holes/source metadata and pending rise survive a new layout copy; original draft and old snapshot bytes remain exact. Browser/Node evaluation uses the public entrypoints. Historical v1–v4 snapshots verify; current schema-5 capture uses policy/engine/result 4. Coverage: last browser case and historical snapshot/golden domain case.

## Screenshots and safe owner review

[Desktop selected Kitchenette zone](evidence/m3d-objects-zones/objects-zones-desktop-zone.png) · [Desktop selected fixed cabinet](evidence/m3d-objects-zones/objects-zones-desktop-cabinet.png) · [Phone pending cabinet drawer](evidence/m3d-objects-zones/objects-zones-phone-pending-drawer.png).

The three genuine captures were inspected directly from the final full suite at synthetic origin `http://127.0.0.1:4173`. [Visual review: PASS](evidence/m3d-objects-zones/VISUAL_REVIEW.md). Desktop used a 1600×1000 viewport and full-page captures; phone used 390×844. The drawing distinguishes dashed virtual zone boundaries from the filled cabinet and physical wall. Docked controls fit; the phone drawer visibly retains `2 ft -` and its feet context while other fields display meters, with readable syntax help, visible focus, a reachable Close button and unobstructed Revert. No visual blocker was found in these captured states. This does not certify physical devices or assistive technology.

| Screenshot | SHA-256 |
| --- | --- |
| `objects-zones-desktop-zone.png` | `978c74e90261f09ccf71d7642071fe4f1a406045768e081a2ed7aa9efa221a59` |
| `objects-zones-desktop-cabinet.png` | `5d40a667094fddeaef3d2b4fc481e38f93863de1759d430654982ee5e3dd20a7` |
| `objects-zones-phone-pending-drawer.png` | `5ae56880d176705e1a4d9592f7205d0e2ed14618aab5776853df2d5c360db46c` |

Capture times, dimensions and the bound source are retained in the published manifest. Canonical safe review: **PASS — all 275 canonical source hashes match; working/staged Git whitespace checks pass; HTTP 200 and 1/1 browser smoke at [the fresh 5186 review](http://127.0.0.1:5186/physical-draft), 9.808 s command time (9.1 s Playwright), against `9d19deae6328e5b47b2754ff5f81d55847a64540`**. The exact reverified 5185 watcher PID 38480 was stopped immediately before integration and that protected origin was not restarted. A new review origin does not automatically contain the protected owner tab's drafts. The owner tab was not used as a fixture; the three manual checks below should use a separate synthetic draft:

1. Enter a 20 by 15 by 8 ft room and select floor/ceiling/gross-wall work; choose Living/Recreation, add an 8 by 6 ft Kitchenette zone and 6 by 2 ft cabinet. Confirm 48/12 non-additive footprints and unchanged 300/300/560 totals.
2. Select each entity in drawing and list, move/rotate it, then Undo/Redo. Delete the zone and confirm its cabinet remains explicitly unlinked; Undo restores that association.
3. Leave a measurement unfinished, switch levels/views and reopen the inspector. Confirm its exact text/unit survives, then reload the synthetic draft and verify current data returns with empty session history.

## Scope and next eligible work

No additional object families, fixture inventory, automatic kitchen layout, bathroom construction, countertops, product catalogs, service connections, clearance/code design, zone material allocation, cabinet finish exclusions, recipes, purchasing or trade overlays are implemented. Existing stair structural/measurement limitations remain. Neither this feature nor a successful local test implies a complete kitchen takeoff, surveyed layout, physical-device certification or complete accessibility audit.

The initial three-part M3D foundation is complete locally: levels (#16), linked straight stairs/endpoint landings/explicit surface openings (#17), and minimal room-use/zone/fixed-cabinet foundation (#18). This finite completion does not close all later requirements in #9. Future object families, detailed kitchen/bath tools, catalogs, trade overlays, overview/ghost views and M7 recipes are not automatic M4 prerequisites. **Next eligible bounded task: M4A — secure accounts and workspace authorization, NOT STARTED.** Its entry work verifies the intended deployment/database binding and records the actual identity-provider decision before account-facing implementation or onboarding. Current schema 5 and historical source/snapshot compatibility must be covered by secure persistence; physical data must not be reduced through the legacy save shape. This assignment starts no M4 work. The pilot speed target remains unmeasured; this report does not claim it.

**NOT DEPLOYED.** Hosted/account/database/production authorization smoke: **NOT VERIFIED.** Local synthetic browser checks are not hosted or account isolation evidence. Issue #9 remains open for broader later requirements, #10 remains release tracking, #2 unreleased, hosting #4 PROPOSED, and unrelated CRM work separate.
