# Ecosystem capability dependency ledger

Active package: **v1.2**, September 8, 2026. Canonical copy: `armentrout1/fixdonenow`, this path. Read [the CRM/commercial amendment](CRM_AND_COMMERCIAL_AMENDMENT.md) and [My Way](MY_WAY_WORKFLOW.md).

This is a capability/evidence register, not a second execution queue. Existing IDs are preserved. Producer implementation, deployed state and originating-consumer acceptance are tracked separately. The September 8 review used repository documents/issues, not a fresh live application audit. Historical source baselines remain evidence for their dates only.

| ID | Producer -> consumer | Required capability / acceptance | Evidence and next state |
| --- | --- | --- | --- |
| ECO-001 | Coordinator -> all | Verify repo identity, local root/branch/HEAD/dirty state and writer before application work; preserve stashes and drafts. | Remote docs review does not verify local checkouts. Existing local reports are dated evidence, not blanket permission. |
| FDN-001 | FixDoneNow -> provider | Free private customers/contacts, sites, jobs, notes/history and simple follow-up; usable with the provider's own customers. | Approved target. Existing [FDN #4](https://github.com/armentrout1/fixdonenow/issues/4) owns the first bounded CRM/job slice. Full private workflow not established by this review. |
| FDN-002 | FixDoneNow -> domain adapters | Business/environment-aware resource mappings, authorized field transfer, recoverable provisioning, replay-safe external IDs. | Same FDN #4; needs consumer implementation. Do not create a duplicate integration task. |
| LL-001 | LedgerLine -> FixDoneNow/others | Producer-owned financial UI handoff; no fork in the host. | [LL #51](https://github.com/armentrout1/ledgerline/issues/51): hosted draft-estimate editor implemented at `412ec8665695e004426b5325bb46a0d0d850acb6`, producer production release reported. [Actual contract](https://github.com/armentrout1/ledgerline/blob/412ec8665695e004426b5325bb46a0d0d850acb6/docs/estimate-handoff-api.md). Consumer acceptance pending. Broader invoice UI/collection is NOT covered by this handoff. |
| LL-002 | LedgerLine -> FixDoneNow | Authorized managed-org/customer/draft-estimate and supported invoice/conversion API use; stable identity and A/B isolation. | Existing public contract documented. First consumer uses server APIs plus LL-001; arbitrary existing-org consent linking remains separate. |
| LL-003 | LedgerLine -> FixDoneNow/ProjectRoll | Versioned authoritative financial snapshot for selected photo-backed proposals; no recomputed totals. | Exact immutable report-composition contract remains proposed. Do not infer it from a printable page. |
| LL-004 | LedgerLine -> FixDoneNow | Confirmed payment/document status and supported reports/events, correctly attributed and repeat-safe. | Active event names were recorded in the September 4 audit; actual current emission and consumer receipt must be verified for the chosen flow. No fresh live evidence here. |
| PR-001 | ProjectRoll -> FixDoneNow/others | Separate standalone, owner-linked and partner-sponsored workspaces; consent, tenant authority and recoverable provisioning. | Planned Phase 4 in ProjectRoll's local roadmap; depends on its trust/core/identity/usage gates. Standalone security progress does not complete partner provisioning. |
| PR-002 | ProjectRoll -> FixDoneNow | Reuse capture/viewer/annotation/selection UI via supported scoped interface; no duplicate photo engine. | Partner UI/API not established. Product-local authorized security work continues under its own issues; this consumer feature is not activated here. |
| PR-003 | ProjectRoll -> estimating workflow | Versioned selected-media output with financial snapshots and drawing references; explicit publication grants. | Planned; depends on PR-001/002 and LL-003. Stored immutable composition is distinct from browser print. |
| PR-004 | ProjectRoll -> consumers | Defined events or explicit read/polling contract with scoped access, retry and revocation. | Partner delivery remains planned; verify actual contract before using an event name. |
| PR-005 | ProjectRoll -> estimating workflow | Source-linked photo observations, unknowns and suggestions; no invented measured dimensions. | Future separately assigned capability; AI spend and consent not bundled by this document. |
| DR-001 | Drawing product -> consumers | Independent tenant-safe persistence/auth, standalone roles and explicit partner authority. | ModernFloorPlanner roadmap M4 standalone/M6 integration gates remain; local editor progress is not hosted tenant-isolation proof. |
| DR-002 | Drawing product -> FixDoneNow/ProjectRoll | Product-owned editor and versioned quantities/exports with units, provenance, source revision and readiness. | September 8 M3B Slice 1 is locally producer-verified per local roadmap/#10; NOT DEPLOYED in reviewed evidence. M4 exports/M6 handoff remain later. M7 owns purchasing recipes; do not advertise full material lists from M3 quantities. |
| FDN-003 | FixDoneNow -> provider | Coherent cross-product navigation, capability-aware presentation and recovery; AI invokes owning engines. | Proposed per activated interface, not a requirement to build every module before useful CRM/estimate work. |
| PAY-001 | Payment adapter -> LedgerLine/FDN | Decide processor account/charge model, collection authority, ingestion owner, verified events and fee disclosures. | Unresolved for this bundle. An estimate handoff or accounting payment record is not proof of online collection. Separate approval for live money movement. |
| ECO-002 | Producer + consumer owners | Compatible contract tests and real two-business end-to-end journey; scoped versions/deployments and exit/revocation evidence. | Open for first ecosystem integration. Never close on documentation, static assertions or mocks alone. |
| ECO-003 | Coordinator -> all | My Way routing instructions and issue handoff practice; no duplicate queues or automatic worker claims. | Instructions exist. A real authorized handoff's evidence remains separate from documentation publication. |
| FDN-004 | FixDoneNow -> prospects/members | Recipient-aware job email, reusable truth-checked benefits card, context-preserving return and separate recruitment/response metrics. | New planning requirement. No email/template/sender or routing changes authorized by this documentation. Reuse existing sender and suppression behavior. |
| FDN-005 | FixDoneNow -> provider/producer adapters | Versioned Free/Pro entitlements, usage/limit display, subscription lifecycle and non-destructive downgrade. | Proposed. Block price creation/enforcement behind approved commercial decisions and producer contracts. Basic CRM history is not an upgrade gate. |
| ECO-004 | FixDoneNow + specialist owners | Agree sponsored allowances, payer/owner distinction, authoritative usage, support, revocation/exit and inter-product cost allocation. | New commercial contract requirement. Neither a free downstream subscription for every signup nor an arbitrary revenue split is approved. Align ProjectRoll PR-BILL-001 and drawing M5/M6 rather than replace them. |

## First dependency chain

Verify the task's workspace/writer -> FDN-001 minimal private customer/site/job -> FDN-002 mappings + the existing LL-001/LL-002 draft-estimate contract -> scoped consumer edit/return/readback -> ECO-002 acceptance of that bounded slice.

CRM does not need to wait for photos, drawing, Pro pricing or live payments. The draft-estimate handoff does not wait for invoice posting or PAY-001. Supported invoice/status/collection flows follow only through their own authorized extensions and evidence. Keep FDN #4 and LL #51 open until their applicable consumer acceptance is established.

FDN-004 can be a separate small copy/UX assignment once advertised features and offer terms are approved; it must not alter fulfillment policy implicitly. FDN-005 depends on ECO-004 and the commercial decision register, not merely on displaying a pricing card.

When separately activated: ProjectRoll local trust/core/identity/usage prerequisites -> PR-001/002 -> LL-003 + PR-003; drawing M4/M5/M6 -> DR-001/002 -> optional PR-003 enrichment. Do not duplicate their standalone backlogs here.

## Required contract fields before a build

Record owner issue, authorized scope, actual interface/version, trusted tenant/customer/job context, per-field disclosure and sync direction, membership and consent, environment, idempotency/concurrency, event names with availability, errors/recovery, migrations if required, tests, compatible release order and stop conditions. Unknown capability availability stays unknown.

For commercial use also record paying party, owned resources, entitlement version, meter unit and period, retries/reservations, sponsored versus standalone access, limits/grace, export/retention, provider charges and budget. No activation of a paid third-party service from a planning row.

## Dated evidence

- FixDoneNow review baseline `554603b096858ff4dce5b5a8a4fd0f0773a4373d`; existing issue #4 and producer-release comment reviewed. Older marketplace source baseline was `20081ae532e47e8eb341e6a8d8a849c3fb2c829a`.
- LedgerLine `412ec8665695e004426b5325bb46a0d0d850acb6`; hosted-estimate contract and LL #51 release comment. Earlier platform qualification `62f9fe84cf725a3cdcfd94c36353226bad5a641f` remains historical evidence; do not restart that program from its old open issue headings.
- ProjectRoll `16263c0df3228e6e30ac9a3e0a85d442c1cf8675`; current `docs/build-roadmap.md`. Issue #13 was WORKING during review; #9/#10 logging acceptance and #2 device acceptance remained open. This is a snapshot, not a new assignment or a fresh test.
- ModernFloorPlanner `d771406acbf65290b10bb538cdad2fe86e0d00b4`; `docs/BUILD_ROADMAP.md` and #10. M3B Slice 1 complete locally, Slice 2 next eligible/unstarted; hosting #4 proposed. Existing local work must not be overwritten.

The independent drawing product owns geometry persistence and authorization. Any older proposal to place its database inside FixDoneNow is superseded. Earlier blanket photo/drawing parked statements describe the initial September 4 scope, not a veto on later specific owner-authorized standalone work.
