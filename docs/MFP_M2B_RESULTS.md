# MFP-M2B implementation and evidence

Date: 2026-09-06.
Requirement: DR-002 / [M2B issue #5](https://github.com/armentrout1/ModernFloorPlanner/issues/5).
Status: **PRODUCER_VERIFIED locally; M2B complete as assigned; NOT DEPLOYED.**
Dependency: [M2A issue #3](https://github.com/armentrout1/ModernFloorPlanner/issues/3).
The owner explicitly accepted M2A's documented local producer verification as entry.
[M1 issue #2](https://github.com/armentrout1/ModernFloorPlanner/issues/2) remains **open and unreleased**.
[Hosting/runtime issue #4](https://github.com/armentrout1/ModernFloorPlanner/issues/4) remains **PROPOSED**, not started.

Baseline / rollback reference: e319d4e060a335e698c6b67b51a479cc14e81232.

Implementation commits:

- da779540765a3079cc4feccebc046db38ba97451: geometry diagnostics, explicit measurement actions, quantity policy contract and 35 new geometry/action tests.
- b109d11fa227d59f5764a54e64a4c5b16d2f51cd: independent selected-output readiness and 24 new policy/readiness tests.

This record accompanies the documentation commit after those implementation commits.
Delivery target: verified main, ordinary commits/push. No force operations.
If rollback is assigned, use ordinary reverse-order reverts to restore the baseline;
no reset, database rollback or data migration is involved.

## Entry and preservation

Verified the existing product checkout and actual repository root,
origin https://github.com/armentrout1/ModernFloorPlanner.git, main tracking origin/main,
reviewed HEAD and initially clean working tree. Safe fetch at entry and before
committing found main unchanged at the baseline. The task inventory and repo-filtered
process checks showed no competing product writer; no index lock existed.
These are observable availability checks, not proof about every possible process.

Read AGENTS, ECOSYSTEM, My Way, the canonical roadmap, M1/M2A evidence, opening
documentation, issues #2/#3/#4 and existing domain/compatibility modules and tests.
Searched for M2B work before creating and claiming issue #5. The root task remained
the sole writer/release owner; two bounded reviews were read-only.

Preserved the named M1 stash and all archived/unpublished work. No stash was
reapplied, dropped or overwritten. The archived local roadmap still ends with the
exact original bytes; original SHA-256:
4aa44769a3af1cc8a4fe940b09e024109fea19630f61181772b42f7efdb7bcf1.
The unpublished PRODUCT_ROADMAP backup (22,321 bytes) and patch (26,568 bytes) remain.
No other checkout/worktree or product repository was used.

BUILD_ROADMAP.md remains the single canonical build sequence. This file records
M2B evidence and contracts; it is not another roadmap.

## Geometry validation

shared/domain/geometryValidation.ts exports validateGeometry(input).
Its geometry-v1 report separates structural validity, semantic checks and findings.
Each check has a stable code, valid/invalid/undetermined status, affected room,
wall and opening IDs, field paths, quantity scopes and measurement dependencies.
Finding categories distinguish invalid geometry, missing/unresolved data,
unconfirmed measurements and informational compatibility evidence.

The existing v2 schema checks known positive dimensions, nonnegative elevations,
finite offsets, references, unique IDs/attachments and supported wall ordering.
Malformed v2 receives STRUCTURAL_INVALID diagnostics instead of throwing or being
rewritten. Semantic reports never tighten the legacy adapter's acceptance:
an incomplete or out-of-bounds legacy sketch is still preserved and convertible.

For structurally valid documents:

- Horizontal fit uses center offset minus/plus half the known opening width.
  Top/bottom use room length; right/left use room width. Clockwise center offsets
  are already physical in v2 and are not inverted a second time.
- Vertical fit uses sill plus opening height against each attached room's ceiling.
  Explicit floor-level openings require known zero sill within numerical tolerance.
- One physical opening can have two explicit attachments to different rooms.
  Each face is checked independently. Same-room two-face relationships are invalid.
  Presentation position never proves or disproves room adjacency; links are not inferred.
- Overlap requires horizontal AND vertical intersection greater than 0.01 mm.
  Touching edges and intersections at or below tolerance are allowed. Missing required
  extents produce undetermined checks, even when the known axis looks separated.
  Vertically separated openings with shared horizontal range are not physical
  overlap; STACKED_PRESENTATION_LIMITATION separately describes the existing 2D UI.
- Resizing rechecks the same openings. No geometry is rounded, clamped, moved or deleted.
  Nonfinite derived extents cannot pass fit validation.

The shared 0.01 mm tolerance is numerical comparison only, not construction
clearance or measurement accuracy. Comparisons retain original endpoint magnitudes
with a small floating-point roundoff allowance. Regressions include exact edges,
0.009 / 0.010 / 0.011 mm overruns and overlaps at both ordinary and small coordinates.
Validation is deterministic and does not mutate input, candidates, metadata or
preserved original JSON. Returned scopes cannot change subsequent reports.

## Explicit quantity policy and selection

shared/quantities/policy.ts defines the supported policy version
**rectangular-flat-v1**. The strict request contains policy.version,
policy.openingMeasureBasis, policy.crownFullHeightGaps and selections.

Selection is explicit: room IDs for floor/flat ceiling, wall-face IDs for
gross/net wall area and trim, opening/face pairs for casing, and physical opening
IDs for inventory. Each output appears at most once; its selection can include
multiple distinct targets. Empty selection returns no outputs, never everything.
Invalid/duplicate IDs, wrong casing kinds, unattached faces, extra options and
malformed policy values return structured contract errors.

The fixed policy defines:

| Output | Policy |
| --- | --- |
| Floor / flat ceiling | Rectangular room area; no wall-opening deductions. |
| Gross wall | Selected wall-face length and room ceiling height. |
| Net wall | Deduct attached door/window/floor-level opening area per selected face. |
| Baseboard / base shoe | Selected floor run less union of known zero-sill interruption intervals, once per face. Elevated windows do not interrupt that run. |
| Crown | Selected top run; deduct only explicitly identified full-height gaps, once per face. |
| Opening inventory | Unique selected physical IDs, irrespective of number of attached faces; no dimensional dependency. |
| Door casing | Two jamb heights plus head width per selected door face. |
| Window casing | Two heights plus two widths per selected window face. |
| Waste | Explicit finite nonnegative decimal fraction per non-inventory output; 0.10 means 10%. M2C applies it once after net. No inventory waste. |

Nominal, clear, finished and rough opening bases are distinct; the caller explicitly
requests one. Unknown or mismatched opening bases prevent a sufficient opening-derived
numeric basis; no conversion or relabeling is performed. Inventory needs identity only.
Room dimensions follow the roadmap's interior finish-face rectangular model.

Unsupported or missing policy versions return UNSUPPORTED_POLICY_VERSION.
A null document quantityPolicyVersion permits explicit caller selection without
changing document/history; an incompatible non-null value returns
DOCUMENT_POLICY_VERSION_MISMATCH. Full-height gap pairs must be valid attachments
and are used only on selected crown faces.

These are policy and dependency definitions. No quantity aggregation, snapshot,
purchasing, price, financial total or waste-adjusted value is produced by M2B.

## Independent per-output completeness

shared/quantities/readiness.ts exports evaluateQuantityReadiness(document, request).
For each selected room/face/casing pair, and one unique inventory selection, it returns:

- numericBasis: sufficient/insufficient, exact measurement dependencies and findings.
- geometry: valid/invalid/undetermined, relevant checks and findings.
- confirmation: confirmed/provisional/unresolved/not-required, dependencies and findings.
- Selected IDs, opening bases, policy version and the unapplied waste fraction.

A structurally malformed document or invalid request returns an input error rather
than a readiness claim. Unknown measurements in a structurally valid document allow
partial evaluation by selected output. The accompanying full validation report can
contain unrelated findings; callers must use the selected output's own states.

| Output | Numeric dependencies | Relevant geometry / confirmation dependencies |
| --- | --- | --- |
| Floor / flat ceiling | Selected room length and width | Those dimensions only; ceiling height and wall openings do not block. |
| Gross wall | Selected wall axis and ceiling height | Those dimensions; missing opening height does not block. |
| Net wall | Wall axis, ceiling, attached opening widths/heights and matching bases | Selected-face horizontal/vertical fit, floor-level consistency, relationship and 2D overlap; required sill and neighbor extents must be known/confirmed. |
| Baseboard / base shoe | Wall axis; all attached sills for classification; widths/bases of zero-sill interruptions | Horizontal fit, floor-level consistency, shared relationship and floor-run interval overlap. Opening/ceiling heights are not dependencies. Unknown sill is never assumed elevated. |
| Crown | Wall axis; widths/heights/sills/ceiling and bases only for explicit full-height gaps | Explicit gaps must start at zero and reach this room ceiling within tolerance, and pass applicable selected-face checks. Ordinary openings do not block crown. |
| Door / window casing | Selected opening width, height and basis | Fit and overlap on that selected attachment; another attached room's independent ceiling does not block this face. |
| Inventory | Unique selected physical IDs | Supported attachment relationship; measurements/confirmation not required. |

Known unconfirmed measurements can supply a numeric basis while remaining provisional.
Needs-review values remain unresolved; a known value with needs-review provenance
also remains unresolved for confirmation. Invalid geometry can coexist with known,
confirmed dimensions. Missing required geometry remains undetermined. These are
measurement states, not authorization, customer readiness or publication approval.

Floor-run interval overlap is a separate width/sill check so missing vertical data
does not unnecessarily block trim. Overlapping floor interruptions are invalid
geometry; the policy still requires later deductions to use their union only once.
Shared openings provide one inventory identity while supplying separate selected
wall/casing faces. No links or identity deduplication are inferred from appearances.

## Explicit measurement actions and evidence

shared/domain/measurementActions.ts provides transitionMeasurement and
applyMeasurementAction. Inputs require an explicit action and ISO timestamp:

- confirm: only a known value can be confirmed.
- resolve-candidate: requires an explicit valid candidate index; keeps the chosen
  source provenance and resets confirmation to unconfirmed. No first-candidate default.
- correct: requires a known replacement carrying new manual/traced/device/inferred
  evidence. An imported replacement cannot pretend to be the original import.
  A correction always invalidates that field's confirmation, even at the same value.

Each transition returns detached before/after evidence, action, timestamp and optional
candidate index. Prior candidates and source evidence remain in the returned event;
a future revision/persistence caller must retain that event. This is not a persistent
audit service, authentication system or new document-history storage mechanism.

Document actions explicitly require v2, reuse the adapter's JSON preservation boundary,
edit only a detached target measurement and return recomputed geometry. Resizing does
not move openings or clear unrelated confirmations. Original compatibility JSON and
appearance/style/attachment data remain unchanged. Historical review warnings stay
informational after resolution; current readiness follows the current measurement,
not a permanent historical-warning block.

## Exact checks and results

Executed on Windows with Node **20.20.2**, npm **10.8.2**, TypeScript **5.6.3**,
Vite **5.4.14**, Playwright **1.55.1**. Used the existing Node installation via
process-local PATH; no global runtime switch, dependency update or project pin change.

| Executed command | Actual result |
| --- | --- |
| npm ci | Exit 0; 505 packages added, 506 audited; package/lockfile unchanged. |
| npm test | Exit 0; **120 passed**, zero failures/skips/cancellations; reported duration 575.78 ms. Original 61 retained plus 23 geometry, 12 action and 24 policy/readiness tests. |
| npm run check | Exit 0; TypeScript passes. |
| npm run build | Exit 0; 1766 modules; final Vite build 4.95 seconds. JS 485.62 kB / 147.57 gzip, CSS 65.45 kB / 11.63 gzip; Express bundle 14.6 kB. |
| npx playwright test --reporter=line | Exit 0; **19 passed in 53.4 seconds**, one worker, zero retries/skips. |
| git diff --check / staged checks | Exit 0; new files normalized, no remaining whitespace errors. |
| Preservation diff | No existing client/server, live schema/validator, adapter/domain scaffold, package/lockfile/runtime configuration or original unit/API/browser test changed. |

Q-001 explicitly uses a 12 ft by 10 ft room, 8 ft ceiling, 3 ft by 7 ft floor-level
door centered 2.5 ft from the top wall start, and a 4 ft by 3 ft window with 3 ft
sill centered 8 ft from that wall start. All relevant geometry and dependencies pass.
M2B does not calculate its totals; the complete 319 sq ft net-wall acceptance remains M2C.

The retained browser suite exercises real HTTP routes with disposable in-memory
storage bound to loopback. It covers all-wall placement/save/reload, cross-wall/room
dragging, resize, precise width/style/swing preservation, opening-before-room deletion,
undo, keyboard guards, failed saves/renames and draft/tooltip protection. It does
not test PostgreSQL persistence or a hosted deployment. The final frontend asset
hashes remain index-DcKGsZC0.js and index-CdkUquOC.css; M2B has no live imports.

An initial TypeScript check exposed Map/Set iteration incompatible with the existing
compiler target; Array.from fixed it without changing configuration. Read-only review
found small-coordinate tolerance roundoff and report-array aliasing; these were fixed
and covered by new regression tests before final verification. No existing test was
removed, weakened or skipped.

Warnings remain: stale Browserslist data, Playwright color-environment notices, and
the unchanged 28 dependency advisories (4 low / 10 moderate / 14 high / 0 critical).
The separately proposed hosting/runtime task owns scoped advisory/runtime review.

## Deployment, limits and next task

**NOT DEPLOYED.** The owner confirms no current hosting. Hosting, real PostgreSQL
binding/persistence, authentication and tenant isolation remain **NOT VERIFIED**.
No provisioning, database migration, production/customer data operation or onboarding
occurred; the unscoped API was not exposed for public access.

M2B is complete within the assigned pure-module boundary. The runtime remains
React/Vite, Express and PostgreSQL/Drizzle with legacy editor/save/API payloads.
No renderer replacement, UI redesign, Next.js move, runtime modernization, billing,
partner integration, supplier work or other repository change was made.

Remaining gates: M2C must implement immutable results/aggregation and its full Q-001
and browser/server parity acceptance; future persistence must retain measurement events.
M4 authorization/isolation and protected hosting readiness remain separate launch gates.
The existing 2D UI does not visualize stacked openings. No current M2B blocker remains.

**Next eligible task: M2C**, under a separate bounded assignment. It has not started.
Issue #5 records local producer completion and remains open for release tracking.
Issue #2 remains open/unreleased; issue #4 remains PROPOSED.
