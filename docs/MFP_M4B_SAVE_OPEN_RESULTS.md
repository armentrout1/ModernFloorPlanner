# M4B explicit physical Save/Open — local verification

Assigned issue: [#21](https://github.com/armentrout1/ModernFloorPlanner/issues/21). Entry main: `6f60d3a5877d02e3d527ff52a47e9c0eaf2551de`. Owner authorization covers this bounded implementation, disposable-database migrations, tests, safe integration and normal non-force publication. It explicitly permits M4B development before live-provider registration; completed M4A #19/#20 and all M3 work are preserved.

- M4B explicit Save/Open implementation: COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED.
- M4B autosave/unsent recovery: NOT STARTED.
- M4A live-provider connection: unresolved.
- Production PostgreSQL binding: NOT VERIFIED.
- Deployment: NOT DEPLOYED.

## Stored document and evidence

`mfp-physical-save-v1` is a separate physical persistence envelope: supported current `document`, committed quantity `request`, and retained `evidence`. Physical schema 5 and supported earlier editor versions retain their current interpretation; there is no physical-schema or quantity-engine bump. The document includes stable physical IDs, level/room ownership, grouping, opening sizes/styles/handing, stairs/landings/surface openings and explicit impacts, room uses/zones/cabinet blocks, applicability and measurement provenance. The request retains selected outputs, exact target sets, opening basis, crown-gap policy and committed waste. Saving does not confirm measurements, resolve unknowns or select extra work.

Evidence includes the validated imported source, room/opening measurement events, review declarations, performed restoration/history evidence, stair/layout events and level/stair/layout upgrade lineage. Frozen original source text remains an exact string when the existing contract requires original bytes; JSONB does not preserve incidental object-key order or surrounding JSON whitespace. Historical v1–v4 captured snapshot examples and current v5 semantics remain validated by the existing dispatch. Source IDs and historical revisions stay in source evidence; server plan/revision UUIDs are distinct from fresh local draft IDs. Current temporary document IDs remain null under the unchanged local contract; only the server snapshot copy receives its server binding.

Current unfinished raw fields, display/camera/gesture state, browser registry bookkeeping, cookies/tokens/session context and active Undo/Redo state are excluded. Raw text embedded in a frozen historical original is retained as source evidence rather than treated as a current unfinished field. `openingDeleteUndo` is an active pending undo capability, so it is not reactivated by Open; the complete deleted opening remains in `openingEvents.delete.before`, and performed restore/history events remain retained. The original local draft and its recovery are not overwritten. Opening a saved revision establishes a new local history boundary.

Validation reuses the existing pure recovery/state validators and shared physical/request/snapshot engine rather than implementing a second interpretation. Maximum complete encoded payload is 4 MiB, depth 80, 150,000 nodes, 20,000 entries per collection, 1,048,576 UTF-16 code units per string, 1,000 rooms and 5,000 openings. JSONB-incompatible NUL and lone Unicode surrogates fail explicitly; valid Unicode/source text remains unchanged. Malformed structure, unsupported versions, dangling references, forged output fields, credentials and oversize content fail without truncation or SQL mutation. Supported incomplete or unresolved geometry remains saveable with accurate readiness.

A full canonical envelope SHA-256 covers names, appearance, metadata, source text, selected work and evidence. It is distinct from calculation geometry identity. Server evaluations use the existing shared engine and capture an immutable `kind: evaluation` snapshot bound to the exact document/request, server plan/revision and database timestamp. Browser-submitted totals, fingerprints or output status are not accepted. Unknown height leaves floor/flat ceiling available and wall outputs incomplete; save never creates a fabricated complete result. Stored older revisions are read without recalculation or overwrite.

## Database and API

Additive once-only `0003_physical_plans.sql` follows 0001/0002. `physical_plans` owns a current pointer in one workspace; `physical_plan_revisions` stores append-only envelopes, captured evaluations, full content hashes, sequence numbers, verified actor and database timestamps. `physical_save_receipts` records accepted idempotent outcomes. Composite foreign keys prevent cross-workspace/cross-plan revision relationships; a deferred current-pointer foreign key permits atomic first creation. Revision/receipt update-delete triggers protect immutable history. Legacy floor_plans and unresolved NULL ownership remain untouched. Startup does not migrate tables or run db:push.

| Route | Contract |
| --- | --- |
| GET /api/physical-plans | Authorized summaries, UUID cursor; default 20, maximum 50 per page |
| POST /api/physical-plans | Bare validated envelope plus UUID Idempotency-Key; atomic plan/revision/receipt |
| GET /api/physical-plans/:planId | Current stored revision and explicit strong ETag |
| GET /api/physical-plans/:planId/revisions/:revisionId | Authorized immutable stored revision and ETag |
| POST /api/physical-plans/:planId/revisions | Bare envelope, Idempotency-Key and exact If-Match; atomic revision/pointer/receipt |

Routes mount before the existing API catchall. Private responses remain no-store. They share the existing real identity, exact Origin, X-MFP-Request, X-MFP-Context and selected-workspace enforcement with legacy routes. The same SQL transaction locks browser context, workspace, principal/identity and membership before resource mutation/replay. Owners/editors write; viewers read; foreign/unowned resources disclose no content. Body fields never establish ownership or authorship.

ETag is the explicit strong revision identifier `"mfp-physical-<revision-uuid>"`, representing the complete immutable response. Missing If-Match returns 428; invalid/wildcard/weak conditions return 400; a stale exact version returns 412 without a new revision. A plan-row lock ensures two writers on one base cannot both advance it.

Idempotency is scoped by verified principal/workspace/operation/resource and canonical UUID key. A transaction advisory lock plus unique receipt serializes identical keys, including alternate UUID letter case. Accepted identical retries replay the recorded outcome even after the current pointer advances; changed content or changed base under the same key returns 409 IDEMPOTENCY_CONFLICT. Current authorization is always rechecked before replay, so old receipts cannot restore revoked access. No unconditional-update, transfer, share or force-merge route exists.

## Explicit UI and preservation

The physical editor names the selected destination workspace. Unassigned drafts require an explicit preserved workspace copy before upload. Login and workspace selection upload nothing. Save/Open shows Local-only, Saving, Saved revision, Unsaved changes, Failed or Conflict. A successful duplicate click does not create another unchanged revision.

All draft-owned raw field families block Save with individual Apply/Revert guidance: level names, rooms, door/window/opening measurements, stair/endpoints/landings/surface openings, zones/cabinets and waste. A pending room-level assignment also blocks Save with Assign/Revert guidance. Pointer/focus handling prevents the Save action from first committing a field through blur. Deliberately committed unknowns may be saved.

Each outgoing request captures its exact draft revision and verified account context; saves serialize per draft. Edits made during network waits remain in the editor and stay unsaved after the older acknowledgement. Lost responses retain the exact request/key in memory for an explicit retry; they are not a background queue. Context-scoped local linkage records server references separately from physical recovery. A fresh browser can retrieve authorized content from SQL without that linkage or drawing cache.

Open always makes a separate local copy; another unsaved draft and its unfinished text remain selectable. Conflict preserves the local candidate and offers Open latest separately or Save candidate as a new plan. Logout/workspace changes invalidate old responses; stale success cannot repaint another workspace or mark its draft saved. Plaintext local recovery is not encrypted device isolation.

## Exact verification and publication

Implementation commit: `01e42693f8dd2c4044234706db2ba97895d681a1`. The documentation commit and confirmed GitHub main publication are recorded in [issue #21](https://github.com/armentrout1/ModernFloorPlanner/issues/21) after normal push. Entry/rollback reference remains `6f60d3a5877d02e3d527ff52a47e9c0eaf2551de`; reverting application code must not delete immutable database history.

The final sequence ran from the last application/test edit on the same frozen source. No old targeted runs or post-integration smoke cases are added to these counts.

| Command | Actual final result |
| --- | --- |
| npm ci | PASS; unchanged lockfile, 26 known dependency advisories |
| npm test | 587/587 PASS |
| npm run check | PASS |
| npm run build | PASS; recorded bundle/Browserslist warnings |
| npx playwright test --reporter=line | 180/180 PASS |
| npm run test:authorization:db | 15/15 PASS |
| npm run test:accounts:db | 20/20 PASS |
| npm run test:accounts | 32/32 OIDC/HTTPS checks and separate 8/8 browser journeys PASS |
| npm run test:physical:db | 22/22 dedicated SQL cases PASS |
| npm run test:physical | 18/18 dedicated OIDC/HTTPS cases and separate 9/9 physical browser journeys PASS |
| git diff --check; git diff --cached --check | PASS for implementation and documentation publication |

[Source/check manifest](evidence/MFP_M4B_SAVE_OPEN_2026-09-10.json) binds all 298 application/config/test/migration files (CRLF normalized to LF; binary unchanged), digest `01548a4844fa30c98af2c53268d91f641329d21ddc89cf1603baf976f2bfd4e1`. All 36 assigned changed files integrated exactly; committed source equality was verified. Separate canonical npm ci/build passed, followed by **9/9 post-integration authenticated browser checks** on isolated synthetic HTTPS/OIDC/PostgreSQL and **1/1 normal-composition local review smoke**, with zero page errors. These are additional smoke evidence, not extra main-suite cases. Individual commands and durations are retained in the manifest and sanitized logs under `docs/evidence/MFP_M4B_SAVE_OPEN_2026-09-10/`.

Immediately before integration, the canonical checkout was clean on main with no competing writer, and origin/main still matched the entry commit. The protected 127.0.0.4:5188 listener was absent; no substitute process was stopped. Owner tabs/storage were never operated on. Stash and the archived original roadmap hash remain unchanged. No old origin was restarted. After all tests, only the verified disposable PostgreSQL process was stopped; its cluster files were retained. The new normal review listener remains available.

The verified new [local review](http://127.0.0.5:5189/physical-draft) uses normal registerRoutes with authentication unconfigured: account saving is unavailable, all five physical routes fail closed with 503/no-store, and synthetic local raw room/window/waste fields and evidence survive account/legacy denial and navigation. It contains none of the owner's previous drafts. Authenticated Save/Open proof comes from the isolated synthetic HTTPS fixture, not this unconfigured address.

Genuine final fixture captures: [Saved revision](evidence/MFP_M4B_SAVE_OPEN_2026-09-10/physical-save-success.png), [fresh-session SQL Open](evidence/MFP_M4B_SAVE_OPEN_2026-09-10/physical-open-fresh-session.png), [two-client conflict](evidence/MFP_M4B_SAVE_OPEN_2026-09-10/physical-save-conflict.png), and [rich draft after pending-input checks](evidence/MFP_M4B_SAVE_OPEN_2026-09-10/save-pending-fields-guard.png). Only synthetic fixtures are shown; no cookies, TLS keys, owner drafts or login query strings are included.


Meaningful acceptance includes actual fixture OIDC/HTTPS/sessions/routes/PostgreSQL, a fresh browser context with no drawing cache, real app-process restart retaining the same database, full rich-document/evidence roundtrip, immutable height revisions, true SQL contention, idempotent response-loss recovery, tenant/viewer/revocation/context races, all pending input families, in-flight editing, unknown/malformed content and unchanged legacy behavior.

The 12×10×8 fixture produces floor/flat ceiling 120 sq ft and gross walls 352 sq ft; height 9 gives walls 396 while floor/ceiling stay 120. The rich two-level fixture retains net floor 252 sq ft, 10% allowance 25.2 and adjusted 277.2 after reload; zones/cabinet blocks add no finish area. These are measured finish quantities, not a complete construction-material purchasing list.

Historical development failures remain in local evidence: the first new HTTP run lacked selected quantity targets and used invalid legacy test dates, plus one transient fixture control connection failure; corrected new fixtures passed 18/18. The first browser attempt had two new-fixture issues (ambiguous toolbar/canvas locator and an asynchronous Open wait matching the old Saved label). A later run exposed a text-encoding regression in the new Save status; the source was corrected, original assertions retained, and all 9 journeys subsequently passed before the fresh full baseline. The first fresh integration run then passed all 587 unit tests but failed 3 of 180 main browser cases (177 passed): their global status selectors now matched both the recovery message and the new account-save status. Only those three locators were scoped to recovery; storage/data-preservation assertions stayed intact. One new HTTP test-name apostrophe was repaired to valid UTF-8. The second fresh full run passed 587 unit tests and 179/180 browser cases, reaching a later assertion that still expected the pre-Save/Open phrase “browser tab only.” That assertion now checks the explicit temporary-recovery wording and unavailable account saving; its zero-upload assertion remains. All three affected recovery cases then passed together (3/3). Both full failed runs and source digests are retained separately; the final full sequence restarted with npm ci and passed as recorded above. No prior product assertions were weakened.

## Remaining boundaries

Only explicit Save/Open is delivered by this slice. Autosave/unsent recovery, full revision-management UI, revision merging, project delete/archive/restore, exports, live provider registration, hosting, live migrations, onboarding and material recipes remain outside it. M4B autosave/unsent recovery is the next bounded development task under a separate assignment; M4A live binding and #4 release readiness remain prerequisites for deployment/customer use. Neither all M4A nor all M4B is complete. #9/#10 stay open, #2 unreleased, #4 release-readiness PROPOSED; CRM remains separate.

The 26 known dependency advisories (2 low, 10 moderate, 14 high), stale Browserslist data and large-bundle warnings remain tracked pre-live. Session/context/login-row cleanup and retention are not automated here. No production PostgreSQL binding, deployment or actual live-provider sign-in has been verified. Local fixture credentials are synthetic and excluded from evidence; normal review has no fake-provider fallback.
