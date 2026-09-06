# MFP-M2A implementation and evidence

Date: 2026-09-06.
Requirement: DR-002 / [M2A issue #3](https://github.com/armentrout1/ModernFloorPlanner/issues/3).
Status: **PRODUCER_VERIFIED locally; M2A complete as assigned; NOT DEPLOYED.**
Dependency: [M1 issue #2](https://github.com/armentrout1/ModernFloorPlanner/issues/2) remains **open and explicitly unreleased**.
The owner accepted M1's local producer verification as sufficient to begin M2A.

Baseline / rollback reference: d3d63acde5815621b69acb576be177cec9b779a7.
Implementation commits:

- a35ede0e5619d2236edc2b0665500efef791fe09: physical unit types, v2 domain schemas, strict parsing/formatting, 16 added tests.
- 7e48e9a97ef81ab4164872dc4ccf2452eb4aa379: versioned non-destructive legacy adapter, 20 added tests.
- 5b0fb87f74e287c94a2c0b1722eaf5eeb6ad29d1: enforce JSON depth on converted output as well as input; one additional idempotency regression.

Delivery target: verified main; ordinary commits and push. No force operations.
This record accompanies the documentation commit after those implementation commits.
No database rollback is needed: no schema/data migration ran.

## Entry, authorization and preservation

Reverified the existing checkout, actual root, normalized origin
https://github.com/armentrout1/ModernFloorPlanner.git, main, upstream origin/main,
HEAD and clean working tree. Fetch found main unchanged at the reviewed baseline.
The active-task inventory and repo-filtered process inventory showed no competing
Modern Floor Planner writer; no index lock existed. These are observable
availability checks, not a guarantee about every possible process.

Read AGENTS, ECOSYSTEM, My Way, BUILD_ROADMAP, M1 results, opening documentation
and issue #2. Searched all repository issues before creating/claiming issue #3.
One writer/release owner coordinated read-only source/design reviews.
The retained M1 stash and archived local roadmap/backups were preserved;
none was reapplied, deleted or overwritten. No clone/worktree or cross-repo changes.

BUILD_ROADMAP remains the single authoritative build sequence. This file records
implementation evidence and the boundary contract; the ecosystem roadmap maps
capabilities. It is not another independently sequenced roadmap.

## Shared measurement contract

New modules:

- shared/domain/units.ts: branded finite decimal Mm and nonnegative Mm2,
  positive dimensions, nonnegative elevations, signed coordinates, centralized
  length/area conversions and 0.01 mm geometric comparison tolerance.
- shared/domain/measurements.ts: known, unknown and needs-review measurements;
  source, original input/unit, component precision and confirmation fields.
- shared/domain/parseMeasurement.ts: strict parsing and display-only formatting.
- shared/domain/document.ts: additive v2 room/opening/document schemas, stable
  wall identities and structural references. No database ownership is trusted here.
- shared/compatibility/legacyDocument.ts: explicit legacy/v2 dispatch, detached
  source preservation and review information.

Domain modules import only Zod and other domain modules. The compatibility boundary
also reuses the existing pure legacy validator; it imports no React, DOM, database
client or rendering/grid constants.

Room length is horizontal and room width is vertical in plan. Ceiling height is a
separate measurement. A measurement has state and valueMm: known has a finite
value; unknown and needs-review use null. Review measurements retain candidates
and provenance. Missing data never becomes zero. Zero sill/elevation is valid;
zero dimensions and negative elevations are invalid; presentation x/y may be negative.

Parser output is manual/unconfirmed. Imported legacy values are imported/unconfirmed:
old numeric JSON does not prove typed precision or whether a creation default was
measured. Its original input is null, the numeric source token is retained, and
precision is explicitly unavailable. No confirmation workflow was implemented.
Conflicting candidates are needs-review, never confirmed.

The v2 scaffold retains optional document identity/name, nullable revision/policy
identities, room/opening metadata and optional presentation placement. Four wall
faces have stable IDs; each opening has one or two distinct existing wall references.
No automatic shared-opening linking/deduplication occurs.

## Supported input syntax and numerical limits

parseMeasurement(input, { selectedUnit?, kind? }) returns explicit success or
error. The default kind is dimension; elevation and coordinate contexts exist.

| Syntax | Examples |
| --- | --- |
| Feet / decimal feet | 12 ft; 12.50 feet; 12' |
| Feet plus inches | 12 ft 6 in; 12' 6"; 12′ 6″ |
| Fractional inches | 3/8 in; 32 3/8 in; 12 ft 6 1/8 in |
| Metric | 3810 mm; 381 cm; 3.81 m |
| Bare value with selected unit | 32 with selectedUnit in; 1/2 with selectedUnit in |

Unit suffixes are case-insensitive. Singular/plural foot/feet, inch/inches, and
American/British millimeter/centimeter/meter spellings are supported. Explicit
suffixes take precedence over selectedUnit. Raw input, including whitespace and
trailing-zero precision, is retained separately from millimeters. Fraction
denominators and each feet/inches component are retained.

Compound feet are whole numbers and the inches component must be below 12.
Fraction notation is supported for inches only. Standalone improper fractions
such as 3/2 in are accepted; the fractional part of a mixed number must be proper.
Denominators must be positive safe integers. A leading sign applies to the complete
feet/inches pair; negative values require coordinate context.

Rejects partial/malformed input, missing bare-unit context, unsupported units,
duplicate/reversed units, invalid fractions, exponents, hex, comma grouping,
NaN/infinity and overflow. Numeric input is a string boundary, not parseFloat.
Input precision smaller than twice machine epsilon at the converted magnitude
is rejected explicitly; e.g. 9007199254740993 mm cannot silently become
9007199254740992. The representation uses finite JavaScript numbers, not arbitrary
precision decimal arithmetic; normal binary conversion differences use tolerances.

formatMeasurement(valueMm, unit, fractionDigits) supports 0–12 display decimal
places and does not alter the stored measurement. It does not snap to a drawing
grid or round purchasing quantities. Length conversion constants: 25.4 mm/in,
304.8 mm/ft, 10 mm/cm, 1000 mm/m; square-unit conversion applies the factor twice.

## Versioned legacy conversion rules

Only absent schemaVersion or numeric version 1 uses the reviewed legacy convention.
Version 2 is validated and returned as an equivalent detached document, preserving
existing IDs, physical values, metadata and review records. Other version values
return unsupported-version explicitly. Invalid data returns invalid with errors.

The public adapter accepts finite, acyclic plain JSON with maximum nesting depth
100, including the preserved-source envelope in converted output; it rejects functions, undefined, bigint, Dates, symbols, cycles and nonfinite
metadata rather than normalizing/dropping them. It preserves valid own JSON keys
including __proto__ without prototype pollution. Zod validates, but its parsed
copies do not replace preservation snapshots.

Verified legacy rules from creation, rendering, editing and regression source:

| Legacy field | Interpretation / conversion |
| --- | --- |
| room.width / room.height | Horizontal / vertical plan dimensions: pixels / 20 × 304.8 mm. Never ceiling height. |
| room.x / room.y | Signed presentation placement at the same model scale; no physical adjacency claim. |
| opening.size | Model pixels, independent of numerical magnitude. |
| doorProperties.width / height | Entered inches × 25.4; not pixels. |
| opening.position | Percentage of wall length to the opening center. |
| Missing ceiling/window height or sill | Unknown with reason; no defaults invented. |
| Unknown metadata fields | Preserve verbatim; do not infer physical units. |

Evidence: canvas.ts GRID_SIZE/FEET_PER_GRID, createRoomObject,
calculateObjectPosition, detectWallClick and inchesToPixels; CanvasContainer
creation, findNearestWall and drag commit; RoomObject main opening styles;
RoomBox wall segments; PropertyPanel width/height updates; M1 API/browser
fixtures. The UI's window "height fixed 36" label is not persisted measurement evidence.

Clockwise wall starts use +x right / +y down:

| Wall | Start → end | Physical center offset |
| --- | --- | --- |
| top | top-left → top-right | horizontal length × p/100 |
| right | top-right → bottom-right | vertical width × p/100 |
| bottom | bottom-right → bottom-left | horizontal length × (1 − p/100) |
| left | bottom-left → top-left | vertical width × (1 − p/100) |

Attachments explicitly use anchor: center. This preserves positions even when
width is unresolved; no authoritative leading edge is invented. Later policies
can derive edges as center ± width/2 when width is known. Legacy positions 0 and
100 remain unchanged, including openings that extend beyond corners; full
bounds/overlap/height policy validation is M2B. No UI 10–90% clamp is applied.

For a 240×200 pixel room, a consistent 32-inch door at 25% retains leading-edge
distances approximately 508 / 355.6 / 2336.8 / 1879.6 mm on top/right/bottom/left.
Tests invert the clockwise center mapping and compare with the existing
calculateObjectPosition utility using non-midpoint fixtures.

With doorProperties present, unequal entered-inch versus saved-pixel widths
outside 0.01 mm tolerance become an unresolved measurement with both candidates
and a structured conflicting-widths review item. Nothing rewrites size.

For older doors without doorProperties, saved size remains the unconfirmed M1
quantity basis and a legacy-rendering-fallback review item discloses inconsistent
historical rendering: line/wall gap uses 40 pixels, swing/preview uses 36 inches.
No missing door height/style/swing is invented. The live renderer is unchanged.

Original JSON is preserved separately from editable metadata; returned metadata
edits cannot alter the snapshot or caller input. Original room/opening IDs,
ordering, names, colors, styles/swings and unknown nested data survive. Wall IDs
use injective room/side encoding in a deterministic collision-free namespace.
Before/after room/opening counts are retained; no random IDs, timestamps or camera
zoom/pan affect conversion. Reprocessing v2 never reconverts pixels or duplicates IDs.

## Exact checks and results

Executed on Windows with Node **20.20.2**, npm **10.8.2**, TypeScript **5.6.3**,
Vite **5.4.14**, Playwright **1.55.1**. Used the already installed Node version
through process-local PATH; no machine-wide installation/switch or project pin change.

| Executed command | Actual result |
| --- | --- |
| npm ci | Exit 0; 505 packages added, 506 audited; lockfile unchanged. |
| npm test | Exit 0; **61 passed**, zero failures/skips/cancellations. Original 24 + 16 parser/unit/schema + 21 adapter/schema cases; reported duration 498.9655 ms. |
| npm run check | Exit 0; TypeScript passes. |
| npm run build | Exit 0; 1766 modules; JS 485.62 kB / 147.57 gzip, CSS 65.45 kB / 11.63 gzip, server 14.6 kB. |
| npx playwright test --reporter=line | Exit 0; **19 passed in 51.2 seconds**, one worker, no retries/skips. |
| git diff --check and staged checks | Exit 0 after removing trailing blank lines from new test files; no remaining whitespace errors. |
| Runtime-path preservation diff | No changes to client/server, existing legacy schemas/validator, original 24 tests, all 19 browser cases, package/lockfile or .nvmrc. |

Unit evidence includes 12 ft = 3657.6 mm; 32 in = 812.8 mm; equivalent
12 ft 6 in / 12.5 ft / 3810 mm / 3.81 m; fractional precision; explicit unknowns;
all four wall orientations; conflicts without mutation; frozen-input/original
isolation; styles/swings/metadata; unsupported versions; collision-safe IDs;
v2 idempotency; and camera independence. Before/after quantity comparisons reuse
the M1 calculator through a test-only unit projection. No second quantity engine.

Browser coverage retains all M1 placement, dragging, resizing, styles, widths,
save/reload, delete/undo, keyboard guards, save/rename failure, draft protection,
explicit width confirmation and tooltip recovery regressions. It exercises real
HTTP routes with disposable in-memory storage on loopback, not PostgreSQL.
Frontend asset hashes remain the M1 hashes; the additive modules are not imported
by the live editor/API.

Read-only reviews found unsafe numeric precision and Zod stripping special JSON
metadata keys; both were repaired and covered. A final depth-limit test reproduced a successful conversion that could not be reopened as v2 (20 adapter cases passed, one failed). Applying the JSON boundary to output fixed it; final tests pass 61/61. Remaining
warnings: stale Browserslist data, Playwright color-environment notices, and the
same 28 dependency advisories (4 low / 10 moderate / 14 high / 0 critical).
No blanket or forced dependency upgrade was performed.

## Deployment, limitations and next task

**NOT DEPLOYED.** The owner confirms this product is not hosted yet.
Hosting, PostgreSQL provider/connection/persistence, auth and tenant isolation are
**NOT VERIFIED** by M2A. No database/provisioning/customer data operations, money
movement, hosting activation or customer onboarding occurred. Existing unscoped
floor-plan routes must not be publicly exposed for customer use.

Separately recorded [issue #4](https://github.com/armentrout1/ModernFloorPlanner/issues/4)
is **PROPOSED** only: Node 24 compatibility and project pins with full regression,
scoped dependency review, Vercel frontend/Express/static/API/deep links, PostgreSQL
selection and real persistence, server-only credentials/connection management,
protected owner-only early access and the M4 customer-isolation gate. Verify
then-current official documentation when activated. No mandatory staging/preview.

M2A is complete within its additive boundary. Full height/opening fit/overlap and
confirmation policies are M2B; the complete authoritative quantity engine is M2C.
No v2 persistence/live payload switch, renderer replacement, quick-room UI,
authentication, billing, partner integration or supplier features started.

**Next eligible task: M2B**, under a separately bounded assignment; not
automatically started. M1 issue #2 stays open/unreleased; M2A's code publication
does not imply a production release or consumer integration.
