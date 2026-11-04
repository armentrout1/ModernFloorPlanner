# Modern Floor Planner area calculator architecture and UX blueprint

Date: 2026-11-04  
Status: PLANNED — IMPLEMENTATION NOT STARTED — NOT DEPLOYED  
Baseline reviewed: main at 7fe09f0eafe6e581549a7cf5a6ba68ee5711b78a  
Owning requirement: issue #9, MFP-BLD-001, and ecosystem dependency DR-002

## Decision summary

Modern Floor Planner will build the calculator as a focused user experience over its existing physical measurement and quantity engine. It will not copy, embed, scrape, or depend on squarefootagecalculator.co or another third-party calculator.

The product will have two calculator entry points that share one calculation source:

- Quick Rooms at /quick-room remains the fastest way to enter rectangular room dimensions and see room and project areas. Its navigation label should become Area calculator while the route remains unchanged for compatibility.
- Unified physical draft at /physical-draft gains an Area summary view for saved and multi-level work. The view will show room, level, and whole-project totals, then expose the existing detailed measured takeoff when the user needs openings, waste, trim, or export control.
- The legacy standalone sketch at / remains available but does not receive another calculator implementation.

The first calculator release covers measured floor area, flat ceiling area, gross wall area, completeness, and room/level/project rollups. Pricing, product coverage, package counts, and order quantities remain later M7 material-recipe work. FixDoneNow integration remains a later M6 consumer flow after Modern Floor Planner is deployed and its identity, persistence, pilot, and contract gates are complete.

## Product ownership

| Concern | Owning product | Calculator responsibility |
| --- | --- | --- |
| Measurements, rooms, levels, openings, quantity math, evidence, versions, and exports | Modern Floor Planner | Authoritative producer |
| Customer, property, job, workflow, and launch/return context | FixDoneNow | Orchestrates the measuring session and stores the producer reference |
| Prices, estimate lines, totals, approvals, and financial revisions | LedgerLine | Prices accepted quantity snapshots |
| Cross-product identity and mapping | Product-specific adapters | Use scoped references and contracts; do not read another product's database |

Modern Floor Planner must remain able to run by itself. FixDoneNow must not copy the geometry engine, and LedgerLine must not become the source of physical quantities.

## Current repository baseline

The repository already contains most of the calculator foundation:

- React, TypeScript, Vite, Tailwind, and Wouter provide the client.
- Express, PostgreSQL, and Drizzle provide the server and saved-project path.
- shared/domain owns physical documents, measurements, units, levels, openings, applicability, and geometry validation.
- shared/quantities owns the canonical calculation engine, policies, readiness, results, fingerprints, snapshots, and display conversion.
- /quick-room already accepts room name, length, width, ceiling height, imperial or metric input, and shows floor, flat-ceiling, and gross-wall quantities for each room and the project.
- /physical-draft already supports levels, rooms, openings, stairs, surface openings, zones, fixed cabinet blocks, selected-work takeoffs, waste, input review, immutable snapshots, CSV, printable reports, and schematic drawing exports.
- Existing result records carry target IDs, room IDs, readiness, evidence, status, amounts, deductions, and errors. The engine already distinguishes complete, provisional, partial, blocked, unknown, and unsupported results.
- Existing calculations use canonical millimeters and square millimeters. Display units and rounding do not feed back into the math.

The missing capability is not area arithmetic. The gap is a clear rollup model and a beginner-friendly presentation that answers:

1. What is the area of this room?
2. What is the total for this level?
3. What is the total for the complete project?
4. Which rooms are missing information?
5. Is this an all-room summary or a selected-work takeoff?

No existing helper produces a first-class per-level summary. Quick Rooms calculates per-room and whole-project values. Physical Draft shows the selected room or complete draft and separately exposes an advanced selected-work takeoff.

## Calculation architecture

### One engine and two read models

The existing calculateQuantities function remains the only arithmetic authority. The calculator adds a pure summary projection after calculation.

The data flow is:

1. A physical document supplies rooms, level ownership, measurements, openings, and evidence.
2. requestForRooms selects every modeled room for floor area, flat ceiling area, and gross wall area with zero waste.
3. calculateQuantities produces canonical records and aggregates.
4. A new summary projection groups those records by room and level without recalculating dimensions.
5. UI components format the canonical values for feet or meters.
6. Detailed takeoff continues to use the draft's explicit selected-work request, policies, waste, and opening deductions.
7. Exports and future APIs capture the exact calculation snapshot rather than UI text.

This separation prevents a simple all-room area summary from silently changing the user's selected takeoff scope.

### Proposed summary module

Add shared/quantities/summary.ts as a pure projection with no React, DOM, database, or rendering imports.

Inputs:

- PhysicalDocument
- CalculationResult from the existing engine
- an explicit summary scope, initially all modeled rooms

Outputs:

- one row per room
- one group per level
- one whole-project group
- output kind and canonical unit
- complete total when every included target is usable
- partial subtotal when some targets are usable
- included and excluded room IDs
- count of incomplete, provisional, unsupported, and complete rooms
- stable ordering based on level display order and room document order
- a neutral historical/unassigned group for documents without reliable level ownership

The projection must sum existing record amounts. It must never parse formatted strings or repeat length-times-width logic.

### Completeness rules

A calculator must not turn missing measurements into zero.

- Complete: every requested target has a complete result.
- Provisional: every requested target is numerically usable, but at least one input or applicability declaration is not confirmed.
- Partial: at least one target is usable and at least one target is blocked, missing, or unsupported. Show a labeled subtotal and the excluded-room count; do not label it Total.
- Unavailable: no included target is usable. Explain the missing or unsupported requirement.
- Historical/unassigned: preserve old document meaning and group it neutrally; do not invent Main Floor.

Level and project status derive from their children. A complete project total cannot be displayed when one included room is incomplete.

### Unit and precision rules

- Keep millimeters and square millimeters as the calculation boundary.
- Preserve the unit, text, precision, source, and confirmation attached to each entered measurement.
- A feet/meters toggle changes presentation and the default context for new input only.
- Do not round before aggregation.
- Display two decimal places in the first calculator UI while retaining canonical values in snapshots and exports.
- Do not derive measurements from pixels, grid spacing, zoom, placement, room-card order, or level-panel position.

### Geometry rules

The first release retains the existing supported model:

- rectangular rooms
- flat ceilings
- vertical walls
- interior finished dimensions
- supported doors, windows, and explicit surface openings
- imperial and metric input

The first release must not imply support for arbitrary polygons, L-shaped rooms, circles, triangles, sloped ceilings, surveyed building placement, gross living area, code compliance, or appraisal calculations. An L-shaped space can be entered as separately named rectangular measured sections only after the product defines how those sections belong to one room without double counting. Until then, the UI must label that shape unsupported rather than estimate it silently.

Zones and cabinet blocks remain layout annotations and do not add to the parent room's area. Stairs and landings do not change finish area unless an explicit supported surface-opening policy applies.

## UX placement

### Navigation and routes

| Location | User purpose | Calculator behavior |
| --- | --- | --- |
| /quick-room | Fast measuring without drawing the full plan | Primary Area calculator entry; room cards and sticky project summary |
| /physical-draft | Saved, multi-level, opening-aware project work | Add Area summary as a third view beside Quick Rooms and Drawing |
| / | Legacy sketch workflow | Keep the existing legacy display; do not add new calculator logic |
| FixDoneNow job, later | Launch from a customer job | Open the hosted /physical-draft session with scoped return context |

Keep /quick-room as the URL so bookmarks and tests remain valid. Change user-facing navigation from Standalone Quick Rooms to Area calculator where the label describes the task more clearly. The page title may read Area calculator with Quick Rooms retained as the workflow name in supporting copy.

### Quick calculator experience

The existing Quick Rooms page should remain the lowest-friction flow:

1. Choose feet or meters.
2. Add a room.
3. Name the room or choose a name-only preset.
4. Enter length and width.
5. Enter ceiling height when wall area is needed.
6. See the room result immediately after the input is applied.
7. Add or duplicate more rooms.
8. See the project summary update.
9. Choose Open a physical copy when openings, levels, saving, or exports are needed.

Each room card should show:

- floor area
- flat ceiling area
- gross wall area
- Complete, Provisional, Incomplete, or Unsupported state
- one concise next action when incomplete

The project summary should show:

- all modeled rooms
- complete total or explicitly labeled partial subtotal
- number of complete and incomplete rooms
- a direct Open in physical draft action
- a note that it uses entered finished dimensions and zero waste

Quick Rooms stays temporary in the browser tab until it is copied into the physical workflow. The UI must not describe it as account-saved.

### Physical Draft area summary

Extend PhysicalViewTabs from Rooms and Drawing to Rooms, Drawing, and Area summary.

Area summary contains three levels of information:

1. Project header cards for floor, flat ceiling, and gross wall area.
2. Level sections in display order, each with its totals, completeness, and room count.
3. Expandable room rows with room values, status, and Edit room or Locate source action.

The current Measured takeoff becomes the advanced section of this view. It remains the place to choose work, choose exact targets, set waste, inspect opening deductions, review evidence, and prepare exports. The summary must label itself All modeled rooms. The advanced section must label itself Selected work. These phrases prevent a user from assuming the two scopes are identical.

On a phone, project cards stack, level headings remain sticky only when they do not obscure content, and room rows use one column. On wider screens, project cards use a three-column grid and level sections may use two columns. No horizontal scrolling should be necessary at a 390-pixel viewport.

### States and language

Use direct contractor-friendly language:

- Total area
- Partial subtotal
- 1 room needs measurements
- Ceiling height is needed for wall area
- Unsupported room shape
- Based on entered finished dimensions
- All modeled rooms
- Selected work

Avoid language that suggests professional verification, permit compliance, surveyed area, purchased material, or final price.

### Accessibility

- Preserve manual tab activation and arrow-key behavior when adding the third physical-draft view.
- Every quantity must have a text label and status; color cannot be the only indicator.
- Applied versus unapplied input behavior remains explicit.
- Focus should move to the new room name after Add room and remain stable when summaries refresh.
- Dynamic summary changes should not create a noisy live region. Reserve announcements for explicit apply, errors, or requested navigation.
- Buttons that locate or edit a room must identify the room in their accessible name.
- Verify keyboard-only operation, 200 percent text zoom, phone layout, and screen-reader heading order.

## Likely implementation paths

The exact diff should remain small and additive.

| Path | Change |
| --- | --- |
| shared/quantities/summary.ts | New pure room/level/project projection |
| tests/quantity-summary.test.ts | Grouping, ordering, completeness, compatibility, and unit-independent fixtures |
| client/src/features/quick-room/QuantitySummary.tsx | Consume the projection and show completeness counts |
| client/src/pages/QuickRooms.tsx | Area calculator naming, project action, and clearer status copy |
| client/src/features/physical-draft/PhysicalViewTabs.tsx | Add the Area summary view and retain keyboard behavior |
| client/src/features/physical-draft/AreaSummaryPanel.tsx | New project, level, and room presentation |
| client/src/pages/PhysicalDraft.tsx | Render the summary view and place advanced takeoff within it |
| client/src/features/physical-draft/TakeoffPanel.tsx | Presentation-only heading/scope clarification; no new math |
| shared/exports/quantityReport.ts | Later additive grouped summary section if export parity is approved |
| tests/browser/quick-room.spec.ts | Fast calculator and incomplete-project behavior |
| tests/browser/physical-levels.spec.ts | Per-level rollups and historical grouping |
| tests/browser/physical-view-tabs.spec.ts | Third-tab keyboard and responsive acceptance |
| tests/browser/physical-exports.spec.ts | Grouped export parity when that packet is activated |

The first implementation packet should not require a database migration. Existing physical documents already persist room measurements, level ownership, quantity policy, and revisions. A migration is needed only if a future design adds new persisted semantics rather than a read projection.

## Delivery packets

### Packet 1: summary contract

Goal: produce deterministic room, level, and project summaries from existing engine results.

Work:

- add the pure summary module
- define complete, provisional, partial, unavailable, and historical grouping behavior
- preserve all canonical values and stable IDs
- test schema versions 2 through 5
- verify no React, DOM, database, or pixel dependencies

Completion evidence:

- focused unit tests
- existing quantity-engine and snapshot tests
- typecheck
- build
- whitespace check

### Packet 2: Quick Rooms calculator polish

Goal: make the existing fast workflow clearly discoverable as the area calculator.

Work:

- update task-facing names and copy
- show complete versus partial project results
- add completeness counts and next actions
- preserve temporary-draft warnings, original unit context, duplication, removal, and physical-copy adoption
- verify phone, tablet, and desktop layouts

Completion evidence:

- Quick Rooms unit and browser tests
- keyboard and responsive review
- no changes to engine arithmetic or saved-project APIs

### Packet 3: Physical Draft area summary

Goal: give saved multi-level projects an understandable room-to-level-to-project result view.

Work:

- add the third view
- render project, level, and room summaries
- place the existing advanced takeoff under the selected-work section
- add Locate source and Edit room navigation
- preserve selected level, room, drawing camera, pending fields, history, and takeoff request across view changes

Completion evidence:

- level, tab, drawing, takeoff, history, and recovery browser tests
- phone and desktop visual review
- no database migration

### Packet 4: exports and hardening

Goal: make on-screen grouping and captured reports agree without changing the immutable snapshot model.

Work:

- decide whether the grouped summary is an additive report section or a separate summary format
- derive any exported group from the captured calculation result
- retain canonical values, statuses, excluded targets, fingerprints, and source revision
- test long room/level names, historical schemas, print pagination, spreadsheet safety, and authorization

Completion evidence:

- export unit, browser, HTTPS, and authorization suites
- visual PDF review
- exact captured snapshot parity

### Packet 5: FixDoneNow integration after release gates

Goal: let a FixDoneNow job launch Modern Floor Planner and receive an accepted immutable result.

Prerequisites:

- Modern Floor Planner identity provider and owner sign-in/consent gate complete
- live database and hosting binding verified
- product pilot completed
- scoped workspace mapping and consent contract agreed
- producer API and event versions approved

Proposed flow:

1. FixDoneNow creates a short-lived, one-time editor session for a specific customer, property, job, and workspace.
2. The user opens Modern Floor Planner as a top-level hosted page.
3. The user measures, reviews, saves, and explicitly accepts a revision.
4. FixDoneNow retrieves the exact design revision and quantity snapshot server-to-server.
5. FixDoneNow stores producer IDs and mappings, not a copied geometry database.
6. LedgerLine receives the accepted physical quantities for pricing.
7. Later geometry changes create a new estimate revision; they do not silently mutate an issued financial document.

Proposed producer endpoints remain the roadmap's later M6 contract:

- POST /api/v1/editor-sessions
- GET /api/v1/designs/:designId/revisions/:revisionId/quantities
- POST /api/v1/handoffs/:handoffId/accept

An iframe or packaged calculator is not the first integration. The top-level hosted flow is simpler to secure, test, and version.

## Acceptance fixtures

### Existing golden fixture

For one 12 ft by 10 ft rectangular room with an 8 ft ceiling, one 3 ft by 7 ft door, and one 4 ft by 3 ft window:

- floor area: 120 sq ft
- flat ceiling area: 120 sq ft
- gross wall area: 352 sq ft
- opening deductions: 33 sq ft
- net wall area: 319 sq ft
- baseboard and shoe: 41 ft
- crown: 44 ft
- door casing: 17 ft
- window casing: 14 ft
- flooring with explicit 10 percent waste: 132 sq ft

The simple area summary uses zero waste. The advanced selected-work takeoff continues to show the 132 sq ft adjusted value when the user explicitly sets 10 percent.

### Multi-level fixture

- Basement: one complete 8 ft by 10 ft room = 80 sq ft.
- Main: complete 12 ft by 10 ft and 15 ft by 10 ft rooms = 270 sq ft.
- Project: 350 sq ft.
- Changing the active level, hiding a drawing layer, or moving the camera does not change any total.
- Zones and cabinet blocks do not add area.

### Incomplete fixture

- Main has one complete 12 ft by 10 ft room and one room with unknown width.
- Main shows Partial subtotal: 120 sq ft and 1 room needs measurements.
- Project cannot display 120 sq ft as a complete total.
- Entering and applying the missing width changes the result to a complete total.
- Unapplied raw text remains excluded and visible.

### Compatibility fixture

- Schema 2 documents appear under Historical / unassigned rather than an invented floor.
- Schema 3 through 5 documents group by stable level ownership.
- Existing surface-opening deductions remain distinct for floor and ceiling.
- Existing result, engine, policy, fingerprint, and snapshot versions retain their historical meaning.

### Unit fixture

- Equivalent imperial and metric measurements produce equivalent canonical values within the existing precision rules.
- Switching display units does not mutate measurements or fingerprints.
- Aggregation happens before display rounding.

## Test and release gate

Every packet must run focused tests first, then the checks proportional to the paths it changes. Before calculator implementation is called complete:

- npm test passes
- npm run check passes
- npm run build passes
- the relevant unfiltered Playwright suites pass
- quantity, snapshot, history, recovery, levels, takeoff, and export regressions pass when touched
- phone, tablet, desktop, keyboard, and printed output are reviewed where applicable
- calculation fixtures match the canonical engine in both Node and browser contexts
- no selected-work scope, source revision, or evidence is lost
- the commit is published to main with a normal non-force push
- deployment and live acceptance are recorded separately

A committed calculator is not a deployed calculator. Live use remains blocked until the existing M4 identity, database, hosting, and owner-access gates are completed.

## Out of scope

This blueprint does not authorize or imply:

- copying or embedding the external calculator
- a third-party runtime dependency
- arbitrary-shape geometry
- material packages, boxes, sheets, gallons, product catalogs, or pricing
- complete construction takeoffs
- trade routing or code compliance
- automatic measurement confirmation
- AI photo measurement
- live FixDoneNow or LedgerLine integration
- production deployment, provider setup, migration, or customer onboarding
- deletion of the existing legacy editor, branches, stash, drafts, or history

## Implementation recommendation

Start with Packet 1 and Packet 2. They deliver the clearest user value with the smallest architectural risk because the engine, Quick Rooms input model, unit handling, and project aggregate already exist. Packet 3 should follow once the summary contract is stable. Packet 4 can then add report parity. Packet 5 remains a separate cross-product release after the existing deployment and pilot gates.

This sequence gives Modern Floor Planner its own calculator without creating a second math system, preserves the evidence and safety rules already built into the repository, and creates the cleanest future handoff to FixDoneNow and LedgerLine.
