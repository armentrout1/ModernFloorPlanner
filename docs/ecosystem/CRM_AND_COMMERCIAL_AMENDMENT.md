# CRM and commercial amendment

Package: **v1.2**, September 8, 2026. Canonical source: `armentrout1/fixdonenow`, this path. Shared mirror text; product-specific execution state belongs in each product's roadmap and issues.

## Authority and authorization

This package consists of master architecture v1.0, My Way operating amendment v1.1, and this bounded amendment. My Way still controls repository operations. This amendment controls the clarified CRM/customer boundary and distinguishes accepted direction from commercial proposals. It does not cancel completed work or activate every future feature. A documentation request authorizes documentation, not billing, migrations, customer provisioning, email sends or live collection.

The owner accepted FixDoneNow CRM ownership and requested consolidation of the discussion into the existing blueprints. Basic customer management is the accepted free-product target. The broader Free/Pro package is recorded for planning; **$39/month, usage allowances, trial duration, payment markup, lead-routing changes and inter-product fees are not approved live terms**. Exact decisions live in the canonical [provider workspace blueprint](https://github.com/armentrout1/fixdonenow/blob/main/docs/provider-workspace-blueprint.md). Do not copy proposed numbers into production settings or consumer-facing promises.

For document precedence and conflicts, use the canonical [reconciliation index](https://github.com/armentrout1/fixdonenow/blob/main/docs/roadmap-authority-and-reconciliation.md). Product-specific roadmaps continue to control their standalone milestones. Later specific owner assignments supersede earlier blanket parked wording only within their named scope. Requirements, producer implementation, deployment and consumer verification are separate facts.

## One customer relationship, separate domain authorities

| Domain | Owner | Consumer behavior |
| --- | --- | --- |
| Provider business identity, membership, CRM customers/contacts, service properties, jobs, notes, appointments, operational history and communications | FixDoneNow | Start and return to the correct private customer/job workspace. |
| Billing customer identity, estimates, invoices, authoritative totals/status, payment/accounting records, books and financial UI | LedgerLine | Link explicit tenant/customer/document IDs; display authoritative results rather than calculate a second financial truth. |
| Original media, derivatives, annotations, media organization, selected packages and photo reports | ProjectRoll | Store authorized references and invoke producer-owned UI/contracts. |
| Drawings, dimensions/provenance, quantities, geometry versions and exports | ModernFloorPlanner / drawing product | Store authorized versioned references; distinguish measurements from material purchasing recipes. |
| Subscription to the FixDoneNow bundle, approved bundle entitlements and host usage presentation | FixDoneNow | Downstream products enforce their own authorization, supported entitlements and usage contracts. |

Each specialist remains an independent product. The FixDoneNow subscription does not transfer product ownership or provide unrestricted access to another product. LedgerLine retains a financial customer directory for independent customers; this is not a duplicate operational CRM.

## CRM is not a global shared customer database

Separate: a platform customer/requester; a provider-owned CRM customer; a public Business Page; and a downstream financial customer. A person may exist in several providers' private CRMs. Equal email, phone or address never grants cross-business access or automatically merges records. A CRM customer does not need a login.

The target relationship is business -> customer -> property/site -> job -> domain references. Billing contact and service contact may differ; one customer can have several sites and jobs. Persist stable business-scoped IDs; never use names, public slugs, first-row matches or a person's login as the integration tenant anchor.

Manual, referral, repeat-customer and provider-owned intake records belong to the selected provider business. Marketplace requests remain platform fulfillment records. Import/link them into a provider CRM only after existing disclosure/connection policy authorizes the specific fields for that business. Membership or a paid plan is not a contact-release permission. Do not bulk-copy platform submissions into all providers' CRMs.

Basic contact details, notes, existing relationship history, simple job status and manual follow-up tasks belong in the free CRM target. Paid candidates are extra users, advanced automation, custom pipelines and higher tool capacity; do not sell access back to previously stored customer history. Customer-facing accounts/portal access are a separate future capability, not a prerequisite for creating a CRM record or posting a public request.

## Integration and information flow

FixDoneNow maps its business/customer/job IDs to each producer's own tenant/resource IDs, namespaced by integration and environment. Provision on actual authorized use; do not automatically create full downstream subscriptions or tenants for every marketplace prospect.

CRM contact edits may populate supported draft billing fields through an explicit field-level contract. They must not rewrite issued financial snapshots. LedgerLine provides document/balance status to a read model with source identity and freshness; a job marked completed does not imply paid, and a browser callback is not payment confirmation. Private notes do not become invoice text without deliberate inclusion.

Retry-safe provisioning, deduplicated events, version/concurrency checks, revoked-member denial and recovery after partial success are required. Products enforce authorization at their own boundary. A subscription entitlement never substitutes for business membership or customer-disclosure authority. Linking an existing independent workspace requires the owner's supported consent flow; no unilateral linking by ID or email.

Private job media, customer-visible evidence and public portfolio photos are separate grants. No automatic publication when attaching a photo or drawing to a CRM job. Preserve originals, prior financial records and existing supported sharing behavior.

## Recipient-aware lead communication

Two email treatments describe recipient lifecycle, not paid versus unpaid leads: prospect recruitment and existing-member job alerts. Separately track request origin (marketplace, selected provider, partner/managed source, referral/manual) and disclosure mode. Never assume membership removes a managed lead's privacy gate.

Keep job details and the job-response action first. A compact reusable benefits card follows for prospects; members should not repeatedly receive a signup pitch. No popup or forced marketing detour. Preserve job context through optional details, authentication, signup and return; do not conflate viewing a page with expressing interest. Existing safe token, suppression, sender and approval controls remain.

Only advertise a feature after the consumer workflow and free allowance are actually released and approved. Use plain terms: Your business page; Customers; Job photos and notes; Estimates and invoices; Room sketches and quantities. Full material lists, bookkeeping automation and payment collection need their own proved capabilities. Never imply guaranteed work, exclusivity, verification or search ranking without supporting evidence. State starter limits and processing-fee qualifications clearly.

## Commercial boundaries

The planning model keeps business presence and genuine local opportunities free and funds useful business tools through an optional subscription. Free is not synonymous with unlimited storage, AI, SMS or human service. Exact allowances and cost allocation require a commercial decision before launch.

FixDoneNow should be the single payer-facing bundle subscription; specialist products receive defined sponsored entitlements under agreed commercial contracts. A partner allowance does not silently change standalone pricing, reduce an existing paid workspace or double-charge overlapping access. Differentiate resource owner, paying party and authorized members.

Version the offer and usage rules. Drafts, revisions, retries and estimate-to-invoice conversion for the same covered job should not count as repeated new-job charges. Limits on new usage must not prevent payment of an existing invoice or erase financial/customer history. Define storage accounting, grace, export, retention and integration-exit behavior before publishing capacity promises. Never promise indefinite free media retention without an approved policy.

## Existing progress is preserved

LL-001 has a documented hosted draft-estimate handoff in LedgerLine at `412ec8665695e004426b5325bb46a0d0d850acb6`; producer release is reported in LedgerLine #51 and FixDoneNow #4. Consumer integration and authenticated cross-app acceptance remain pending. This handoff does not provide invoice editing, posting, customer delivery or payment collection.

ProjectRoll has separately authorized standalone security work. Its current `docs/build-roadmap.md` and issues control that work; the historical blanket photo freeze must not reset completed fixes. Partner UI/API and bundle readiness remain separately gated.

ModernFloorPlanner has separately authorized physical-model/editor milestones. Its `docs/BUILD_ROADMAP.md` remains the sole standalone build sequence. Local quantity/editor checks do not establish hosted persistence, tenant isolation, FixDoneNow integration or full purchasing material lists. Do not restart M1/M2 or force a framework rewrite.

## Completion rule

This amendment is complete as documentation when its canonical text, consumer specification, roadmap references, dependency evidence and actual mirror publication state are recorded. Application milestones remain open until their own acceptance passes. Remote publication is not local synchronization; no worker, watcher or future delivery is launched by these documents.
