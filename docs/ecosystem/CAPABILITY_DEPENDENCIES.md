# Ecosystem capability dependency ledger

Blueprint version: 1.0. Canonical copy: `armentrout1/fixdonenow:docs/ecosystem/CAPABILITY_DEPENDENCIES.md`.

This is the initial contract backlog, not a list of completed integrations. Source evidence below comes from the September 4, 2026 audit. No implementation is authorized just because an item appears here. Photo and drawing feature work remains parked.

| ID | Producer -> consumer | Requirement and acceptance | Current evidence / next state |
| --- | --- | --- | --- |
| ECO-001 | Coordinator -> all | Register exact GitHub identity, local checkout/worktree, branch and writer. Preserve duplicate checkouts and stashes. | GitHub identities known; local verification pending. |
| FDN-001 | FixDoneNow -> provider | CRM/customer/property/job workspace usable with provider's own customers, not just marketplace leads. | Marketplace/business workspace source exists; full private business workflow not established. Proposed. |
| FDN-002 | FixDoneNow -> all adapters | Business-scoped, environment-aware mappings with recoverable provisioning state; no user-ID-as-tenant shortcut. | Proposed. Test retries after downstream success/local failure and cross-business denial. |
| LL-001 | LedgerLine -> FixDoneNow/others | Reuse existing estimate/invoice UI through one supported integration interface; preserve standalone screens and financial calculations. | Standalone UI exists by owner/source audit; portable embed/package contract unverified. Contract audit next, not UI rebuild. |
| LL-002 | LedgerLine -> FixDoneNow | Managed organization create/find and customer/estimate/invoice operations, including conversion, under authorized effective organization. | Documented public routes exist; consumer integration still needed. Prove A/B isolation, direct-customer compatibility and retry safety. |
| LL-003 | LedgerLine -> FixDoneNow/ProjectRoll | Versioned estimate/invoice snapshot or supported read contract for photo-backed proposals, without another pricing authority. | Basic financial/document interfaces documented; exact immutable report-snapshot contract to agree. |
| LL-004 | LedgerLine -> FixDoneNow | Confirmed payment/accounting status, supported report views and actual active event delivery. | Source registry marks invoice.posted, invoice.paid, invoice.partially_paid, payment.posted and webhook.test active; live consumer receipt unverified. |
| PR-001 | ProjectRoll -> FixDoneNow/others | Direct and platform customer models with authorized workspace/project creation or linking, tenant isolation, separate human membership. | Standalone workspace model exists; enterprise API/consent contract to specify. Parked. |
| PR-002 | ProjectRoll -> FixDoneNow | Reusable capture/viewer/annotation/photo-selector interface using original ProjectRoll code; scoped sessions and private asset references. | Standalone photo features documented; embed/API surface unverified. Parked. |
| PR-003 | ProjectRoll -> FixDoneNow/LedgerLine flow | Create a selected versioned photo package and compose a customer-approved report from photos, drawing outputs and an authoritative financial snapshot. | Saved photo packages/report UI exist; financial composition and stable export contract not established. Parked; depends LL-003. |
| PR-004 | ProjectRoll -> consumers | Supported media/package change events or an explicit initial read/polling contract, with permission revocation. | Developer APIs/webhooks remain a future lane in reviewed roadmap. Parked. |
| PR-005 | ProjectRoll -> estimating workflow | Photo analysis yields source-linked observations, unknowns and suggestions, never invented measured quantities. | Proposed/parked. Financial calculations remain LedgerLine-owned. |
| DR-001 | Drawing product -> consumers | Own tenant-scoped storage, permissions and standalone/enterprise model; no global plan-by-ID exposure. | ModernFloorPlanner candidate's reviewed methods do not establish tenant scope. Confirm candidate before code work; parked. |
| DR-002 | Drawing product -> FixDoneNow/ProjectRoll | Reuse editor plus versioned drawing/quantity/export contract: units, geometry version, method, confirmed dimensions and source links. | Drawing/calculation features documented; integration/export contract unverified. Parked; depends DR-001. |
| FDN-003 | FixDoneNow -> consumers | Cross-product orchestration and AI tool registry; invoke owning engines, handle partial failures, show actual capability availability. | Proposed. Depends on each activated producer contract, not on all future modules. |
| PAY-001 | Chosen payment adapter -> Stripe/LedgerLine/FDN | Agree connected-account ownership, charge model, webhook ingestion owner, mapping, event deduplication and posting authority. Distinguish collection, payouts and bill pay. | Stripe is external. Live Connect collection was not established by the audit. Contract decision before implementation. |
| ECO-002 | Coordinator + product workers -> release | Producer/consumer contract tests plus a normal two-business end-to-end journey; publish actual versions/SHAs. | Proposed for new integrations; existing LedgerLine qualification is not proof of the full ecosystem. |

## First dependency chain

ECO-001 -> FDN-001/FDN-002 and LL-001 contract audit in parallel -> LL-002 integration -> LL-004/PAY-001 testing -> ECO-002. Photo/drawing needs are recorded now; they are not prerequisites to starting the financial integration contract.

When activated: PR-001 -> PR-002 -> LL-003 + PR-003; DR-001 -> DR-002 -> optional PR-003 enrichment. A product's unimplemented capability must not be represented as already available in the consumer.

## Required detail before implementation

Expand an activated row with: requestor and use case; producing repository/owner; consuming repositories; precise input/output examples; real interface names; auth/tenant/environment scope; consent and secret handling; idempotency and concurrency; event names/status; errors/recovery; required data migrations; interface version; producer and consumer acceptance commands; compatible release order; owner approvals for consequential actions.

Attach issue/PR references when created. Do not invent issue numbers. Maintain separate fields for contract agreed, producer implemented, consumer integrated, end-to-end verified and deployed. Include commit/deployment evidence and timestamps. A mock may unblock parallel development but cannot satisfy end-to-end acceptance.

## Examples of new requests

A host request to select eight photos and annotate them belongs to PR-002/PR-003, not a new FixDoneNow photo engine. A request to compute room quantities belongs to DR-002, not a new financial calculator. A request to convert an accepted estimate belongs to LL-002; reuse the actual conversion contract before asking for a new API. A request to choose the next job follow-up belongs to FixDoneNow.

## Initial source basis

- FixDoneNow `20081ae532e47e8eb341e6a8d8a849c3fb2c829a`: contractor dashboard, onboarding actions, organization schema and prior service-provider audit.
- LedgerLine `62f9fe84cf725a3cdcfd94c36353226bad5a641f`: `docs/2026-09-04-PLATFORM_ENTERPRISE_PHASE_4_PUBLIC_API_ROUTE_MATRIX.md`, `lib/public-webhook-events.ts` and completed release report supplied by the owner. This register is not a new production certification.
- ProjectRoll `523b12463ec091c10c6634875b43433ee46862c4`: `docs/version-and-release-plan.md` and saved-package/report surfaces.
- ModernFloorPlanner `5b1a92f5cc5972a2f23fa300395b283fc577847d`: `MODERN_FLOOR_PLAN.md`, `server/routes.ts`, `server/storage.ts`. Candidate identity remains provisional.

The shared register supersedes the earlier proposal to put drawing persistence behind FixDoneNow: the independent drawing product must own its persistence and authorization; FixDoneNow supplies authorized mappings and job references.
