# MFP-M2C implementation and evidence

Date: 2026-09-06.
Requirement: DR-002 / [M2C issue #6](https://github.com/armentrout1/ModernFloorPlanner/issues/6).
Dependency: [M2B issue #5](https://github.com/armentrout1/ModernFloorPlanner/issues/5).
Status: **PRODUCER_VERIFIED locally; M2C complete as assigned; NOT DEPLOYED**.
The owner accepted M2B's local producer verification as sufficient entry.
M1/M2A/M2B remain NOT DEPLOYED; issue #2 remains open/unreleased.
Hosting/runtime issue #4 remains PROPOSED.

Baseline / rollback reference: 31fa76b8b6ecbb83b7ede8589feb0e6512d9366a.
Implementation commits:

- dc3f1b08af458f201ff894fb560b0d133def9427: shared engine/result contract, arithmetic guards, capped geometry comparison and 34 engine regressions.
- ff88359a6fe20fbba902ab843c253968efdb39d8: immutable snapshots, deterministic fingerprints, separate formatting and 16 snapshot tests.
- c197c18def0b409e37978c7086a8ad3ee6d001b7: actual-engine browser/Node parity harness and six browser tests.

This record accompanies the final documentation commit.
Ordinary main delivery; no force operations, history rewrite or database migration.
If rollback is assigned, use reverse-order ordinary reverts back to the baseline.

## Entry and preservation

Verified the existing product checkout, actual repository root, normalized origin
https://github.com/armentrout1/ModernFloorPlanner.git, main tracking origin/main,
reviewed HEAD, initially clean tree and retained M1 stash. Safe fetch found no
newer main. Task/process inventory showed no competing product writer and no
index lock. These are observable availability checks, not universal process proof.

Read AGENTS, ECOSYSTEM/My Way, the canonical roadmap, prior milestone evidence,
opening documentation, issues #2–#5 and existing physical/compatibility/readiness
contracts. Searched existing issues, then created and claimed #6 before edits.
The root task remained the sole checkout writer and release owner; bounded draft
work outside the checkout and read-only reviews supported it.

Preserved archived original roadmap bytes, the unpublished roadmap/patch and named
stash. None was reapplied, discarded or overwritten. No alternate clone/worktree or
other product repository was used. Removed the machine-specific checkout path from
MFP_M2B_RESULTS.md through an ordinary documentation edit, retaining its evidence
and release claims. Public reports use repository-relative references.
BUILD_ROADMAP.md remains the sole canonical build sequence.

## Versioned shared calculation contract

Versions:

- Physical document: existing schemaVersion 2.
- Policy: existing rectangular-flat-v1.
- Engine: rectangular-engine-v1.
- Result schema: quantity-result-v1.
- Snapshot schema: quantity-snapshot-v1.
- Fingerprint serialization: mfp-json-v1 with SHA-256.

calculateQuantities(document, request) in shared/quantities/engine.ts accepts
explicit v2 input and the existing strict quantity policy/selection contract.
It validates finite plain JSON, structural domain validity, request IDs/options and
M2B readiness itself; caller totals/readiness flags are never authoritative.
Legacy callers explicitly use the existing adapter first. No live API/save format changed.

The engine imports no React, DOM, database client, viewport/grid configuration,
clock, random-ID source or network client. Hashing and presentation are separate
adapters. Result objects contain source document/revision identity, explicit request,
units, target records, output aggregates, measurement evidence/readiness and trace.
A null revision remains explicitly unsaved; an identified revision is caller data,
not proof of PostgreSQL persistence.

All ten existing outputs are implemented:

| Output | Independent basis and policy |
| --- | --- |
| Floor / flat ceiling | Selected room length times width; no wall-opening deductions. |
| Gross walls | Selected wall-face length times ceiling height. |
| Net walls | The same independently derived gross face less union of eligible attached opening rectangles; no separate gross-output request needed. |
| Baseboard / base shoe | Selected floor run less union of known zero-sill interruption intervals. Elevated windows do not deduct. |
| Crown | Selected top run less only explicitly selected full-height gaps. |
| Door casing | Two heights plus head width per selected face. |
| Window casing | Two heights plus two widths per selected face. |
| Physical inventory | Unique explicitly selected opening IDs, with integer door/window/floor-level-opening counts; no waste. |

Amounts use mm, mm2 or integer counts. Outputs are never combined merely because
they share units. Nominal/clear/finished/rough basis stays explicit; mismatch and
unknown basis remain blocked where M2B requires a matching basis. Duplicate/invalid
selections are errors, and empty selected scope produces no records or aggregates.

## Explainable deductions and numerical limits

Each target keeps gross basis, raw opening contribution, effective contribution,
effective total deductions, net, waste fraction, allowance and adjusted amount.
Trace includes source IDs, physical measurement evidence, raw/effective bounds and
adjustments with explicit units. Original dimensions and offsets are never changed.

Only a row with sufficient numeric basis, valid relevant geometry and resolved
confirmation is calculated. For tolerance-accepted geometry, effective opening
bounds intersect the actual measured wall face/run. Interval union merges only true
touching/overlap; a positive gap is never bridged merely because it is under 0.01 mm.
Net-wall rectangle union sweeps x boundaries and unions vertical intervals in each
slab, so vertically separated openings remain separate coverage and tolerated
overlap is counted once.

Boundary intersection, coverage union and floating-point roundoff are distinguished
in trace. A known-invalid or undetermined M2B check remains intact and blocks the
row. There is no Math.max(0, total) fallback, silent opening shrink/move or readiness
relaxation.

Checked arithmetic verifies consumed magnitudes and results of multiplication,
addition, subtraction and waste arithmetic. Supported absolute magnitude is at most
Number.MAX_SAFE_INTEGER in canonical units (9,007,199,254,740,991), not a claim of
arbitrary-precision or exact decimal math. Overflow, nonzero multiplication
underflow, lost contributions and materially degraded coordinate spans produce
structured arithmetic errors and unavailable totals. Coordinate spans must preserve their measured extent within 1e-9 mm plus 16 machine epsilons times the extent. Material loss is ARITHMETIC_PRECISION_LOSS; completely absorbed nonzero add/subtract operands are also rejected. Ordinary 0.2/0.3 mm openings remain usable with signed roundoff evidence. Raw minus boundary, overlap and signed roundoff adjustments reconciles to effective deduction.

The arithmetic roundoff bound is distinct from M2B's 0.01 mm numerical geometry
tolerance and from any construction clearance or measurement accuracy claim.
Narrow M2B correction: geometryValidation.exceedsTolerance previously scaled its extra roundoff allowance without a cap, allowing an exact-span opening at a 1e15 mm coordinate to overrun or overlap by 0.5 mm while claiming valid geometry. The allowance is now capped at 1e-9 mm; the 0.01 mm geometry policy is unchanged. Two regressions require invalid findings for those cases. All original geometry/readiness tests still pass. This tightens large-coordinate validity; no readiness rule or policy was relaxed.

## Partial, provisional and waste semantics

Target records have complete, provisional or blocked status, independent M2B numeric,
geometry and confirmation details, exact affected IDs/paths, and measurement evidence.
Known unconfirmed values can yield provisional quantities. Unknown/conflicting values
and known measurements whose provenance still requires review remain blocked.
Blocked amounts are null, never a fabricated zero; diagnostic basis remains inspectable.

Each aggregate covers only one output and its compatible records. If any selected
row is blocked, the full total is unavailable. A partial subtotal can identify
included and excluded target IDs explicitly. subtotalStatus independently reports complete, provisional or unavailable for included rows. A blocked full total can therefore have a partial provisional subtotal; tests retain 256 sq ft with unknown window height and an unconfirmed room length.
When all included rows are calculable but any required measurement is unconfirmed,
the selected aggregate remains provisional. Empty scope is not a confirmed zero project.

Waste is an explicit finite nonnegative decimal fraction: 0.10 means 10%.
Each non-inventory row retains net, calculates allowance = net times fraction,
and adjusted = net plus allowance once. Aggregates sum row net/allowance/adjusted
values without applying waste again. No material coverage, cartons, paint coats,
cutting optimization, prices or financial totals were added.

shared/quantities/display.ts is a separate conversion/formatting boundary. The
caller supplies unit and 0–12 fractional digits; integer inventory uses count and
zero fractional digits. Formatting returns strings and labels, never changes engine
amounts, and is not fed back into arithmetic.

## Immutable snapshots and fingerprints

evaluateQuantities captures detached input before the first await, runs the same
engine, validates its result and adds deterministic hashes.
createQuantitySnapshot requires caller-supplied ID, ISO timestamp and explicit
evaluation/confirmed kind. It recalculates from captured input rather than accepting
a caller's result. Owned copies of source, result, fingerprints and supplied action
evidence are deeply frozen with readonly public types; caller objects remain mutable.
Later source edits, attempted result mutations and other calculations cannot alter
an earlier snapshot.

Confirmed snapshots require a nonempty complete selected result: valid relevant
geometry and confirmed required measurements, or explicitly not-required confirmation
such as inventory. Evaluation captures can retain partial/provisional/blocked/empty
states. Unrelated missing dimensions do not block confirmed selected floor work.
Confirmation is not authentication, issuance, publication, persistence or customer readiness.

Snapshots retain the full original v2 source, including existing compatibility JSON
and arbitrary preserved metadata, plus explicit target/event captures. Captured events
are validated by replaying the existing target-specific pure transition rules:
unknown confirmation, nonexistent candidates, inconsistent after-values and zero room
dimensions are rejected; valid zero-sill and correction evidence remain supported.
This checks internal consistency, not the identity or truthfulness of the caller.
Durable revision/event storage remains M4.

Fingerprint scopes are explicit:

| Fingerprint | Bound content |
| --- | --- |
| physical-geometry-v1 | Whole physical document's room/opening IDs, measurement states/values/candidate values, wall identities, attachment offsets and opening basis; includes unselected physical geometry. |
| calculation-content-v1 | Geometry projection, full physical measurement provenance/candidates/confirmation, validated request and complete deterministic calculation content including engine/policy/result versions and source identity. |
| captureFingerprint | Full captured source, events, evaluation and caller instance metadata. Computed before adding its own hash field. |

Geometry/content exclude names, viewport/presentation, arbitrary metadata, original
legacy JSON and historical review warnings when they do not affect the calculation.
Capture hashing separately binds that preserved evidence. Thus viewport changes can
change capture identity while leaving quantities and calculation fingerprints stable.
Candidate/provenance component order is meaningful and is never generically sorted.

mfp-json-v1 serializes finite acyclic plain JSON, sorts object keys by UTF-16 code units,
preserves array order, uses ECMAScript JSON number/string encoding and encodes -0 as 0.
It preserves own special keys such as __proto__ without prototype mutation, and rejects
accessors, exotic objects, sparse arrays, nonfinite values and depth beyond 100.
This is explicitly not a claim of RFC 8785 conformance. No locale, clock or random state
participates in calculation hashes. Fingerprints use supported platform Web Crypto
SHA-256 in a small adapter; no custom cryptographic implementation is used.

verifyQuantitySnapshot validates the schema and independently reconstructs calculation
and fingerprints from captured source. It rejects structural or integrity mismatches.
A hash is never an authorization credential, and schema validation alone is not proof
that a caller-supplied total is correct.

## Known-answer and browser/Node evidence

The existing Q-001 fixture retains explicit valid attachments:
12 ft by 10 ft room, 8 ft ceiling; 3 ft by 7 ft door at zero sill centered 2.5 ft
from the top wall start; 4 ft by 3 ft window at 3 ft sill centered 8 ft from that
same start; matching finished opening basis and explicit surfaces.

Both Node and the real browser independently assert these known answers before parity:

| Quantity | Verified expected result |
| --- | ---: |
| Floor / flat ceiling | 120 / 120 sq ft |
| Gross walls / raw opening deductions | 352 / 33 sq ft |
| Door / window deduction | 21 / 12 sq ft |
| Net walls | 319 sq ft |
| Perimeter basis | 44 ft |
| Baseboard / base shoe | 41 / 41 ft |
| Crown | 44 ft |
| Physical inventory | 1 door, 1 window |
| Door / window casing, one face | 17 / 14 ft |
| Floor at 0.10 waste | 132 sq ft |
| Top wall gross / net | 96 / 63 sq ft |
| Top wall baseboard | 9 ft |

Removing window height keeps floor 120 and gross walls 352 available; the selected
net-wall total is null/blocked, with an explicitly partial 256 sq ft subtotal from
the other three walls and the top wall excluded. Unconfirmed Q-001 variants retain
known quantities but remain provisional.

The browser proof compiles the actual shared modules through a test-only entry into
memory and serves it on loopback. It does not duplicate the calculation algorithm,
add a public calculation endpoint, change production routing, or place diagnostics
in the production bundle. Six added browser cases cover confirmed/provisional Q-001,
selected faces and independent net calculation, partial results, tolerance clipping,
viewport independence, and frozen snapshot/gate behavior.

Structured quantities use 1e-7 absolute canonical units or 1e-12 relative tolerance
in parity comparisons; statuses, contract values and SHA-256 fingerprints compare
exactly. Node known-answer tests additionally assert the independent fixture values,
and 30 deterministic generated examples check bounded net, monotone waste, reconciled
aggregates, equivalent physical units and selection-order invariance.
Confirmed Q-001 with allSelections and its explicit 0.10 floor/ceiling waste produced these exact browser/Node hashes:

- Geometry: ae93e2aa4d334a90da1da35e90285708b97eddb9de68e7b25c59cf86a01b162c.
- Content: 46eb957409a13fc27c455409a8180318cb9a1d5a5c47d0ac212d5f2fe9f90381.

These identify that exact ordered request/source fixture, not every physically equivalent provenance or array ordering.

## Exact checks and results

Windows runtime: Node 20.20.2, npm 10.8.2, TypeScript 5.6.3, Vite 5.4.14,
Playwright 1.55.1. Existing process-local runtime path only; no runtime pin change.

| Command / check | Actual result |
| --- | --- |
| npm ci | Exit 0; 505 packages added, 506 audited; package/lockfile unchanged. |
| npm test | Exit 0; **170/170 passed**, zero failed/skipped/cancelled; 1,126.8214 ms. Original 120 plus 34 engine and 16 snapshot cases. |
| npm run check | Exit 0; TypeScript passed with no diagnostics. |
| npm run build | Exit 0; Vite transformed 1,766 modules and built in 2.81 s; JS 485.62 kB, CSS 65.45 kB; Express bundle 14.6 kB. |
| npx playwright test --reporter=line | Exit 0; **25/25 passed** in 57.5 s; original 19 editor plus six real-engine parity cases; one worker, no retries. |
| git diff --check and staged/range checks | Exit 0; no whitespace errors in working, staged or baseline-to-delivery changes. |
| Preservation | All original 120 unit/API and 19 editor browser tests retained; live client/server, legacy schema/adapter, M2B readiness/policy and dependency/runtime files unchanged; geometry comparison has only the documented bounded correctness fix. |

The first combined run had 161/163 passing: a new generated fixture exceeded the
existing parser's decimal-precision contract, and a snapshot tamper assertion expected
an integrity error after stronger schema validation already rejected it. The generated
values now use an explicitly supported physical precision; tests cover both structural
tamper rejection and separate valid-shape source-integrity mismatch. No original test
was weakened, skipped or removed.

Read-only review also exposed material coordinate cancellation, mixed adjustment units
and internally impossible event captures. These were repaired and given regressions
before final verification. An isolated draft-only test harness had two setup failures (syntax/path resolution), then passed all 57 selected engine/geometry cases. The final integrated unit/type/build/browser checks all passed. No final check remains failing.

Warnings remain: stale Browserslist data, Playwright color-environment notices and the
unchanged 28 dependency advisories (4 low, 10 moderate, 14 high, zero critical).
Scoped dependency/runtime review belongs to the separately PROPOSED issue #4.

## Deployment, limitations and next eligible task

**NOT DEPLOYED.** The owner confirms no current hosting. Hosting, actual PostgreSQL
binding/persistence and authentication/tenant isolation remain NOT VERIFIED.
The existing editor acceptance harness uses real HTTP routes with disposable in-memory
storage, not production records. No provisioning, migrations, public unscoped API
exposure, customer onboarding or cross-repository operations occurred.

This delivers shared calculation and snapshot contracts, not M3 editor adoption or
M4 durable storage/security. The live editor still uses its supported legacy payloads
and calculator until its separately assigned integration work. No renderer replacement,
Next.js migration, 3D/AI, billing, partner, supplier or financial engine was added.
Large-plan performance and non-Chromium browser certification were not established.
Fingerprints provide deterministic content integrity, not trusted caller identity.

**M2C acceptance is complete locally. M3A quick-room entry is eligible for a separate bounded assignment and has not started.** No M2C implementation blocker remains. Hosting and M4 durable storage/access isolation remain later release gates.
Issue #2 remains open/unreleased; #4 remains PROPOSED. Earlier release-tracking
issues were not closed or described as deployed.
