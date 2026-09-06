# Modern Floor Planner — executable product and build roadmap

Version: 1.0 · 2026-09-06  
Repository: `armentrout1/ModernFloorPlanner` · delivery branch: `main` (reverify before release)  
Reviewed baseline: `876968e78d7070775e7924f33a3164ba20905d42`  
Status: **M1, M2A and M2B producer checks passed locally; NOT DEPLOYED. M2B issue #5 defines geometry validation, measurement actions and selected quantity policies. M2C is eligible for a separate assignment; M2C–M8 remain unstarted.**
First execution task: [MFP-M1 / issue #2](https://github.com/armentrout1/ModernFloorPlanner/issues/2).  
Evidence and dated external research: [research and audit](RESEARCH_AND_AUDIT_2026-09-06.md).

## 1. Product decision and document authority

Build a **quick room measurement and quantity tool with a synchronized sketch**. A user enters length, width and ceiling height, adds openings, chooses the work, and receives explainable quantities. A single useful room must not require drawing an entire building. Keep standalone use and partner use on the same product-owned engine and editor.

This roadmap implements the owner's September 6 direction. During the explicitly assigned M1 implementation, Codex read and reconciled the complete local `Modern-Floor-Planner-Complete-Roadmap.md` and the unpublished ecosystem roadmap. Both originals were preserved as local copies and the unpublished Git diff was retained in a named stash. The local output is now marked as an archived snapshot. This document remains the only active build roadmap. See [M1 evidence](MFP_M1_RESULTS.md) for the reconciliation and implementation status.

`AGENTS.md` and the v1.1 My Way workflow control repository operations. This file controls this product's build sequence; `docs/ecosystem/PRODUCT_ROADMAP.md` maps it to ecosystem capabilities. Existing feature documents describe historical intent, not current runtime certification. Do not maintain another independently updated build roadmap in an outputs folder.

The owner's bounded M2A and subsequent M2B assignments accepted the preceding task's local producer verification as sufficient entry evidence. [Issue #3](https://github.com/armentrout1/ModernFloorPlanner/issues/3) and then [issue #5](https://github.com/armentrout1/ModernFloorPlanner/issues/5) were claimed before their application writes. Issue #2 remains open and unreleased. M2C and later milestones require their own assignments. No deployment, charge or cross-repo change is authorized by this document.

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

Separate floor-plan length/width from `ceilingHeightMm`; the old `room.height` is a plan dimension, not a ceiling height. Viewport zoom, pan, CSS pixels, grid appearance and optional room placement are presentation state. They must never change quantities. A typed dimension must not snap to the old one-foot grid.

A rectangle has four stable wall-face IDs, a documented clockwise coordinate convention, and wall lengths derived from the rectangle. Opening offsets are physical distances from each wall's documented start, not screen percentages. Validate bounds, width, height, sill/elevation and overlap whenever a room or opening changes. Never silently remove or shrink an opening after a resize.

### A3 — Keep drawing state separate from editing gestures

Use a command/reducer boundary for add/update/delete/move operations and undo/redo. A drag is one committed command, not hundreds of history entries. Selection is one explicit target kind (room, opening, or multi-room set); a selected opening may reference its parent but must not cause the room-delete path to win. Ignore destructive shortcuts in editable controls, dialogs and repeated/handled keyboard events.

Keep the current drawing implementation during foundation repair. Add a physical-to-view adapter, then use a simple React/SVG view for quick-room previews and print geometry where appropriate. SVG view coordinates provide a scaling boundary [R6]; adopting a new canvas framework is not a prerequisite. Do not serialize a graphics scene as the canonical measurement document.

Use docked panels with content that shrinks to available width, a center area with `min-width: 0`, and an inspector drawer on narrow screens. Collapse/resize controls occupy a reserved header or handle, never cover dimensions or inputs. Arbitrary floating/repositionable sidebars are outside the initial release. Preserve useful existing opening interactions behind regression tests.

### A4 — One canonical geometry document with explicit revisions

Target document schema version: 2. Minimum model:

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

A quantity snapshot binds geometry revision/hash, engine version, policy version, units, selected scope, unrounded basis, display values, assumptions and completeness. Issued/exported snapshots are immutable. Subsequent edits create a new revision and new snapshot. Published estimate/report references must continue to resolve their original snapshot under the applicable authorization and retention rules.

### A7 — Product boundaries remain intact

Modern Floor Planner owns geometry, measurement logic, takeoffs, editor, versions and drawing exports. FixDoneNow owns the customer/job workflow and integration mappings. LedgerLine owns financial estimates, pricing/tax/totals and financial document lifecycle. ProjectRoll owns original media, annotations and photo-report composition. No cross-product database reads, copied drawing engine, duplicated estimate form or implied shared tenant IDs.

Standalone measurements and standard exports cannot require a FixDoneNow account or partner availability. Later product/material reference costs are advisory inputs, not an authoritative financial estimate. The shared blueprint remains unchanged by this product-specific plan.

## 3. Quantity rules: implement and test these, not labels alone

For a rectangular room measured inside finished faces, let L and W be plan dimensions, H the flat ceiling height, and P = 2(L + W). These are the proposed product policies, not a claim of compliance with a construction estimating standard.

| Output | Default definition | Important exclusions/qualifiers |
| --- | --- | --- |
| Floor area | L × W | Do not deduct doors/windows; explicitly selected floor voids/exclusions are separate. |
| Flat ceiling area | L × W | Do not deduct wall openings; ceiling voids are separate. |
| Gross wall area | Sum of selected wall-face length × height | All four walls by default; unknown required height makes affected output incomplete. |
| Net wall area | Gross selected wall area minus eligible opening areas on those faces | Opening width AND height required; show gross and deductions separately. |
| Baseboard/base shoe | Selected floor-level wall lengths minus union of eligible interruptions/exclusions | Subtract door openings once per affected face; normal elevated windows do not affect it. |
| Crown/ceiling perimeter | Selected top-of-wall lengths | Ordinary doors/windows do not deduct; full-height gaps require explicit policy. |
| Door/window count | Unique physical opening IDs in selected inventory scope | Face deductions are separate from physical purchasing counts. |
| Door casing | 2 × opening height + width per selected face | No sill by default; face count explicit. |
| Window casing | 2 × (height + width) per selected face | Four-side default; sill/apron and alternative trim policies explicit. |
| Waste-adjusted quantity | Net selected quantity × (1 + waste fraction) | Applied once, separately per work/material category. |
| Packs/boxes | Ceiling of adjusted quantity ÷ verified coverage per pack | M7; pool only compatible material/SKU/unit/lot and explicitly chosen grouping. |

Opening measure basis must identify nominal, clear, finished or rough opening. Do not pretend nominal door size equals exact field trim cuts. Initial casing quantities are geometric allowances; installation returns, joints and cutting waste remain explicit allowances.

Reject or flag invalid geometry instead of clamping an impossible result to zero and calling it valid. Two openings cannot overlap on the same face. An unknown window height allows floor totals but makes the affected net-wall result incomplete. Per-surface selection and partial completeness must propagate into exports and API responses. Consumer-ready estimating snapshots require confirmation of all dimensions on which selected outputs depend.

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

Sequence: **M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8**. M6 contract examples may be drafted earlier, but implementation does not bypass M4 security/versioning. Material research is not a reason to delay the basic room tool. M1 is tracked in issue #2, M2A in issue #3 and M2B in issue #5. Create or reuse one owner-repo issue when each next task is assigned, rather than duplicating status across trackers.

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

**M2B evidence:** [issue #5](https://github.com/armentrout1/ModernFloorPlanner/issues/5), [results and policy contract](MFP_M2B_RESULTS.md). Pure geometry-v1 validation, explicit timestamped confirmation/candidate/correction actions and rectangular-flat-v1 selected quantity policies are locally producer-verified. Numeric sufficiency, relevant geometry and confirmation are independent per output; unknowns and historical evidence remain explicit. Q-001 validation/readiness passes without calculating its M2C totals. All 120 unit/API and 19 browser cases pass; existing 61 unit/API cases, live editor/API payloads and preserved original JSON remain compatible. No deployment, database/runtime change or customer onboarding. M2C is eligible for a separately bounded assignment; it has not started.

**Touchpoints:** `shared/domain`, `shared/quantities`, compatibility adapters, selected property editors and tests. Keep old plans loadable; no live bulk conversion.

**Exit:** Q-001 passes; zoom does not change quantities; 32-inch and metric/fractional input stay precise; invalid and incomplete results remain explicit; linked physical opening counts and per-face deductions behave correctly; migration reruns do not duplicate or rescale data.

**Not included:** polygon editor, 3D, supplier quantities or authoritative financial totals.

### M3 — Deliver quick-room entry and usable sketch

**Entry:** M2 engine contract stable. M3A: room cards with length/width/ceiling height, names, presets and duplication with regenerated IDs. M3B: simple opening form (wall, offset, width, height, elevation), work/surface selection, live sketch and quantity breakdown. M3C: responsive docked layout, proper input focus, undo/redo and unobstructed controls.

**Touchpoints:** quick-room/editor features and existing panels; calculations only via the shared engine.

**Exit:** one room can be entered without drawing; dimensions, openings, sketch and totals agree immediately; duplication does not alias IDs; selecting one wall does not count all four; keyboard-only form use works; desktop/tablet/mobile checks show no hidden fields or overlaying controls. Browser regression checks cover placement on all walls and representative zooms.

**Pilot usability target (hypothesis):** after one explanation, at least 4 of 5 representative pilot users complete a basic room without assistance in under 2 minutes. Measure it; do not state it as achieved.

**Not included:** freely floating sidebars, furniture, scans or full-building layout constraints. Limited owner testing is not a public multi-tenant launch.

### M4 — Make standalone use safe and dependable

**Entry:** M1–M3; deployment binding verified; actual identity provider decision recorded. M4A: authentication, workspace/membership authorization and denied-access tests. M4B: explicit legacy ownership review, additive storage migrations, revisions, autosave/idempotency/conflicts and local recovery. M4C: project list, rename/duplicate/archive/restore; PDF/CSV and accessible print view from the same snapshot.

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

**Entry:** reliable quantities and pilot demand. Add coverage/coats, material-specific waste, pack/stock lengths, grouping rules and saved material presets. Persist each calculation's coverage source/unit/date and waste/rounding policy. Sum compatible quantities before pack round-up; do not merge incompatible flooring products/rooms blindly. Simple linear-foot trim plus allowance is not optimized cutting stock. Paint coverage/coats and flooring box calculations remain separate policies.

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

At publication: remote source/doc review and official-documentation research completed; issue #2 prepared. No application implementation, package installation, typecheck, build, full test suite, live security test, deployment verification or production data modification was performed by this review. Shell cloning was unavailable in the review environment, so source access used the connected GitHub interface; this does not prevent Codex from testing its verified existing checkout.

M1 entry resolved local document preservation and observable writer checks; M2A and M2B reverified the existing checkout, archived original and retained stash. The owner confirms the app is not hosted yet. Remaining unresolved facts: first hosting/database/identity configuration; saved-plan inventory/ownership; pilot demand and operating costs. These are explicit discovery/release gates, not reasons to rebuild the stack or abandon the plan.

Current state: M2A producer implementation is recorded under [issue #3](https://github.com/armentrout1/ModernFloorPlanner/issues/3); M2B producer implementation and checks are recorded under [issue #5](https://github.com/armentrout1/ModernFloorPlanner/issues/5). Both are complete locally and NOT DEPLOYED. M1 issue #2 remains open and explicitly unreleased. Next eligible build task: M2C immutable quantity results, pure aggregation and fixture/property/browser-server parity checks, on a separate bounded assignment. M2C has not started.

Separate operational proposal: [hosting/runtime readiness, issue #4](https://github.com/armentrout1/ModernFloorPlanner/issues/4), status **PROPOSED**, not started. It covers Node 24 LTS compatibility/project pins and complete regressions, scoped dependency advisory review, Vercel frontend/Express/static/API/deep-link configuration, PostgreSQL selection and real persistence, server-only credentials/connection management, and protected owner-only early access. Verify current official documentation when activated. No public unscoped API or customer onboarding before M4 isolation. M2A and M2B do not change runtime pins, provision services, spend money or deploy.
