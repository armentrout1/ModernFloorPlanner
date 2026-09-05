# Master Product Ecosystem Blueprint

Version: **1.0**  
Date: **2026-09-04**  
Status: **Owner-directed architecture and staged roadmap; not a claim that every capability is implemented.**  
Canonical home: `armentrout1/fixdonenow:docs/ecosystem/MASTER_PRODUCT_ECOSYSTEM_BLUEPRINT.md`.

## 1. North star

Build an ecosystem of independent products that can be used directly, sold independently, or incorporated into other software. FixDoneNow assembles those products into one service-provider business workspace. It is the first reference integration, not a privileged customer and not the permanent home of every engine.

A provider should be able to establish a digital presence, bring existing customers, win marketplace work, document a job, prepare a professional estimate, invoice, collect payment, and understand the books without re-entering everything into separate applications.

Each specialized product must remain useful without FixDoneNow. No product may require another product's private database, deployment, staff-only setup, or customer-specific code merely to serve an ordinary independent customer.

## 2. Product ownership

| Product | Owns | Consumes rather than duplicates |
| --- | --- | --- |
| FixDoneNow | Provider business identity and roles, Business Pages, marketplace, CRM, customers/contacts, properties, jobs, scheduling, communications, cross-product workflow and integration mappings | Financial editor/engine, photo editor/engine, drawing editor/engine |
| LedgerLine | Financial estimates and invoices, their authoritative totals and financial lifecycle, payment/accounting records, books, supported financial reports, financial UI, API/SDK/events | Field photo storage, geometry editing, marketplace and job execution |
| ProjectRoll / photo product | Media capture/storage, projects/sections, originals and derivatives, annotations, photo analysis, selected photo packages, photo/report composition, photo UI, API/SDK/events | Authoritative estimate pricing, receivables, accounting, job scheduling |
| Drawing/measurement product | Drawings, geometry, dimensions, measurement provenance, quantities/takeoffs, drawing versions and exports, editor UI, API/SDK/events | Accounting totals, financial document lifecycle, CRM |
| Future independent products | A declared bounded capability and its data, UI, contracts and lifecycle | Existing engines already owned elsewhere |
| Stripe | External payment services under the chosen integration model | Not an owned product or repository; no blueprint is written into Stripe |

ModernFloorPlanner is the currently identified drawing-repository candidate. Documentation placement does not certify it as the final product selection or authorize drawing implementation.

A company's corporate books are separate from books it hosts for customer businesses. ProjectRoll can use LedgerLine for its own business as a direct customer; that does not automatically give every ProjectRoll user a separate LedgerLine organization.

## 3. Four reusable interfaces per specialized product

The target interfaces are: standalone application; reusable/embedded UI; versioned API with SDK where useful; and signed events/webhooks. Availability is tracked separately for each interface.

An existing standalone UI is **not automatically an embeddable component**. Reuse the owner's existing screens/components and business services. The owner provides the integration surface: an authorized hosted flow, embedded module, or versioned UI package. Choose the smallest suitable option per capability. Do not promise an iframe, SSO, published package, or embed-session endpoint before it exists and has been tested.

LedgerLine's estimate and invoice UI must remain maintained in LedgerLine. FixDoneNow supplies job/customer context and receives results; it must not fork financial forms, totals, taxes, or invoice lifecycle logic. Apply the same principle to ProjectRoll's camera/viewer/report UI and the drawing editor.

A provider-owned reusable library is permitted when intentionally packaged and versioned by its owner. Copying private service internals or maintaining an independent fork in the consumer is not reuse. No direct cross-product SQL access.

## 4. Provider experience and release scope

The target journey is:

`Business -> Customer -> Property/site -> Job -> Photos/drawings -> Estimate -> Approval -> Invoice -> Payment -> Books`

Marketplace leads are optional. Providers may bring their own customers. Public marketplace approval and access to private business tools are separate product decisions. Existing marketplace privacy and publication rules are not silently removed.

The catalog includes business presence, CRM, jobs/tasks/appointments, field documentation, quick estimates, detailed proposals, photo-backed estimate reports, drawings/takeoffs, client approvals, invoicing, collection, expenses/payables, reports, teams, recurring work, and marketing. This is a staged catalog, not one release commitment.

Quick estimates, detailed estimates and photo-backed proposals are presentations of one authoritative financial estimate, not three pricing engines. FixDoneNow orchestrates the journey. LedgerLine owns the financial editor and estimate. ProjectRoll owns media selection/annotation and photo-report composition. The drawing product owns quantities and drawing outputs.

## 5. Data authority and identity

Use a stable business/organization identity, not a person's login, public slug, company name, or job ID, as the tenant mapping anchor. A business can have many members, clients and jobs. A member may have authorized roles in multiple businesses.

Each product owns its own tenant IDs. FixDoneNow stores explicit mappings to LedgerLine organizations, ProjectRoll workspaces/projects, drawing workspaces/designs, and provider accounts. Namespace mappings by integration identity and environment; never assume UUIDs or emails identify the same tenant across systems.

CRM identity and financial customer identity are linked but distinct: FixDoneNow owns contact/relationship workflow; LedgerLine owns billing records and issued financial snapshots. Define which editable fields are synchronized and in which direction. Do not use uncontrolled bidirectional overwrites.

Products authorize requests at their own boundary. The host checks business membership and operation permission, resolves a trusted mapping server-side, then calls a limited product interface. A platform credential is not proof that the signed-in human can access every customer business.

No automatic human membership in every downstream tenant. Explicit consent and verified ownership are required before linking an existing independently owned workspace. New managed provisioning and existing-owner linking are separate workflows.

Test/live separation must cover data and access, not merely key prefixes or UI labels. Document whether isolation uses separate tenants, environment-scoped records, or another enforced model; prove cross-environment denial before enabling consequential actions.

## 6. Embedded UI and security contract

Before integration, specify supported UI entry points; product and API version; trusted tenant/customer/job context; read/write permissions; host origin policy; authentication/session exchange; expiry; callbacks; errors; accessibility; and mobile behavior.

Long-lived platform secrets stay server-side. A browser may receive only a narrowly scoped, short-lived session/capability when the owning product implements that contract. Never pass broad API keys in query strings, localStorage, or client bundles. Do not share production databases or broad service-role credentials as a shortcut to SSO.

Define behavior for expired sessions, revoked access, unavailable services, retries, partially completed provisioning and logout. Preserve the host's unfinished work. Show unavailable or not-configured capabilities honestly rather than rendering controls that imply working integrations.

## 7. API, event and operational contracts

The producing product owns schemas, validation, state transitions and compatibility. The consuming product owns its adapter, mappings and workflow behavior. Agree examples and acceptance tests before parallel implementation.

For each required operation record its real route/interface, auth scope, input/output, errors, idempotency rule, environment semantics, rate/size constraints, and availability evidence. Names in examples are proposals unless matched to a released contract.

For events specify stable event ID, type/version, producer, environment, tenant/resource identity, occurrence time, minimal payload and correlation ID. Verify signatures and replay rules. Deduplicate deliveries, tolerate out-of-order events and recover missed events. Never assume exactly-once delivery. Persist enough operation state to retry safely after one product succeeds and another fails.

Use one authorized payment-ingestion/posting owner for each flow. A browser redirect is not payment confirmation. Distinguish customer collection, processor payout to a bank, and supplier/subcontractor payment execution. An accounting record does not itself move money. Stripe's charge/account configuration and live capabilities require a separate tested integration decision.

Keep telemetry tenant-scoped and redact credentials, private URLs and unnecessary customer details. One request/correlation reference should allow an operator to trace a workflow across products without exposing another tenant.

## 8. Photos, drawings, estimates and AI

Keep original photos in ProjectRoll and geometry in the drawing product. FixDoneNow stores authorized references, not a second media library or geometry database. Existing FixDoneNow intake/portfolio storage continues until an explicit migration plan is approved; do not delete it to enforce the target architecture prematurely.

Private field records, customer-visible proposal evidence and public marketing assets are separate visibility grants. Sharing an estimate must not expose all job photos. Preserve originals and record derived annotations separately.

A proposed photo-report composition contract accepts a versioned LedgerLine estimate snapshot plus selected ProjectRoll asset versions and drawing export references. ProjectRoll composes the photo report; LedgerLine remains the financial authority. Do not recompute totals in the report renderer. Freeze the issued proposal's source versions so later photo edits or pricing changes do not rewrite accepted work. This composition interface is a requirement, not an existing endpoint claim.

AI belongs with its domain: image analysis and media organization in ProjectRoll; geometry/quantity assistance in the drawing product; financial-estimate assistance and financial calculations in LedgerLine; cross-product conversation and job orchestration in FixDoneNow. A conversational request invokes authorized domain tools rather than copying their engines into the host.

Distinguish observed evidence, human-confirmed measurements, assumptions and suggestions. Show missing quantities and uncertain conditions. Use approved rates and explicit arithmetic. Require appropriate user confirmation before sending offers, publishing customer media, issuing invoices or moving money. Do not use customer content for training by default.

## 9. Capability dependency ledger

Every discovered cross-product need gets a stable requirement ID in `CAPABILITY_DEPENDENCIES.md`, a producing product, consumers, acceptance criteria, dependencies and evidence. The producing product references that ID in its own `PRODUCT_ROADMAP.md`.

Track independently: current source evidence; contract status; implementation status; integration-test status; deployment status. A document, mocked demo, source file or passing static assertion is not proof of a deployed workflow.

Lifecycle: proposed -> contract agreed -> producer implementing -> producer verified -> consumer integrated -> end-to-end verified -> released. A capability may be parked or blocked without stopping unrelated work. Only the exact missing capability blocks the dependent slice.

Discover in FixDoneNow -> record the need -> assign the owning product -> agree a contract -> schedule work -> test producer and consumer -> release compatible changes -> update evidence and mirrors. Never silently solve another product's gap inside FixDoneNow.

## 10. Parallel development and independent release

Use a coordinator plus one active writer per checkout. FixDoneNow owns the initial shared register, but that administrative location confers no runtime dependency or ownership over other businesses.

Each worker receives requirement IDs, one repository, verified local root and remote, branch/base SHA, allowed file scope, contract version, tests and stop conditions. Different products can build concurrently. Same-repository workers require separate worktrees/branches and an assigned integrator; no shared dirty directory and no silent contract edits.

Publish additive producer interfaces first; verify them; deploy the compatible consumer; enable the feature deliberately. Preserve old consumers during migrations. Record API/UI package versions and deployed commit evidence. A separate staging deployment is not a universal prerequisite, but test credentials are not proof that a production database is safe for synthetic writes.

The owner prefers incremental production-first delivery. This blueprint does not authorize arbitrary production mutations, destructive operations, live payments or exposure of secrets. Apply each repository's current release policy. LedgerLine's owner has deferred additional backup/timestamp release gates until three users; do not reintroduce that rejected gate, disable provider-managed backups, or extend that policy to other products by assumption. The definition of the three-user trigger must be recorded before it becomes relevant.

## 11. Delivery sequence

E0: distribute blueprint, record source baselines and capability gaps, resolve local folders, establish worker boundaries. Documentation only.

E1: agree the first FixDoneNow-to-LedgerLine estimate/invoice UI and API contract; define CRM/job context and downstream mapping. Reuse existing LedgerLine functionality. No general financial-platform rebuild.

E2: implement and prove the first customer/job -> estimate -> invoice -> confirmed payment/accounting slice. Start with supported non-live payment testing; release live collection only under its own verified provider configuration.

E3: activate the minimal ProjectRoll enterprise/UI interface and photo-backed report contract when authorized. Until then, retain requirements and honest placeholders rather than a duplicate implementation.

E4: activate the drawing product's tenant-safe editor/export/takeoff contract when authorized. Drawing implementation remains parked now.

E5: add richer teams, recurring work, job costing, marketing or other products through the same dependency process. Do not make the complete catalog a blocker to an initial useful release.

## 12. Blueprint governance and completion

The canonical master and dependency register live in FixDoneNow and are mirrored at the same paths in the other products. Change shared files through the coordinator; increment the blueprint version, record a canonical source commit and verify identical shared-file hashes when synchronizing. Product-specific roadmaps and private local paths are not identical mirrors. Synchronization is manual until an explicit automation task is built.

Each new product supplies a product ID, repository, verified workspace, bounded data ownership, standalone/customer model, interface availability, auth model, versioning, consumer need and acceptance tests. Do not add another engine without deciding who owns it.

E0 is complete only when documents are placed in repositories, local checkouts are verified or explicitly unresolved, dependencies have owners and acceptance tests, and workers can start without guessing paths or contracts. GitHub documentation commits alone do not prove local folders exist, runtime integration works, or production has changed.
