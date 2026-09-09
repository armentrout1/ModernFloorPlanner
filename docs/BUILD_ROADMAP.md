# Modern Floor Planner — executable product and build roadmap

Version: 1.14 — M3D linked straight stairs and explicit surface openings verified, 2026-09-09
Repository: `armentrout1/ModernFloorPlanner`; delivery branch: `main`.
Original audit baseline: 876968e78d7070775e7924f33a3164ba20905d42; current application/test commit: 6ed8ad911777d687e76be832f7aaa67cf4a9de8f.
Status: **M3D levels and assigned linked straight-stair/landing slice COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED.** #16 and #17 are implemented; M3B and M3C remain complete locally. M3D as a whole remains incomplete. Next: one bounded minimal fixed-object/room-use/zone assignment, NOT STARTED. #10 stays the release tracker, #2 unreleased, #4 PROPOSED and CRM separate.

Evidence and dated external research: [research and audit](RESEARCH_AND_AUDIT_2026-09-06.md).

## 0. Current linked-stair checkpoint — 2026-09-09

**Only the assigned stair/landing/surface-opening slice is newly COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED.** [Issue #17](https://github.com/armentrout1/ModernFloorPlanner/issues/17), linked to [#9](https://github.com/armentrout1/ModernFloorPlanner/issues/9) and completed levels [#16](https://github.com/armentrout1/ModernFloorPlanner/issues/16), now supplies one shared straight-stair identity with explicit lower/upper endpoints, unresolved destinations, optional endpoint landings and independent finish-surface openings. [Results](MFP_M3D_STAIRS_RESULTS.md) and [source/check manifest](evidence/MFP_M3D_STAIRS_2026-09-09.json) bind application/test commit `6ed8ad911777d687e76be832f7aaa67cf4a9de8f` to fresh **475/475 unit and 166/166 browser tests**, zero failures/retries/skips, clean install, TypeScript, build, whitespace checks and a separate **1/1 canonical smoke**.

Physical schema/policy/engine/result/snapshot 4 is an explicit new interpretation; schema 2/3 and captured v1/v2/v3 behavior remains supported. The opt-in upgrade copies the complete CURRENT working draft into a new draft with exact lineage, preserving the source, independent drafts, raw units/evidence, IDs/groups/window heights and opening styles. Recovery v3 retains old keys and source evidence; physical documents never use the lossy legacy save API. Both endpoint views edit one stair. Room-local placement and optional reviewed alignment do not establish surveyed vertical alignment; ceiling height and unknown level elevation remain separate from stair rise.

Finish decisions are explicit per endpoint/surface. Stair and landing footprints cause no automatic deduction/addition. Only separately attached, strictly internal rectangular surface openings deduct through the shared union calculation. Unknown/invalid opening inputs or unresolved impacts block affected net quantities while retaining an explainable gross basis. UI acceptance proves 270/270/802 sq ft floor/ceiling/walls; an 18 sq ft Main floor hole gives floor 252/ceiling 270; a separate Basement ceiling hole gives floor 252/ceiling 252; 10% floor waste gives 25.2 allowance/277.2 adjusted. These are arithmetic fixtures, not prescribed construction dimensions.

Safe new review: [http://127.0.0.1:5185/physical-draft](http://127.0.0.1:5185/physical-draft). The reverified protected 5184 watcher was stopped only immediately before tested-source integration, never restarted; owner tabs were not operated/reloaded. The new origin does not contain the old tab's draft. Stash and archived source roadmap remain unchanged. No production/database/auth smoke or hosted deployment was performed.

**Single next task: one bounded M3D minimal fixed-object/room-use/zone assignment — NOT STARTED.** Activate one object family with explicit room attachment, version/provenance and quantity rules. Virtual zones do not create walls or duplicate room area. No stair catalog expansion, structural/code/riser design, dedicated stair purchasing, overview/ghost layer, detailed kitchen/bath tools or trade systems is included. M3B/M3C/#16 remain complete; M3D as a whole remains open.

## Preserved building-level checkpoint — 2026-09-08

**Only the first M3D slice is COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED.** [Issue #16](https://github.com/armentrout1/ModernFloorPlanner/issues/16), linked to broader [requirements #9](https://github.com/armentrout1/ModernFloorPlanner/issues/9) and completed #15, delivers real levels inside one canonical physical draft. [Results and A–L acceptance](MFP_M3D_LEVELS_RESULTS.md) and [source/check manifest](evidence/MFP_M3D_LEVELS_2026-09-08.json) bind application/test commit 6274e181388b8a74116fd90ecd1ae529780ce17d to one fresh final run: **437/437 unit + 158/158 browser**, zero failures/retries/skips, clean install, TypeScript, build and whitespace checks. The original 399 unit / 150 browser behaviors remain; two storage fixtures explicitly accommodate the new recovery-key fallback. A separate canonical review smoke passes 1/1.

New building drafts begin with one editable Main floor and unknown finished-floor elevation. Add, rename and reorder levels; add rooms on the active level or explicitly assign a supported existing room. Quick Rooms and Drawing inside /physical-draft use the same selected document and active-level context. Lists, plan projection, opening hit/drop targets, fit and source marks use the active level only. Per-level camera/selection memory is presentation state. Group/shared-opening partial reassignment is blocked with named dependencies. A moved room is revealed; measurements, coordinates, IDs, openings and takeoff target IDs remain intact.

Physical schema 3 / building-levels-v1 has one authoritative roomLevels map, version 3 calculation/result/fingerprint/snapshot dispatch and the unchanged shared arithmetic. Display labels/order never imply elevation. Old schema 2 consumers/importers and historical v1/v2 snapshot captures retain their semantics. Explicit upgrade creates a separate copy of the full CURRENT edited draft with lineage, preserving originals and unknown historical ownership under Unassigned / existing. No stale reimport or automatic independent-draft merge occurs.

Editing level and takeoff scope are visibly separate. Explicit current-level/all-level actions capture current target IDs; later rooms do not expand that capture. Full valid documents go through the shared engine. The UI-built Basement 12×10×8 / Main 15×10×9 / empty Upper fixture gives 120/352 and 150/450 square feet, and combined floor/flat ceiling 270 and gross walls 802. Source Locate/Edit navigates the right level without changing scope. Raw measurements, opening/waste text and pending level names survive switches/recovery; one history coordinator reveals affected physical targets, while view switches preserve redo. Recovery envelope/key v2 validates supported data, reads v1 only when v2 is absent, protects original bytes/conflicts, and reloads current data with empty history.

At this historical checkpoint the next task was linked straight stairs and landings. That assigned slice is now complete above; the following exclusions describe the preserved level-only scope. No stairs, voids, overview, ghost underlay, room/group movement redesign, kitchen/bath/trade systems, purchasing, exports, accounts, hosting or database migration is included. M3D as a whole is not complete. Measured finish quantities remain distinct from M7 recipes/purchasing and later trade construction/routing models.

Safe fresh review: [physical draft at 5184](http://127.0.0.1:5184/physical-draft). The protected 5183 watcher was reverified and stopped only immediately before tested-source integration; its owner tab/storage were not operated or migrated. The new origin does not contain the previous tab's draft. Stash and archived roadmap hashes remain unchanged. Full details, screenshots and three owner checks are in the results record.

## Preserved M3C acceptance checkpoint — 2026-09-08

**M3C COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED.** [Issue #15](https://github.com/armentrout1/ModernFloorPlanner/issues/15) closes the finite responsive/layout and focus package while retaining completed M3B, Revert #12, manual tabs #13 and committed Undo/Redo #14. [Focused results and full M3C acceptance matrix](MFP_M3C_LAYOUT_FOCUS_RESULTS.md) and [source/check manifest](evidence/MFP_M3C_LAYOUT_FOCUS_2026-09-08.json) bind application/test commit eeb4f9c7c3ae539b8c0888855ade23eaba50b5c3 to one fresh final run: 399/399 unit and 150/ 150 browser, zero failures/retries/skips, clean install, typecheck, build and whitespace checks. Existing 399 unit / 143 browser regressions remain; narrow selector adaptations for the intentional drawer are explained, not used to weaken assertions.

The unified physical workflow has a bounded docked inspector on wide screens and one deliberate modal inspector on narrow screens; Quick Rooms' primary form stays directly usable. Long labels and quantities reflow, controls use reserved space, focused fields remain reachable in short viewports, and the drawing keeps its own bounded pan surface. One canonical target and interactive inspector preserve exact pending text/unit context, history, evidence, quantities and selection across closing, view changes and the actual 1024 CSS px breakpoint. Locate source and Edit source retain distinct meanings. Input/menu/modal Escape ownership, review focus, post-resize opening gestures, target removal/recovery and standalone compatibility have current-source acceptance evidence.

The complete LF-01–LF-12 matrix in the result record covers desktop 1600x900 and 1280x720, tablet 820x1180, phone 390x844, short landscape 844x390, 320 CSS px reflow and both breakpoint directions. Increased text was tested by setting the root font size to 200%; this is not native desktop browser-zoom certification. The viewport configuration preserves user zoom. Short-height and touch emulation do not certify a physical phone keyboard or full WCAG compliance.

At this preserved M3C checkpoint, level ownership and selection were the next proposed task. That first M3D slice is now completed above; the four-of-five users / under-two-minutes pilot target remains unmeasured and separate from local M3C completion.

Release limits remain: NOT DEPLOYED; temporary same-tab recovery; no account/database/production/partner verification; #10 open for release, #2 unreleased, #4 PROPOSED and CRM separate. React/Vite, the renderer, measurements, quantity contracts, history architecture, saved/source evidence and isolated product ownership remain intact.

**Preserved predecessor checkpoints and their dated results follow. Current status is established above; historical next-task wording does not reopen delivered work.**

## 0.0. Prior committed-edit Undo/Redo checkpoint — 2026-09-08

**Committed physical-draft Undo/Redo / issue #14: COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED.** [Focused results](MFP_M3C_UNDO_REDO_RESULTS.md) and [source/check manifest](evidence/MFP_M3C_UNDO_REDO_2026-09-08.json) bind `4a3bd3f6b8a5135cec4b64e43e644c82918eaf21` to one fresh final run: **399/399 unit + 143/143 browser**, clean install, typecheck, build and whitespace checks. The prior 369 unit and 136 browser cases remain; 30 unit and 7 browser cases were added. Separate canonical smoke passed 2/2 on the new local review at port 5182.

Visible labels and guarded shortcuts undo/redo supported committed room/opening/applicability/takeoff actions through one coordinator per draft. Latest 50 transactions stay in session memory through view/draft switches. Reload recovers current data/evidence with empty history. Targeted inverse/reapply preserves IDs, originals, unrelated pending fields and monotonic guards; changed measurements/models restore provisionally. Review decisions and successful targeted opening recovery form visible history boundaries. Redo deletion renews the targeted token without duplicate replay. Later scope/raw-waste interactions conservatively preserve current scope during geometry restoration, with notice.

At the committed-edit Undo/Redo checkpoint, the remaining assignment was responsive/layout and focus acceptance. That finite package is now complete locally in issue #15; see the current M3C checkpoint and acceptance matrix above. This historical checkpoint retains its original Undo/Redo evidence. The pilot speed target remains unmeasured; M3D and later work remain unstarted.

The sole canonical sequence, levels-before-stairs, room/zones versus trade layers, proposed M3D, later kitchen/bath/trades, M7 recipes/purchasing and M4 isolation gates are unchanged. No hosting, accounts, database migration, framework/runtime overhaul, new room/group gesture or other-product work occurred.

**Preserved predecessor results:**

**Physical view-tab keyboard navigation / issue #13: COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED.** [Focused results](MFP_M3C_VIEW_TABS_RESULTS.md) and [source/check manifest](evidence/MFP_M3C_VIEW_TABS_2026-09-08.json) bind application/test commit `c69d9ec1659c3eb9c9b37a8c597b8ed46b6249d3` to fresh **369/369 unit** and **136/136 browser** checks, clean install, typecheck, build and whitespace checks. One tab is in the Tab order; Left/Right/Home/End move focus only, Enter/Space activate, and Tab/Shift+Tab leave normally. Named tab/panel relationships, focus visibility and source-driven view changes agree. Pending inputs, selection identities, document/request/evidence and recovery are preserved; the completed legacy tabs and Revert are unchanged. Only this bounded task is completed here.

**Predecessor field Revert (preserved completion):**

**Field Revert / issue #12 is COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED.** [Focused results](MFP_M3C_FIELD_REVERT_RESULTS.md) and [source/check manifest](evidence/MFP_M3C_FIELD_REVERT_2026-09-08.json) bind application/test commit `4031c77bf9e19ae2f49d8238ebf19317ce220207` to fresh **369/369 unit** and **131/131 browser** checks, clean install, typecheck, build and whitespace checks. The prior 350/125 cases are unchanged; 19 unit/6 browser cases are added. Revert and safe input Escape cancel exactly one pending room/opening/offset/waste field in the active unit while preserving domain data, evidence, confirmation, request, other inputs and recovery. Waste retains its monotonic scope-interaction guard. Pointer/touch/keyboard lifecycle and quota/stale failures are verified. Only this bounded M3C task is complete.

**Predecessor M3B closeout (preserved local completion):**

The explicit Slice 4 closeout verified the implemented Slices 1–3 in one complete synthetic user journey and populated desktop/tablet/phone checks. **M3B Slices 1–4 are COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED.** Entry main/origin/main: `bfcf4b8a1e787a4a58d813973e64d840690b4a90`; delivered application/test commit: `c0f0b832537d2e7ac5a3c24786c1b6fd6d99a907`. [Actual results](MFP_M3B_RESULTS.md), [source/check manifest](evidence/MFP_M3B_SLICE4_2026-09-08.json) and [issue #10](https://github.com/armentrout1/ModernFloorPlanner/issues/10) are the evidence. This remains the sole canonical roadmap.

The compiled /physical-draft journey used supported UI actions from explicit source adoption through room/drawing height round trip, opening creation/selection/movement, all ten explicit work scopes, independent quantities/waste, source focus, missing/restored inputs, review/correction, safe deletion/Undo and exact temporary recovery. Standalone originals remain independent. Review-dialog focus, invalid waste/opening blur that displaced clicks, and phone room-label overflow were repaired narrowly; no geometry, shared engine, schema, persistence, package/config or legacy editor change was needed. Two new integrated browser cases close the cross-feature gap while retaining all 350 unit and prior 123 browser tests.

**Historical M3B closeout sequence (retained in the current full run):** npm ci; npm test **350/350**; npm run check; npm run build; npx playwright test --reporter=line **125/125**, zero retries/skips; Git whitespace checks — all pass. The fixture independently gives 120/120 floor/ceiling, 352 gross walls, 21 + 12 deductions, 319 net walls, 41/41/44 ft trim, 17/14 ft casing and one door/window. Explicit floor 10% gives 132 sq ft; top-only gives 96 − 33 = 63 sq ft and 9 ft baseboard. Cleared window height gives unavailable full net walls and an explicitly partial/provisional 256 sq ft subtotal; restoration recovers the numeric basis. Historical snapshot and real browser/Node parity coverage remain included.

Safe disposable-tab review: **http://127.0.0.1:5183/physical-draft**, verified application source eeb4f9c7c3ae539b8c0888855ade23eaba50b5c3. HTTP 200 on listener 36008. The verified 5182 watcher PID 16556 (parent 40380) was stopped immediately before integrating tested files to prevent HMR into unsaved owner work. That protected origin was not restarted. The next unused origin 5183 is used solely to avoid reconnecting the owner tab to changed code; it does not copy drafts.. No owner tab was used as a fixture or reloaded. A different origin does not transfer old drafts, and browser memory is not saved in Git. Separate canonical smoke: 2/2 PASS on the verified review origin. **NOT DEPLOYED**; production/database/auth/partner smoke remains unverified.

| M3B slice | Current state |
| --- | --- |
| 1 — shared draft/room measurements/import/applicability/recovery | COMPLETE locally |
| 2 — physical opening forms and drawing interactions | COMPLETE locally |
| 3 — selected work/surfaces, explainable quantities and explicit review | COMPLETE locally |
| 4 — integrated acceptance, bounded repair and M3B closeout | COMPLETE / PRODUCER_VERIFIED locally |

**M3C COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED.** Revert #12, manual physical view tabs #13 and committed physical-draft Undo/Redo #14 retain their completed evidence. Responsive/layout and focus acceptance #15 completes the remaining agreed local requirements, including populated docked/drawer workflows, unobstructed controls, keyboard/focus and pending-input/history preservation. [Preserved M3C results and LF-01–LF-12 matrix](MFP_M3C_LAYOUT_FOCUS_RESULTS.md) record that package’s source and full verification. M3D level ownership/selection and the assigned straight-stair/landing slice are complete above. The next bounded fixed-object/zone assignment remains NOT STARTED.

M3B supplies measured finish quantities and explicit optional measured-quantity waste. M7 retains material/system recipes, coverage/accessories, package-specific waste and purchasing; later trades require construction/routing models. Levels before stairs, room zones distinct from trade layers, proposed M3D, later kitchen/bath/trades and M5–M8 are unchanged and unstarted. No hosting, database, onboarding or cross-product build occurred. CRM PR #11 remains separate/unmerged. Issue #10 retains local completion separately from release; #2 stays unreleased and #4 PROPOSED.

## 0.1. Prior build checkpoint - 6b8ef92

This owner-assigned checkpoint updates documentation only. It does not activate a feature, redesign, schema, hosting or database change. This file remains the sole canonical roadmap; [issue #9 / MFP-BLD-001](https://github.com/armentrout1/ModernFloorPlanner/issues/9) is the linked requirements/decision record.

**Repository:** `C:\Users\aaron\Documents\Codex\Modern Floor Planner`; origin `https://github.com/armentrout1/ModernFloorPlanner.git`; `main` tracking `origin/main`. After safe fetch, local HEAD and remote main were both `91402e8ced8b0121b12d1f53e54714d14fe5f173`, with zero commits ahead/behind and a clean working tree. Available task/worktree inventory found no conflicting local Floor Planner writer. All recent application changes are pushed. The subsequent checkpoint documentation commit is identifiable in Git history; report its publication separately from this application baseline.

The owner's open tab, sketch and form edits were not inspected, operated on or reloaded; no claim is made that browser drafts are saved to Git or a server. No dev server was restarted. Preserved stash: `779950aeaa1b81fc8955ad8f399ab87ae5e59063`. Archived original roadmap SHA-256 remains `4AA44769A3AF1CC8A4FE940B09E024109FEA19630F61181772B42F7EFDB7BCF1`. Neither was applied, dropped or changed.

| Question | Checkpoint answer |
| --- | --- |
| Current milestone | M3. M3A is complete as assigned; M3 as a whole is incomplete. |
| Completed locally | M1 repairs/checks; M2A/B/C physical model and shared quantities; M3A Quick Rooms; separately assigned legacy-sketch UI repairs. All remain unreleased. |
| Unfinished | M3B opening/work forms and synchronized physical sketch/quantity breakdown; remaining M3C responsive/interaction/general undo work; proposed M3D; M4 secure durable saving/revisions/exports and later gates. Pilot speed target is unmeasured. |
| Unpushed work | None in the application checkout at entry. The intentional historical stash remains unpublished; live browser drafts are independent and untouched. |
| Quick Rooms versus sketch | Still separate, unsynchronized drafts/formats: physical-v2 temporary Quick Rooms at `/quick-room`, legacy pixel-based sketch at `/`. Kitchen/Bathroom presets name rooms only. |
| Single next implementation task | **M3B: opening forms, selected work/surfaces, synchronized physical sketch and shared-engine quantity breakdown**, subject to the entry gate below. Not started here. |

**Retain the completed UI fixes.** [Editor UX results](MFP_EDITOR_UX_RESULTS.md), [centering results](MFP_CANVAS_CENTERING_RESULTS.md) and [pan/zoom results](MFP_CANVAS_PAN_RESULTS.md) record fit/centering, middle-button/Hand pan, continuous grid and Ctrl-wheel/two-finger zoom; Select All/marquee/Shift and saved group movement; precise opening selection/delete/recovery and room-name visibility; corrected door handing/preview/double-click flips (`fff757d`); contextual tabs (`7aca359`); one toggle per panel (`0e4885f`); common/custom window dimensions (`7f257fb`); fitted read-only Plan Preview (`aac086b`); and compact size/swing controls (`91402e8`). These are completed portions of editor usability, not automatic M3B/M3C completion. M3C must inventory remaining gaps and retain those fixes and regressions. Keep React/Vite and the current drawing engine.

**Evidence limits:** the latest application commit passed typecheck/build and local visual smoke. Its report records 40 passing browser cases initially, then 11 passing focused cases after fixing eight selector-collision failures: 49 distinct relevant cases have passing evidence, not one fresh complete-suite run. The preview slice's 234 unit/API checks and M3A's 201 unit/API plus 43 browser checks belong to their dated baselines. This documentation checkpoint performs repository/document consistency checks only. Before the next feature baseline, run the current complete unit/API/engine-parity/browser suite, typecheck and build with isolated fixtures while preserving the owner's tab/drafts; report actual failures instead of combining historical counts into full-HEAD certification.

[Issue #8](https://github.com/armentrout1/ModernFloorPlanner/issues/8) stays open; its coordination text lags the committed results and some publication updates remain pending, distinct from unpushed code. Issue #9 reviewed older remote `aac086b`; this checkpoint includes the later `91402e8` fix. Both issues were read, not modified. Hosting, real PostgreSQL persistence, authentication/isolation and production smoke remain unverified. No customer onboarding through unscoped plan access.

## 1. Product decision and document authority

Build a **quick room measurement and quantity tool with a synchronized sketch**. A user enters length, width and ceiling height, adds openings, chooses the work, and receives explainable quantities. A single useful room must not require drawing an entire building. Keep standalone use and partner use on the same product-owned engine and editor.

This roadmap implements the owner's September 6 direction. During the explicitly assigned M1 implementation, Codex read and reconciled the complete local `Modern-Floor-Planner-Complete-Roadmap.md` and the unpublished ecosystem roadmap. Both originals were preserved as local copies and the unpublished Git diff was retained in a named stash. The local output is now marked as an archived snapshot. This document remains the only active build roadmap. See [M1 evidence](MFP_M1_RESULTS.md) for the reconciliation and implementation status.

`AGENTS.md` and the v1.1 My Way workflow control repository operations. This file controls this product's build sequence; `docs/ecosystem/PRODUCT_ROADMAP.md` maps it to ecosystem capabilities. Existing feature documents describe historical intent, not current runtime certification. Do not maintain another independently updated build roadmap in an outputs folder.

The owner's bounded M2A, M2B and M2C assignments accepted the preceding task's local producer verification as sufficient entry evidence. [Issue #3](https://github.com/armentrout1/ModernFloorPlanner/issues/3), [issue #5](https://github.com/armentrout1/ModernFloorPlanner/issues/5) and [issue #6](https://github.com/armentrout1/ModernFloorPlanner/issues/6) were each claimed before their application writes. Issue #2 remains open and unreleased. The owner then assigned M3A under [issue #7](https://github.com/armentrout1/ModernFloorPlanner/issues/7), accepting M2C local verification as entry. M3B and later work require their own assignments. No deployment, charge or cross-repo change is authorized by this document.

### Initial scope

Rectangular rooms; flat ceilings; vertical walls; interior finish-face dimensions; doors, windows and explicit floor-level openings; selected floor/ceiling/wall/trim work; imperial and metric input; live quantities and a 2D sketch. Multiple independently measured rooms are supported without requiring their placement to represent an accurate whole-building layout.

Do not market these quantities as surveyed building area, permit drawings, structural design or standards-certified living area. Input measurement quality limits output accuracy. Defer sloped/vaulted ceilings, irregular polygons, automatic shared-wall topology, stairs, 3D, furniture, AI/photo measurement, scan hardware and live collaboration. A later explicit milestone may add them; unsupported shapes must be labeled, not silently treated as rectangles.

## 2. Architecture decisions

### A1 — Improve the existing application; do not restart it

Retain React, TypeScript, Vite, existing UI components, Express, PostgreSQL and Drizzle. Keep one repository and one deployable product, with internal modules rather than microservices. No compulsory Next.js migration, new umbrella repo, new database vendor or graphics-library replacement. M1 inventory found historical Replit configuration; the owner confirmed the app is not hosted yet and intends Vercel. First deployment needs a bounded setup and verified database/auth configuration; no current live binding is claimed. Do not provision a paid service as part of this plan.

Proposed module boundaries (introduce incrementally, not as a mass file move):

```text
shared/domain/       physical units, room/opening schemas, migrations
shared/quantities/   pure calculations, policies, provenance, fixtures
client/src/features/quick-room/  room cards, presets, selected work
client/src/features/editor/      commands, selection, renderer adapters
client/src/features/projects/    save state, recovery, revisions
server/services/     authorization, projects, revisions, exports
server/integrations/ launch sessions, mappings, events, handoffs
```

Existing paths remain compatibility adapters until their callers are migrated. Infer frontend types from shared validated schemas rather than maintaining divergent interfaces. Domain/quantity modules must not import React, DOM APIs, database clients or rendering constants. Use the same quantity implementation for browser previews and authoritative server snapshots; the server recalculates rather than trusting browser totals.

### A2 — Physical measurements are the source of truth

Canonical lengths are finite decimal millimeters; areas are square millimeters internally. Use explicit `Mm`/`Mm2` types or equivalent wrappers and centralized conversions. Preserve input unit, entered precision, source and confirmation state. Do not round physical values to match grid size or displayed decimal places. Use a documented numerical comparison tolerance (initial geometric tolerance 0.01 mm), not floating-point equality. Display rounding and purchasing round-up are separate final steps.

Separate floor-plan length/width from the existing physical `ceilingHeight` measurement (millimeters); legacy `room.height` is a plan dimension, not ceiling height. The M3B inspector and Quick Rooms must edit that same finished-floor-to-finished-ceiling measurement. It is distinct from floor-to-floor rise, level elevation, rough framing height and plenum; no default heights or automatic confirmation. For a supported 12 x 10 ft room, height 8 ft gives floor/flat ceiling 120 sq ft and gross walls 352 sq ft; height 9 gives walls 396 while those areas stay 120. Clearing height leaves floor/flat ceiling available and walls incomplete. Typed applicability blocks unsupported ceiling shapes and affected wall/path outputs without blocking independently supported floor quantities; see the M3B entry contract. Viewport zoom, pan, CSS pixels, grid appearance and optional room placement are presentation state. They must never change quantities. A typed dimension must not snap to the old one-foot grid.

A rectangle has four stable wall-face IDs, a documented clockwise coordinate convention, and wall lengths derived from the rectangle. Opening offsets are physical distances from each wall's documented start, not screen percentages. Validate bounds, width, height, sill/elevation and overlap whenever a room or opening changes. Never silently remove or shrink an opening after a resize.

### A3 — Keep drawing state separate from editing gestures

Use a command/reducer boundary for add/update/delete/move operations and undo/redo. A drag is one committed command, not hundreds of history entries. Selection is one explicit target kind (room, opening, or multi-room set); a selected opening may reference its parent but must not cause the room-delete path to win. Ignore destructive shortcuts in editable controls, dialogs and repeated/handled keyboard events.

Keep the current drawing implementation during foundation repair. Add a physical-to-view adapter, then use a simple React/SVG view for quick-room previews and print geometry where appropriate. SVG view coordinates provide a scaling boundary [R6]; adopting a new canvas framework is not a prerequisite. Do not serialize a graphics scene as the canonical measurement document.

Use docked panels with content that shrinks to available width, a center area with `min-width: 0`, and an inspector drawer on narrow screens. Collapse/resize controls occupy a reserved header or handle, never cover dimensions or inputs. Arbitrary floating/repositionable sidebars are outside the initial release. Preserve useful existing opening interactions behind regression tests.

### A4 — One canonical geometry document with explicit revisions

Supported physical document versions: schema 2 for historical workflows, schema 3 for levels and schema 4 for explicit linked stairs and surface openings. The policy/engine/result/snapshot 4 branch preserves old captures; only an explicit full-current-draft upgrade adopts it. Schema 3 adds typed level ownership without changing the existing measurement shapes. M3B retains its measurement/room/opening shapes and specifies narrow versioned calculation/editor contracts, adapter revision and full recovery in [the entry design](MFP_M3B_ENTRY_GATE.md). Slice 1 now implements those contracts; see the current results. New applicability semantics use a new policy/engine/snapshot/fingerprint branch; old captured documents retain their v1 evaluation and verification path. Minimum model:

- Project/design identity and current revision; workspace ownership lives in the database, not in a trusted client field.
- Rooms with IDs, name, rectangle dimensions, flat-ceiling height, four wall-face IDs, selected work and optional presentation placement.
- Openings with one physical ID, kind, measured width/height/elevation and one or two explicit wall-face attachments. Unknown required dimensions remain null/incomplete, never fabricated.
- Measurement provenance: source (`manual`, `imported`, `traced`, later device/inferred), original input/unit and confirmation status/time.
- Quantity policy version, selected surfaces, deductions/exclusions and per-material waste settings.

A physical doorway shared by two rooms is counted once in a door inventory but can interrupt trim or wall finish on both participating faces. Do not deduplicate by proximity, matching size or name. Linking must be explicit and consistent; enforce equal physical dimensions across attachments. Unlinked legacy openings remain separate and show a review warning where a duplicate is suspected. Full structural wall topology is deferred.

Database target: workspace/membership records; projects/designs; append-only design revisions containing validated geometry JSONB; quantity snapshots; export records. Add integration accounts/mappings/handoffs/event deliveries in M6 and entitlements/billing references in M5. Do not create every later table in M1. Use real database timestamps and transactions.

### A5 — Secure standalone product before customer or partner launch

Every list, get, update, delete, revision and export operation must check authenticated identity, workspace membership, role and resource ownership. Derive scope server-side; a request's workspace ID or a platform API key alone is not authority. Use owner/editor/viewer roles and explicit workspace selection. No default-to-first-company routing.

Use an established identity integration behind the Express session boundary; verify any existing configured provider before choosing one. The exact provider is an M4A configuration decision, not permission to build a new password system or purchase a service now. Require secure session cookies, CSRF protection for cookie-authorized mutations, revocation, rate/size limits and redacted logs. Authorization tests are required even with managed identity. OWASP's object-authorization guidance is the baseline [R7].

PostgreSQL row-level security may provide defense in depth after the actual runtime role/pool is verified; do not claim it works when using a bypass/owner role [R8]. Explicit workspace-scoped application queries and denial tests are mandatory regardless. No production customer onboarding until isolation passes.

### A6 — Dependable saving is distinct from local preview

Autosave committed edits, visibly distinguishing local draft, saving, saved, failed and conflict. Use immutable revisions and a transactional current-revision check. Require a strong ETag/`If-Match`; a stale writer gets 412, not silent overwrite [R9]. Include an idempotency key for retryable creates/saves. Serialize client saves so responses cannot roll the editor back.

Store recoverable local drafts keyed by user/workspace/design; clear or protect them on logout/account switch and warn on shared devices. Local recovery is not promised full offline synchronization. On reconnection, compare base revision and offer recovery as a new revision/copy instead of automatically replacing newer work. Keep unsent edits when save or authentication fails.

A quantity snapshot binds geometry revision/hash, engine version, policy version, units, selected scope, unrounded canonical basis, assumptions and completeness. M2C keeps explicit display precision and conversion at a separate presentation boundary; persisted/exported display content remains later work. Issued/exported snapshots are immutable. Subsequent edits create a new revision and new snapshot. Published estimate/report references must continue to resolve their original snapshot under the applicable authorization and retention rules.

### A7 — Product boundaries remain intact

Modern Floor Planner owns geometry, measurement logic, takeoffs, editor, versions and drawing exports. FixDoneNow owns the customer/job workflow and integration mappings. LedgerLine owns financial estimates, pricing/tax/totals and financial document lifecycle. ProjectRoll owns original media, annotations and photo-report composition. No cross-product database reads, copied drawing engine, duplicated estimate form or implied shared tenant IDs.

Standalone measurements and standard exports cannot require a FixDoneNow account or partner availability. Later product/material reference costs are advisory inputs, not an authoritative financial estimate. The shared blueprint remains unchanged by this product-specific plan.

### A8 - Building-layout boundaries (issue #9; levels and straight-stair slice implemented)

`Project -> Level -> Rooms/spaces`, with functional zones and attached building objects referring to their owning space/level. Trade views/annotations reference those same identities. A level is not a group or layer; a kitchen/bathroom may be a room use or an open-space zone. Virtual zone boundaries create no physical walls, and parent room plus zone area cannot be counted twice.

Stable level ownership, optional measured elevation, display order/labels and per-level viewport state are separate. Ceiling height does not establish floor-to-floor rise. Selection, groups and snapping are active-level scoped. A locked adjacent-level reference or separated overview panels may aid alignment; panel placement and visibility are presentation-only and do not determine physical coordinates or quantity scope.

Physical schema 3 now implements typed level ownership and explicit version dispatch, reusing the shared physical arithmetic. Schema 2 has no level contract and remains frozen for historical consumers and snapshots. The frozen legacy-pixels-v1 adapter preserves optional window-height metadata without reinterpretation; explicit legacy-pixels-v2 adoption maps recorded inches into unconfirmed height. The explicit level adapter copies the CURRENT physical draft, preserving originals, IDs, groups, placements, styles, raw input and evidence; historical ownership begins under Unassigned / existing. No heights, finished-floor elevations or confirmations are invented. Finished-floor elevation is explicitly unknown-only in this slice; measured elevation entry requires a later typed datum/provenance extension.

Schema 4 now implements straight stairs referencing two levels through one assembly identity, with an explicitly unresolved destination allowed; level ownership comes first. Landings are not automatically storeys. Stair footprint, floor/ceiling voids and under-stair space are distinct, with explicit affected-surface deduction policies. Unknown required dimensions remain incomplete. Detailed kitchen/bath tools and trade overlays use the same document/engine; fixture movement updates attached references or flags them for review. Hiding a layer must not erase physical objects or alter quantity scope. Measured dimensions, common presets, manufacturer instructions and sourced jurisdiction/version-specific rules remain distinct; no compliance claim follows from a symbol or preset. Issue #9 retains the detailed candidates/research; this slice adopts no numerical code standards. Its new finish effect is only the explicit union deduction for supported internal rectangular surface openings; other object/trade effects remain later work.

## 3. Quantity rules: implement and test these, not labels alone

For a rectangular room measured inside finished faces, let L and W be plan dimensions, H the flat ceiling height, and P = 2(L + W). These are the proposed product policies, not a claim of compliance with a construction estimating standard.

| Output | Default definition | Important exclusions/qualifiers |
| --- | --- | --- |
| Floor area | L × W | Do not deduct doors/windows; explicitly selected floor voids/exclusions are separate. |
| Flat ceiling area | L × W | Do not deduct wall openings; ceiling voids are separate. |
| Gross wall area | Sum of selected wall-face length × height | Wall faces must be explicitly selected; unknown required height makes affected output incomplete. |
| Net wall area | Gross selected wall area minus eligible opening areas on those faces | Opening width AND height required; show gross and deductions separately. |
| Baseboard/base shoe | Selected floor-level wall lengths minus union of eligible interruptions/exclusions | Subtract door openings once per affected face; normal elevated windows do not affect it. |
| Crown/ceiling perimeter | Selected top-of-wall lengths | Ordinary doors/windows do not deduct; full-height gaps require explicit policy. |
| Door/window count | Unique physical opening IDs in selected inventory scope | Face deductions are separate from physical purchasing counts. |
| Door casing | 2 × opening height + width per selected face | No sill by default; face count explicit. |
| Window casing | 2 × (height + width) per selected face | Four-side default; sill/apron and alternative trim policies explicit. |
| Waste-adjusted quantity | Net selected quantity × (1 + waste fraction) | Applied once, separately per work/material category. |
| Packs/boxes | Ceiling of adjusted quantity ÷ verified coverage per pack | M7; pool only compatible material/SKU/unit/lot and explicitly chosen grouping. |

Opening measure basis must identify nominal, clear, finished or rough opening. Do not pretend nominal door size equals exact field trim cuts. Initial casing quantities are geometric allowances; installation returns, joints and cutting waste remain explicit allowances.

Reject or flag invalid geometry instead of clamping an impossible result to zero and calling it valid. Overlap beyond the numerical tolerance is invalid on the same face; tolerance-accepted shared coverage is unioned once and explained in the trace. An unknown window height allows floor totals but makes the affected net-wall result incomplete. Per-surface selection and partial completeness must propagate into exports and API responses. Consumer-ready estimating snapshots require confirmation of all dimensions on which selected outputs depend.

### Golden fixture Q-001 (engine acceptance, not a measured job)

Room: 12 ft × 10 ft; flat ceiling 8 ft. One 3 ft × 7 ft door at floor level, one 4 ft × 3 ft window wholly inside a wall above the baseboard; all four walls selected; no other exclusions.

| Quantity | Expected |
| --- | ---: |
| Floor / ceiling | 120 / 120 sq ft |
| Perimeter / gross walls | 44 ft / 352 sq ft |
| Door + window deductions | 21 + 12 = 33 sq ft |
| Net wall area | 319 sq ft |
| Baseboard / base shoe | 41 / 41 ft |
| Crown | 44 ft |
| Physical openings | 1 door / 1 window |
| Door casing, one face / window casing, one face | 17 / 14 ft |
| Flooring at 10% waste | 132 sq ft |
| Later M7: 20 sq ft per box | 7 boxes |

Also test: no openings; multiple doors; only windows; 32-inch door without half-foot rounding; metric/imperial equivalents; fractional-inch input; missing heights; zero/negative/NaN/infinite dimensions; invalid wall references; overlapping openings; shared doorway across two rooms; all four wall orientations; zoom and pan; resize with an opening near a corner; legacy migration twice; and very large but supported inputs. Compare raw calculations with documented tolerances (e.g. 1e-8 sq ft for the simple fixture), not string equality after rounding.

## 4. Legacy migration and preservation

M1 repairs the existing model without rewriting saved geometry. M2 adds a versioned compatibility boundary. For the reviewed legacy definition only, 20 model pixels = 1 ft, so `mm = pixels / 20 × 304.8`. Verify a loaded fixture follows this scale; viewport zoom is not part of conversion.

Preserve original JSON, IDs and migration provenance. Verify whether legacy opening positions mean center or edge in the actual renderer before converting percent offsets. When `size` and `doorProperties.width` disagree, record the conflict and request measurement confirmation; never choose a value silently. Preserve styles/swings. Do not invent missing ceiling/window heights or sill positions. A proposed default can be offered as an unconfirmed assumption, not written as a measured fact.

Migration must be idempotent and produce before/after room/opening counts plus quantity comparisons. Do not overwrite issued or original records. Add schema fields first, then migrate only through a reviewed additive process. Unknown legacy workspace ownership goes into restricted/unassigned review; never assign every old plan to the first logged-in user. M4 persists revisions under proven ownership. No bulk live backfill, `db:push`, deletion or destructive schema operation is authorized by this planning task.

## 5. Milestones and release gates

Sequence: **M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8**. M6 contract examples may be drafted earlier, but implementation does not bypass M4 security/versioning. Material research is not a reason to delay the basic room tool. M1 is tracked in issue #2, M2A in issue #3, M2B in issue #5, M2C in issue #6 and M3A in issue #7. Create or reuse one owner-repo issue when each next task is assigned, rather than duplicating status across trackers.

### M1 — Repair and establish evidence

**Entry:** verified local root/remote/main/HEAD, Codex local-document reconciliation, exclusive writer, reproducible baseline. Scope and checklist: [issue #2](https://github.com/armentrout1/ModernFloorPlanner/issues/2).

M1A: establish compatible unit/component/browser test tooling and exact `check`/`build` results; repair demonstrated errors without suppressing type safety. M1B: perimeter accumulation, precise door widths, door-adjusted base shoe and fixture tests. M1C: deletion precedence and recovery, editable-control keyboard guards, validated legacy API inputs and save-error preservation. Inventory deployment/auth/DB binding and record the access-control launch blocker.

**Touchpoints:** `materialCalculator.ts`, relevant `canvas.ts` conversions, `FloorPlanner.tsx`, shared/route validation, focused test/config files. Read opening documentation before changes.

**Evidence:** [M1 results](MFP_M1_RESULTS.md), implementation `f185174`; 24 unit/API and 19 browser cases pass. Owner confirms no current hosting. Issue #2 records unreleased status.

**Exit:** supported legacy calculator and opening/delete flows pass regression tests; typecheck/build are green; exact results are recorded. An existing live access exposure, if safely confirmed, must be separately contained before public rollout. Do not claim runtime failures merely from the pasted summary.

**Not included:** new renderer, new room schema backfill, subscriptions, partner integration or advanced drawing.

### M2 — Build the authoritative measurement engine

**Entry:** M1 evidence complete. M2A: shared v2 schemas, physical units, parsers and legacy adapter. M2B: height/opening validation, provenance and quantity policies. M2C: immutable quantity result contract, pure engine, fixture/property tests and browser/server parity.

**M2A evidence:** [issue #3](https://github.com/armentrout1/ModernFloorPlanner/issues/3), [results and conversion contract](MFP_M2A_RESULTS.md). Shared v2 measurements/parsers and an additive legacy adapter are locally producer-verified. Existing editor/API payloads remain legacy; no database migration. The adapter uses clockwise wall starts and explicit center-anchored physical offsets, preserves original JSON, and reports conflicting widths without choosing a confirmed value. M2A remains locally producer-verified and not deployed.

**M2B evidence:** [issue #5](https://github.com/armentrout1/ModernFloorPlanner/issues/5), [results and policy contract](MFP_M2B_RESULTS.md). Pure geometry-v1 validation, explicit timestamped confirmation/candidate/correction actions and rectangular-flat-v1 selected quantity policies are locally producer-verified. Numeric sufficiency, relevant geometry and confirmation are independent per output; unknowns and historical evidence remain explicit. Q-001 validation/readiness passes without calculating its M2C totals. All 120 unit/API and 19 browser cases pass; existing 61 unit/API cases, live editor/API payloads and preserved original JSON remain compatible. No deployment, database/runtime change or customer onboarding. Its subsequent M2C assignment is recorded below.

**M2C evidence:** [issue #6](https://github.com/armentrout1/ModernFloorPlanner/issues/6), [results and snapshot contract](MFP_M2C_RESULTS.md). All ten rectangular-flat-v1 outputs use one pure shared engine with auditable gross/raw/effective/net quantities, waste once, explicit partial/provisional results, guarded arithmetic and detached immutable snapshots. Actual Node and browser runs independently verify Q-001, selected-face answers, the labeled 256 sq ft partial subtotal and exact SHA-256 parity. All 170 unit/API and 25 browser tests pass, retaining the original 120/19; typecheck and build pass. A demonstrated large-coordinate M2B comparison defect was tightened without relaxing its 0.01 mm policy. Live editor/API formats are unchanged. M2C is producer-verified locally and NOT DEPLOYED; its subsequent bounded M3A assignment is recorded below.

**Touchpoints:** `shared/domain`, `shared/quantities`, compatibility adapters, selected property editors and tests. Keep old plans loadable; no live bulk conversion.

**Exit:** Q-001 passes; zoom does not change quantities; 32-inch and metric/fractional input stay precise; invalid and incomplete results remain explicit; linked physical opening counts and per-face deductions behave correctly; migration reruns do not duplicate or rescale data.

**Not included:** polygon editor, 3D, supplier quantities or authoritative financial totals.

### M3 — Deliver quick-room entry and usable sketch

**Entry:** M2 engine contract stable. M3A: room cards with length/width/ceiling height, names, presets and duplication with regenerated IDs. M3B: simple opening form (wall, offset, width, height, elevation), work/surface selection, live sketch and quantity breakdown. M3C: responsive docked layout, proper input focus, undo/redo and unobstructed controls.

**M3B Slices 1–4 / issue #10: COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED.** One integrated UI-created/adopted journey verifies shared room/opening data, synchronized views, quantities/scope, optional waste, review/correction, bounded opening Undo and recovery/source preservation. Bounded review-focus, invalid waste/opening blur and phone label repairs, plus two cross-feature browser tests, close the assigned work. [Results](MFP_M3B_RESULTS.md) record fresh **350/350 unit** and **125/125 browser** checks, exact delivered source and safe local review identity. M3 as a whole remains incomplete.

**M3C COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED.** Revert #12, manual physical view tabs #13 and committed physical-draft Undo/Redo #14 retain their completed evidence. Responsive/layout and focus acceptance #15 completes the remaining agreed local requirements, including populated docked/drawer workflows, unobstructed controls, keyboard/focus and pending-input/history preservation. [Preserved M3C results and LF-01–LF-12 matrix](MFP_M3C_LAYOUT_FOCUS_RESULTS.md) record that package’s source and full verification. M3D level ownership/selection and the assigned straight-stair/landing slice are complete above. The next bounded fixed-object/zone assignment remains NOT STARTED.

**M3A evidence:** [issue #7](https://github.com/armentrout1/ModernFloorPlanner/issues/7), [results, local command and screenshots](MFP_M3A_RESULTS.md). The real `/quick-room` route supports name-only presets, unknown/unconfirmed physical dimensions, safe raw editing and unit changes, independent duplication, protected removal, and engine-derived floor/flat-ceiling/gross-wall quantities. Separate sketch and Quick Rooms drafts survive navigation; validated temporary sessionStorage recovery never sends v2 data through the legacy save API. Inactive sketch portals/shortcuts/gestures are guarded, and mobile page scrolling is scoped correctly. All 201 unit/API and 43 browser tests pass, retaining original 170/25 and all six M2C parity cases; clean install, typecheck, build and whitespace checks pass. Desktop/tablet/phone viewport captures were inspected. M3A is complete locally and NOT DEPLOYED. M3 as a whole remains incomplete; current M3B Slices 1–4 local completion is recorded above.

**Separately assigned sketch centering repair:** [issue #8](https://github.com/armentrout1/ModernFloorPlanner/issues/8), [results and screenshots](MFP_CANVAS_CENTERING_RESULTS.md). Fit drawing now centers all room bounds in the actual visible grid, with a visible footer and view-only zoom/pan preservation. All 201 unit/API and 49 browser tests, typecheck and build pass. This bounded repair is producer-verified locally and NOT DEPLOYED; Select All/group movement were proposed at that checkpoint; the later explicit editor UX assignment below activates them. It does not activate M3B or complete the broader M3C responsive editor work.

**Subsequent mouse-pan repair:** [issue #8](https://github.com/armentrout1/ModernFloorPlanner/issues/8), [results](MFP_CANVAS_PAN_RESULTS.md). Middle-button, Hand and Space drags now use one view-only gesture path with native-autoscroll cancellation, steady screen-pixel movement and protected release/cancellation. Pan gestures and leaving a hover preview cannot place openings. All 201 unit/API and 55 browser tests, typecheck and build pass; producer-verified locally, NOT DEPLOYED. Selection/group movement were proposed at that checkpoint and are activated by the later editor UX assignment below; M3B had not started at that checkpoint. A bounded follow-up removes the duplicate scaled grid background; typecheck/build, four targeted browser checks and local zoom inspection pass (see the same results document). The subsequent assigned Ctrl-wheel/two-finger zoom change is also verified locally with36 relevant browser checks, typecheck/build and phone-sized touch emulation; see the same results document. No later milestone is activated.

**Touchpoints:** quick-room/editor features and existing panels; calculations only via the shared engine.

**Exit:** one room can be entered without drawing; dimensions, openings, sketch and totals agree immediately; duplication does not alias IDs; selecting one wall does not count all four; keyboard-only form use works; desktop/tablet/mobile checks show no hidden fields or overlaying controls. Browser regression checks cover placement on all walls and representative zooms.

**Pilot usability target (hypothesis):** after one explanation, at least 4 of 5 representative pilot users complete a basic room without assistance in under 2 minutes. Measure it; do not state it as achieved.

**Not included:** freely floating sidebars, furniture, scans or full-building layout constraints. Limited owner testing is not a public multi-tenant launch.

**Separately assigned selection and opening UX:** [issue #8](https://github.com/armentrout1/ModernFloorPlanner/issues/8), [interaction decisions, official documentation comparison and verification](MFP_EDITOR_UX_RESULTS.md). The owner activates Select All/marquee/Shift selection, common-delta movement, explicit saved Group/Ungroup, precise Drawing contents selection, safer delete/recovery, room-name visibility, visible door hinge/swing flips and common/custom opening sizes. These are compatible legacy sketch improvements; optional group/window-height metadata does not infer physical topology or activate M3B. Secondary tools are collapsed to reduce clutter. Producer-verified locally: 204 unit/API checks, all 71 browser checks, typecheck/build and a fresh local frontend visual smoke passed; details and limitations are in the linked report. NOT DEPLOYED. Full responsive panel work and general movement undo remain M3C scope.

**Owner-assigned door handing follow-up:** issue #8 and the follow-up section of [editor UX results](MFP_EDITOR_UX_RESULTS.md) track corrected inward hand labels using the back-to-hinge viewpoint, common preview/render geometry, precise swing-sector selection and double-click hand flips. Existing saved hinge geometry is preserved. Producer-verified locally with 222 unit/API checks, passing evidence for all 52 relevant browser cases (including the documented five-case follow-up), typecheck/build and local visual smoke. NOT DEPLOYED. This remains a bounded legacy editor repair, not M3B activation; exact checks and compatibility limits are recorded in that report.

**Owner-assigned contextual sidebar tabs:** [issue #8](https://github.com/armentrout1/ModernFloorPlanner/issues/8) and the [editor UX report](MFP_EDITOR_UX_RESULTS.md) record the researched replacement of room accordions with Room / Doors / Windows tabs, scoped exact-item buttons, canvas synchronization and safe browsing. Producer-verified locally: 42 relevant browser cases plus one final narrow-layout case, typecheck/build and inspected desktop/narrow screenshots passed. NOT DEPLOYED. This bounded sidebar assignment preserves saved geometry and group semantics and does not activate M3B or complete all M3C layout work.

**Owner-assigned panel-toggle repair:** issue #8 and [editor UX results](MFP_EDITOR_UX_RESULTS.md) record one fixed toggle per side, correct arrow directions, remembered resized widths, preserved inspector drafts and bounded Materials scrolling. Producer-verified locally with 34/34 focused browser checks, typecheck/build and inspected local screenshots. NOT DEPLOYED. No saved-model change or later milestone activation.

**Owner-assigned window-size selectors:** the [editor UX report](MFP_EDITOR_UX_RESULTS.md) records separate common width/height presets, custom dimensions and exact legacy-height handling. Producer-verified locally: 222 automated checks, final 14 focused browser cases, typecheck/build and inspected desktop/narrow screenshots passed; earlier browser failures and their resolution are recorded. NOT DEPLOYED. No later milestone activated; issue #8 publication remains pending the earlier permission question.

**Owner-assigned Floor Plan Preview repair:** the [editor UX report](MFP_EDITOR_UX_RESULTS.md) records a centered, read-only preview with actual opening geometry, label controls, safe keyboard/focus handling and bounded phone resizing. Producer-verified locally: 234 automated checks, final 10 focused browser cases, typecheck/build and isolated local visual smoke passed; earlier failures and their resolution are documented. NOT DEPLOYED. This bounded preview repair preserves saved sketches and does not activate later milestones. Issue #8 publication remains pending the earlier permission question.

**Owner-assigned compact opening inspector:** the [editor UX report](MFP_EDITOR_UX_RESULTS.md) records one size input per dimension with attached common presets, compact swing/hand choices, opening chips and optional help. Typecheck/build, local visual smoke and all 49 distinct relevant browser cases have passing evidence across the documented initial and focused final runs. NOT DEPLOYED. Saved geometry and legacy validation are preserved; no later milestone activated.

### M3D - Building layout (levels and assigned straight stairs COMPLETE; later assignments PROPOSED)

Source: [issue #9 / MFP-BLD-001](https://github.com/armentrout1/ModernFloorPlanner/issues/9). M3B and M3C are complete locally. The owner activated and completed level ownership/selection [#16](https://github.com/armentrout1/ModernFloorPlanner/issues/16), then the linked straight-stair/landing/surface-opening slice [#17](https://github.com/armentrout1/ModernFloorPlanner/issues/17). Later assignments require their own bounded activation.

1. **Levels before stairs — COMPLETE locally:** schema 3 ownership/selector, explicit lossless current-draft upgrade, active-level projection/edit targets, captured takeoff IDs, history/recovery and per-level view memory. Unknown historical ownership stays unassigned; elevation stays explicitly unknown. See the current checkpoint and results. No bulk migration.
2. **Linked straight stairs/landings — COMPLETE locally:** schema 4, one shared ID with explicit lower/upper level-room endpoints or unresolved destination, independent room-local placements, unknown-capable width/run/rise, optional endpoint landings and separately attached floor/ceiling openings. Explicit impact readiness, internal-rectangle union deduction, retained gross basis, history/recovery, legacy snapshots and both endpoint views pass. No automatic footprint deduction, landing addition, level elevation, riser design or structural claim. [Results](MFP_M3D_STAIRS_RESULTS.md).
3. **NEXT — minimal fixed objects and room-use/zones (NOT STARTED):** one assigned object family at a time, with attachment, provenance/version and quantity-effect rules. Virtual kitchenette/bath zones create no wall perimeter or duplicate room area. Objects without validated takeoff rules remain geometry-only/incomplete.

Level acceptance now proves independent same-X/Y projection/hit targets and invariant geometry/totals under names/order/camera changes. Stair acceptance now proves one identity across both endpoints, explicit surface-only deductions and preserved originals/metadata/snapshots. Later acceptance still requires that any overview movement cannot change quantities and zones cannot double-count. No structural, egress or code-safety certification is implied.

The local level/version contract is now selected and verified; persistence/export consumers must explicitly support it before their interfaces are frozen. The complete object list, kitchen/bath catalog and trade overlays are not prerequisites for basic secure saving in M4; a secure single-level release need not wait for every proposed M3D object.

**Later bounded product work:** after the core workflow and required safe persistence, separately assign detailed kitchen/bath layout tools and sourced rule profiles, then trade overlays and attachment/connection handling. Rough-in calculations, engineering, pipe/wire sizing and routing need later explicit scope and fixtures. Use the same model rather than copied plans. Preserve M5-M8 numbering and gates; trade functionality does not silently expand M7 pack/coverage scope. No furnishing/appliance-decorating catalog is added.

### M4 — Make standalone use safe and dependable

**Entry:** M1-M3 core workflow (M3A-M3C); deployment binding verified; actual identity provider decision recorded. Multi-level persistence/exports also require the selected M3D level/version contract, not the complete future object catalog. M4A: authentication, workspace/membership authorization and denied-access tests. M4B: explicit legacy ownership review, additive storage migrations, revisions, autosave/idempotency/conflicts and local recovery. M4C: project list, rename/duplicate/archive/restore; PDF/CSV and accessible print view from the same snapshot.

**Export contract:** project/room names, snapshot ID, dimensions, units, selected scope, gross/deductions/net, waste, engine/policy version, date and uncertainty. PDF drawing scale must be labeled schematic unless physically calibrated and tested; no implied print-to-scale certification. CSV escaping must prevent spreadsheet-formula injection. Check pagination, font/rendering, long room names and multi-room reports. Download permission is checked at retrieval; exported files already downloaded cannot be retroactively revoked.

**Exit:** business A cannot list/read/update/delete/export B's data even with known IDs; viewer writes denied; revoked membership/expired session denied; two writers cannot silently overwrite; save retries do not duplicate; refresh recovers a draft; old revisions are stable; export numbers equal the authoritative snapshot; archive/restore and tested recovery procedure work. Check authorization against real implementation using permitted test records, not customer-data enumeration.

**Release gate:** only after M4 may the secure standalone pilot accept other customers. Live production release uses the existing approved deployment path, not an assumed host. No mandatory staging environment; fast local/test-database checks do not authorize synthetic writes into production.

### M5 — Validate paid use before automating expansion

**Entry:** M4; supervised pilot feedback. M5A: run 5–10 representative pilot users and compare entered-room results to independently calculated fixtures/field measurements. Track time to first quantity, save/export success, errors, support effort and repeat use. M5B: server-side entitlements and billing-state adapter; provider test mode; duplicate/out-of-order event, cancellation and failed-payment tests. M5C: reviewed commercial terms and explicit live-billing authorization.

**Exit:** no known critical calculation/data-isolation/data-loss issue; selected outputs explain their basis; pilot task results and willingness-to-pay evidence recorded; entitlement changes cannot be forged from the client; cancellations do not silently erase customer documents. Pricing is a hypothesis until tested. A checkout redirect alone is not payment confirmation.

**Not included:** launching all enterprise plans automatically, billing partner recalculations or making unverified margin claims.

### M6 — Connect FixDoneNow through the same product

**Entry:** M4 security/revisions/exports, M5 pilot learning, and agreed consumer contracts. Map DR-001, DR-002 and ECO-002. Producer work stays here; FixDoneNow/LedgerLine adapters are separately assigned in their owning repos.

M6A: server-to-server integration credentials with scoped workspace mapping and explicit existing-workspace consent. M6B: product-hosted editor launch, short-lived one-time scoped exchange and validated return context. Start with a top-level hosted flow; an iframe/package is a later transport, not the architecture. M6C: versioned snapshot retrieval, signed notification/outbox, idempotent delivery, accepted-handoff metering and reconciliation.

**Proposed interfaces, not currently implemented endpoints:** `POST /api/v1/editor-sessions`; `GET /api/v1/designs/:designId/revisions/:revisionId/quantities`; `POST /api/v1/handoffs/:handoffId/accept`. Agree exact schemas/status codes before implementation. Typical responses include design/revision/snapshot IDs, geometry hash, engine/policy versions, confirmed measurement basis and per-surface quantities with units; no financial totals.

Map external business/job identity by integration AND environment. The partner credential must be checked together with the authorized human/workspace operation. Keep long-lived secrets server-side. Bind launch exchange to intended origin, resource, permission, expiry and one-time nonce; avoid secrets in URLs/logs. Handle cancellation, expiration and revoked access without losing work. Allowlist return URLs. If postMessage is later used, validate both origin/source and schema, never wildcard target origin [R10].

Completion notification carries references, not trusted client calculations. FixDoneNow obtains the authorized snapshot server-side and passes the versioned quantities to LedgerLine's existing estimate interface. Revised geometry offers an explicit estimate revision; it never alters an issued financial document. Events have stable IDs, signatures, replay limits and retries; duplicate/out-of-order/missed delivery must be recoverable. One database outbox is sufficient initially; no new broker is required.

**Exit:** standalone still works; business A cannot launch B's drawing; expired/replayed sessions fail; repeat provisioning/handoff does not duplicate or bill twice; partner downtime preserves edits; the originating FixDoneNow job opens, edits, returns and uses the exact authorized quantity revision in LedgerLine. Record producer and consumer commits/deployments and actual end-to-end result. Mocked callbacks are not integration completion.

### M7 — Add material purchasing quantities

**Entry:** reliable measured quantities and pilot demand. M3B supplies measured areas/lengths/counts and missing-input states; they are not an order-ready construction list. M7 adds selected versioned material/system recipes: product/type/thickness/layers, installation/deduction basis, coverage/coats and separate primer, accessories, material-specific waste, package/stock size and compatible pooling. Examples include specified drywall boards/fasteners/compound, flooring underlayment/setting materials/transitions, and suspended-ceiling panels/grid/tees/perimeter/hangers from verified configurations. Persist source/unit/date and recipe/waste/rounding version. Net finish area is not automatically a sheet/cutting consumption basis; no universal waste or deduction factor. Sum compatible quantities before package round-up; keep incompatible products separate and apply allowances once. Linear trim plus allowance is not optimized cutting stock.

**Complete takeoff boundaries:** later bounded trade models supply required unique wall assemblies/framing inputs, routes/elevations/connections/schedules/specifications. Two finish faces are not two stud walls; zones cannot duplicate parent floor area. Never infer hidden construction from a plan outline. Scope, existing/retain/new/demolish state and calibrated source evidence are explicit where supported. Report each requested scope as Ready for review / Estimated with assumptions / Missing information / Unsupported / Not in scope, naming blockers/source objects; do not mark a global full takeoff complete while omitting trades. Trace source revision -> geometry -> policy/recipe -> net -> allowance -> package and retain separate manual allowances and old snapshots. Detailed trade functionality remains later assigned work, not an unbounded expansion of M7. LedgerLine retains financial authority; M4 retains durable exports.

**Exit:** Q-001 gives 7 boxes at 20 sq ft/box and 10% waste; compatible pooling, different SKUs, metric conversions, pack changes and waste-once cases pass. Reference costs are labeled nonbinding and do not duplicate LedgerLine totals.

### M8 — Supplier and enterprise expansion

**Entry:** measured demand, support capacity and a specific contracted supplier/partner use case. Add supplier adapters only with lawful supported access, SKU/unit normalization, region/availability/currency/source timestamp and stale-price warnings. Add negotiated quotas, administrative audit, retention controls, SSO and service obligations as independently scoped work. Purchase execution is not implied by displaying a product.

**Exit:** stale/missing supplier information cannot be presented as a confirmed quote; tenant/isolation tests still pass; contractual operations/support cost and allowed billing are demonstrated. Do not promise live retailer pricing or enterprise compliance before those capabilities exist.

## 6. Commercial model — pilot hypotheses, not active offers

Preserve the owner's proposed launch ladder for testing:

| Plan | Proposed price | Intended entitlement |
| --- | --- | --- |
| Free | $0 | One active saved project and basic quantities; limits enforced server-side. |
| Homeowner project | $9/project | 30 days of editing from verified purchase; standard exports; retained read-only access afterward under published retention terms. |
| Solo | $19/month or $190/year | One person using standard project/quantity/export workflow. |
| Team | $59/month or $590/year | Five members in a shared workspace; no partner API entitlement by implication. |
| Partner pilot | $299/month | Integration/distribution access plus 100 first accepted customer-job handoffs per month; $2/extra under agreed cap controls. |
| Enterprise | Negotiated | Contracted scale/admin/support requirements, not an automatic feature promise. |

Do not withhold calculation corrections behind a paywall. Recalculations, retries and revisions are included. For partner metering, a completed handoff is the **first explicitly accepted, server-verified usable snapshot for a logical external customer job**, uniquely scoped to integration/environment/business/job. Record it transactionally; count its first acceptance in that billing month. Revisions of the same logical job are not a new charge in a later month. Test duplicates, cancellations and retries; store auditable usage separate from geometry changes. New site visits/new jobs require the partner's agreed identity policy, not guesses from drawing edits.

No silent overages: warn, apply an agreed cap, and require authorized continuation. Team seats do not imply broad integration rights; a partner credential does not grant a human access to all customers. Cancellation/expired project editing does not silently delete documents or change already issued snapshots. Publish retention/deletion/access terms before charging.

Competitors demonstrate different pricing mechanisms, not demand for this product [R1–R5]. Validate packaging against room-entry speed, trustworthy quantities and repeat use—not an attempt to match every 3D feature. Defer partner billing implementation until M6 can prove its event semantics.

### Cost and viability measurements

No live operating costs, existing hosting invoices or actual margins were inspected. Track fixed hosting/database/monitoring expense, storage and export volume, payment costs under the chosen provider, support minutes, acquisition cost, cancellations and refunds. The MVP does not require a per-calculation AI call.

Use: monthly contribution = collected revenue − variable infrastructure/export/payment/support costs; operating result = contribution − fixed costs. Break-even accounts = fixed monthly cost ÷ average positive contribution per account. Measure per-account and per-accepted-handoff cost before offering uncapped enterprise volume. Do not substitute illustrative revenue scenarios for actual profitability evidence.

## 7. How Codex drives the roadmap

At each task start, read `AGENTS.md`, `ECOSYSTEM.md`, the My Way amendment, this file, related issues and opening docs. Verify the existing checkout; fetch and reconcile remote documentation with local work without deleting or overwriting it. Do not assume a GitHub commit updated the owner's local folder. Claim one bounded milestone/task in an owner-repo issue before application writes.

For each slice record: requirement ID, scope/non-scope, expected result, baseline and rollback commit, tests to run, unresolved provider/data decisions and release target. Make the smallest coherent change; run compatible unit/component checks, typecheck, build and focused browser acceptance. Pin tooling compatible with the actual Node/Vite/React lockfile, not an unverified latest version. No broad dependency modernization unless the task's demonstrated failure requires it.

Deliver ordinary authorized work through small compatible commits on verified `main` and the existing production binding, with focused live smoke. No force push, required staging/preview, secret publication or live money movement. If the remote advances, reread/reconcile rather than replacing another writer's changes. Cross-repo consumers receive their own bounded issues/commits; do not copy their engine here.

Completion evidence template:

```text
Requirement / issue:
Status: READY | WORKING | BLOCKED | PRODUCER_VERIFIED | DEPLOYED | CONSUMER_VERIFIED
Baseline -> commit:
Changed scope:
Checks and exact results:
Migration / data effect:
Deployment target and verified deployed SHA/ID (or NOT VERIFIED):
Producer workflow result:
Originating consumer result (or not applicable / not yet run):
Remaining defects / decision gate:
Next eligible task:
```

A failed check is not completion. A committed document is not working software; working locally is not deployed; deployed is not consumer-verified. Stop the current slice at a real access/configuration/destructive-data boundary and record it, while continuing unrelated safe work within the assignment. Do not launch all later milestones from a checklist.

## 8. Publication status and unresolved facts

At the original planning publication (historical): remote source/doc review and official-documentation research completed; issue #2 prepared. No application implementation, package installation, typecheck, build, full test suite, live security test, deployment verification or production data modification was performed by this review. Shell cloning was unavailable in the review environment, so source access used the connected GitHub interface; this does not prevent Codex from testing its verified existing checkout.

M1 entry resolved local document preservation and observable writer checks; M2A, M2B, M2C and M3A reverified the existing checkout, archived original and retained stash. The owner confirms the app is not hosted yet. Remaining unresolved facts: first hosting/database/identity configuration; saved-plan inventory/ownership; pilot demand and operating costs. These are explicit discovery/release gates, not reasons to rebuild the stack or abandon the plan.

Current state: M1, M2A/B/C, M3A, M3B and M3C remain complete locally. **M3D levels #16 and assigned straight-stair/landing/surface-opening slice #17 COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED.** Application/test `6ed8ad911777d687e76be832f7aaa67cf4a9de8f` passes fresh 475/475 unit and 166/166 browser checks plus 1/1 canonical smoke; [current results](MFP_M3D_STAIRS_RESULTS.md). The single next task is one bounded minimal fixed-object/room-use/zone assignment, NOT STARTED. M3D as a whole remains incomplete; #10 release tracker, #2 unreleased, #4 PROPOSED and CRM separate. Later trade and M7 material-recipe/purchasing boundaries remain unchanged.

Separate operational proposal: [hosting/runtime readiness, issue #4](https://github.com/armentrout1/ModernFloorPlanner/issues/4), status **PROPOSED**, not started. It covers Node 24 LTS compatibility/project pins and complete regressions, scoped dependency advisory review, Vercel frontend/Express/static/API/deep-link configuration, PostgreSQL selection and real persistence, server-only credentials/connection management, and protected owner-only early access. Verify current official documentation when activated. No public unscoped API or customer onboarding before M4 isolation. M2A, M2B, M2C and M3A do not change runtime pins, provision services, spend money or deploy.
