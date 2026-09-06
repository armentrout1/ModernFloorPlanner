# Modern Floor Planner — product ecosystem roadmap

Updated: 2026-09-06. Shared policy remains blueprint v1.1 / My Way. Selected repository: `armentrout1/ModernFloorPlanner`. Reviewed remote baseline: `876968e78d7070775e7924f33a3164ba20905d42` on `main`.

## Current activation

The owner explicitly requested research, architecture and a committed executable roadmap for this product on September 6. Planning is active; the previous blanket documentation-only/selection-unverified description is superseded for this product-planning task. **This publication does not implement the drawing backlog, start Codex, verify a local checkout or authorize live billing/data migrations.**

Authoritative build sequence: [BUILD_ROADMAP.md](../BUILD_ROADMAP.md). Evidence: [dated audit and research](../RESEARCH_AND_AUDIT_2026-09-06.md). First prepared task: [MFP-M1 / issue #2](https://github.com/armentrout1/ModernFloorPlanner/issues/2). M1 issue #2 remains locally producer-verified, open and unreleased. The owner explicitly accepted that evidence and assigned M2A only under [issue #3](https://github.com/armentrout1/ModernFloorPlanner/issues/3); its shared measurement schemas/parsers/legacy adapter are locally verified (see [M2A results](../MFP_M2A_RESULTS.md)). M2B is next eligible but unstarted; later gates remain. Hosting/runtime is separately [PROPOSED in issue #4](https://github.com/armentrout1/ModernFloorPlanner/issues/4), not activated.

The complete local Codex output and unpublished ecosystem roadmap were read, preserved and reconciled during the assigned M1 task; the output is archived. See [M1 evidence](../MFP_M1_RESULTS.md). No machine-specific paths or private inventories belong in this public repository.

## Owned responsibility

Modern Floor Planner independently owns drawings, editor, physical measurements and provenance, quantity calculations, saved geometry versions, exports and tenant-scoped authorization/persistence. It must work without FixDoneNow. Consumers store authorized versioned references; they do not duplicate the geometry engine or read its private database.

FixDoneNow owns CRM/job orchestration. LedgerLine owns authoritative financial estimates/totals/lifecycle. ProjectRoll owns media and photo-report composition. Advisory material costs are not a second financial engine. Shared policy and cross-product consumer roadmaps are not changed by this document.

## Capability mapping and gates

| Capability | Required result | Build milestone / status |
| --- | --- | --- |
| ECO-001 | Verify local root/remote/branch/HEAD/dirty state and reconcile Codex's local output. | M1 entry verified; original local work preserved and reconciled. |
| DR-001 | Standalone/workspace roles, tenant-safe access and explicit partner authority/consent. | M4 standalone gate; M6 partner provisioning/linking. Not implemented by this publication. |
| DR-002 | Product-owned editor, physical quantity engine, measurement assumptions and versioned outputs. | M1 repairs; M2 engine; M3 quick-room UI; M4 revisions/exports; M6 hosted interface. |
| ECO-002 | Cross-business denial, independent standalone operation, expired permission rejection and stable issued snapshots. | M4 producer tests and M6 originating-consumer verification. |

Roadmap order: repair foundation → measurement engine → quick-room workflow → secure saving/revisions/exports → paid-use pilot → FixDoneNow handoff → materials → suppliers/enterprise.

Do not expose reviewed unscoped `/api/floor-plans` methods as a multi-tenant integration. Historical source shows functionality, not customer-safe runtime proof. Read the audit before making claims.

## Cross-product execution

Use owner-repository issues and existing capability IDs. Publish and verify compatible producer interfaces before consumer deployment. FixDoneNow and LedgerLine adapters receive separate bounded assignments; an issue in this repo does not grant access to or start work in another checkout. Future drawing AI belongs here and must label inferred versus confirmed measurements.

Ordinary authorized delivery uses the verified production branch and normal deployment with appropriate checks; no compulsory staging or preview. Preserve existing plans, unrelated work, provider-managed backups and rollback references. Record commit, deployed version and originating workflow result separately. A roadmap, mock or successful GitHub commit is not end-to-end integration evidence.
