# M4C project lifecycle — implementation and verification record

Assigned issue: [#25](https://github.com/armentrout1/ModernFloorPlanner/issues/25). Broader requirements: [#9](https://github.com/armentrout1/ModernFloorPlanner/issues/9) and [#10](https://github.com/armentrout1/ModernFloorPlanner/issues/10).
Entry canonical main: `a0ddba771991799789c9e0d448bc3f46ce767bfc`.
Record date: **2026-09-12**.
Status: **COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED.**
Implementation commit: `4a3a321e23726ac13ad20185f5a17429af0ae601`.
Documentation publication: **the commit containing this record; the GitHub push/closeout receipt is recorded in #25 after remote confirmation**. Publication is not assumed by the local verification record.
Final source: **325 files**, digest `7a408056b11137b02e41ad7af80503714eba189c18334d49026cc1347433787e`; integrated and committed hashes MATCH. Separate canonical build, **3/3 authenticated lifecycle smoke** and **5/5 normal-review checks PASS**.

The completed 15-file implementation was developed and fully tested in isolation, then integrated unchanged and committed on verified canonical main. The release owner verified clean synchronized entry main and no competing Modern Floor Planner writer, then rechecked before integration. Owner tabs, drafts, storage, stash, archives and source originals remain protected. The evidence below distinguishes fresh full verification, separate canonical smoke and the publication receipt that follows normal push.

The preceding schematic drawing/export package [#24](https://github.com/armentrout1/ModernFloorPlanner/issues/24) is published and closed: implementation `2d5844c65b2a2b3dd1f97e4f3841b01a89835c4a`, documentation `a0ddba771991799789c9e0d448bc3f46ce767bfc`. Its [results](MFP_M4C_DRAWING_EXPORT_RESULTS.md), earlier #23 quantity reports and M4B #21/#22 evidence remain historical and unchanged. Their passes do not establish #25 correctness. This task retains exports and persistence rather than restarting them.

## Implemented project lifecycle contract

### Scoped lists and explicit actions

List active or archived saved projects with pagination in the currently verified account/workspace context. Rows identify their saved revision and lifecycle state and expose explicit permitted actions. Workspace/member authorization remains server-established. Viewer access is read-only; cross-workspace known IDs, revoked membership, expired sessions and stale account responses must not disclose or change another context. A retained list or local metadata never grants access.

Listing, duplicate, archive and restore do not open or replace the current local draft. Existing authorized Open remains a separate intentional workflow with its draft protections. Pagination and delayed responses must retain the requested workspace/state and must not install results after account/context changes.

### Exact saved-revision duplication

Duplicate copies the exact selected saved physical envelope, captured evaluation and hash into a new independent active plan with revision 1. The source is the selected saved revision, not unfinished local changes or an assumed latest revision. Retain source document and snapshot IDs, names, units, selected scope, quantities, completeness/confirmation, engine/policy versions and newer building fields exactly. Do not recalculate, rename the captured document, upgrade its schema or manufacture a fresh measurement capture to make it look current.

New plan/revision identities are separate from immutable physical and snapshot identities. Explicit `copiedFrom` provenance identifies the source plan/revision, while the existing capture origin remains unchanged. Duplicating an already copied plan retains its captured origin and records the actual immediate source. The original plan/revision history is untouched; later destination edits append only to the new destination history. Duplicate actions and retries must not create extra copies after an accepted but unacknowledged response.

### Reversible archive/restore and concurrency

Archive and restore modify lifecycle metadata outside the physical envelope. They do not delete plans, rewrite revision contents, alter quantities or erase recovery. Exact saved-revision and monotonic lifecycle-version preconditions, atomic transactions and immutable idempotency receipts protect concurrent writes, stale lists and archive/restore ABA sequences. An older request must not regain validity merely because a plan returned to the same visible active state.

Archived revisions remain readable/exportable under current authorization. Fresh append attempts while archived are blocked. A previously accepted save can still replay its immutable receipt after archive when current authorization permits; committed-but-unacknowledged saving must not be mislabeled rejected or silently discarded. Lifecycle retries likewise retain the original operation, preconditions, payload and key. Restore makes the project active without rewriting its history or automatically restarting Autosave.

### Draft, Autosave and uncertain-request preservation

Pause Autosave before archive dispatch. Preserve the current local draft, unapplied raw fields and their unit/text context, measurement evidence, history and recovery branches. Do not force Apply/Revert, erase uncertain save requests, implicitly open a project or send a lossy legacy save. Uncertain accepted saves require exact receipt resolution before newer saves advance; existing Save/Retry coordination remains authoritative.

Lifecycle request intentions use versioned, per-context same-tab metadata persisted before the write. An explicit retry uses the exact retained request and idempotency key. Retained intentions are not automatically executed on reload, context discovery or restoration. Stored metadata is not an account authorization source, full physical draft or guaranteed backup, and does not replace the existing recovery journal. Unsupported/corrupt/unavailable persistence must be handled explicitly without silently changing the request identity. A late response cannot clear another context's intention or overwrite newer draft/binding state. Five additional coordinator regressions cover an older archived receipt, stale preflight read, delayed rejection, Open observation and recovery read arriving after restore. Generation guards preserve the newer lifecycle state and the original save/recovery identity; closing the list invalidates late list/Open updates while confirmed archive/restore still updates the verified context manager.

Same-tab storage is not a durable backup. If intent removal succeeds but readback becomes unavailable, the application fails closed with the request retained in memory and may require storage access to return. Exact-key survival across reload cannot be promised after successful removal. No automatic storage reset is performed.

Current Autosave preference and recovery behavior remain explicit. Archive pauses sending; restore does not opt the user back in. Account/context changes, revoked access and stale responses must preserve usable local work while preventing further unauthorized sending. Existing owner review tabs and their storage are never used to exercise these cases.

## Compatibility and migration boundaries

The saved physical document and quantity snapshot contracts remain intact, including supported captured schemas 1–5, levels, stairs/landings/surface openings, room uses/zones/cabinet blocks, grouping, opening dimensions/styles/handing, measurement evidence and original source lineage. Lifecycle state is project metadata, not a new physical schema or an interpretation of old captured geometry. Existing quantity CSV and printable schematic/quantity reports retain their captured numbers, injection defenses, current-access checks and uncertainty labels.

One narrow additive migration is permitted for this lifecycle implementation and may be applied **only to the verified disposable local PostgreSQL test cluster**. The additive file is `migrations/0004_physical_project_lifecycle.sql`; it supplies lifecycle/provenance metadata and idempotency receipt support. The fresh physical SQL suite passes 42/42 cases, including its migration behavior. No migration is applied to a live or unidentified database. No destructive/bulk migration, implicit legacy ownership assignment, schema reinterpretation or production data change belongs to this task.

Existing session/workspace/CSRF authorization is retained. Read/export permission is checked against current access, including archived records. Local synthetic issuer/HTTPS/database tests do not verify a live identity provider or production binding. No hosting, paid provisioning, deployment, customer onboarding, object catalog, trade system, framework change or M5 work is included.

## Fresh final verification

The final source/configuration/test/migration package is frozen across **325 files**, digest `7a408056b11137b02e41ad7af80503714eba189c18334d49026cc1347433787e`. All **12 fresh final command groups exited 0** and all 325 source hashes match after the sequence. [Actual counts and command receipts](evidence/m4c-project-lifecycle/verification-summary.json), [frozen source](evidence/m4c-project-lifecycle/final-source.json) and the [sanitized manifest](evidence/m4c-project-lifecycle/manifest.json) retain the evidence. The exact tested source was integrated and committed unchanged, so full checks are reused; the separate canonical build/smokes are additional acceptance, not a second full sequence.

| Command or evidence | Actual final result |
| --- | --- |
| `npm ci` | PASS; 508 packages installed / 509 audited; 26 existing advisories (2 low, 10 moderate, 14 high) |
| `npm test` | **688/688 PASS**, including 34 save-coordinator cases |
| `npm run check` | PASS |
| `npm run build` | PASS; existing greater-than-500-kB chunk warning retained |
| `npx playwright test --reporter=line` | **192/192 PASS**, unfiltered main browser; 559.816 seconds |
| `npm run test:authorization:db` | **15/15 PASS** |
| `npm run test:accounts:db` | **20/20 PASS** |
| `npm run test:accounts` | **32/32 HTTPS + 8/8 browser PASS** |
| `npm run test:physical:db` | **42/42 PASS** |
| `npm run test:physical` | **37/37 HTTPS + 24/24 browser PASS** |
| `npm run test:journal` | **17/17 browser PASS** |
| `npm run test:autosave` | **15/15 integration PASS**, 91.517 seconds |
| Final source identity | **325/325 MATCH** after the full sequence |
| Canonical application working/staged whitespace | **PASS across all 15 integrated implementation paths** |
| Exact tested / integrated / committed source | **325/325 MATCH**, implementation `4a3a321e23726ac13ad20185f5a17429af0ae601` |
| Separate canonical build | PASS; **7/7 compiled files byte-identical** to the tested build |
| Separate canonical authenticated lifecycle smoke | **3/3 PASS**, 12.2 seconds; normal routes, synthetic OIDC/HTTPS, disposable PostgreSQL and fresh browser contexts |
| Fresh normal-review smoke | **5/5 PASS**; expected SHA, fail-closed unconfigured auth, preserved raw height, zero browser API writes/page errors |
| Synthetic desktop/phone visual review | PASS; screenshots inspected for readable layout, including long names and archived viewer state |
| Documentation whitespace and ordinary GitHub publication | Recorded in the #25 closeout receipt after final checks and remote confirmation; not assumed here |

The physical SQL/HTTPS/browser suites include the new lifecycle cases; they are not an additional count to add to those totals. Coverage includes exact source/snapshot duplication with independent subsequent edits; archive/restore, stale revision and lifecycle ABA races; concurrency and immutable receipt replay; viewer/revoked/foreign/context denial; pagination; pending fields, Autosave pause, uncertain saves and recovery; late responses and phone use. Archived authorized read/export and previously accepted save-receipt replay are checked separately from blocked fresh append. Same-tab metadata persistence precedes dispatch, retry keeps the exact key, and discovery does not automatically execute retained operations.

**Historical development attempts, retained separately:** initial preflight passed **683 unit**, **42 physical SQL** and **37 HTTPS** cases but **21/23 persistence browser cases**. The existing two-client conflict/status flow and a new viewer wait failed. The same-plan status behavior was corrected and the viewer case waits for completed Open; review also identified delayed restore and old save-status races. Five coordinator generation-guard regressions and the list-close regression were added before the fresh final sequence. The final persistence run independently passes **24/24**, and final units independently pass **688/688**. The [earlier targeted browser log](evidence/m4c-project-lifecycle/targeted-physical-browser.log) is historical evidence, not a partial result combined with other attempts. #24's earlier 677-unit/192-browser pass likewise describes the older drawing-export source.

## Integration and publication receipt

Canonical root `C:\Users\aaron\Documents\Codex\Modern Floor Planner`, branch `main`, upstream `origin/main`, normalized remote and writer availability were verified before integration. Entry `a0ddba771991799789c9e0d448bc3f46ce767bfc` was clean and synchronized. No competing Modern Floor Planner writer was observed. Only the verified old Modern Floor Planner review **PID 32536** on 5192 was stopped after exact command and actual working-directory checks, immediately before integration. That origin was not restarted, and owner tabs were not inspected, reloaded, closed or operated.

The exact tested **15-file** package, including the narrow additive migration, was integrated and committed as **`4a3a321e23726ac13ad20185f5a17429af0ae601`**. All **325 integrated and committed source hashes MATCH** the frozen source, and application working/staged Git whitespace passes. The separate canonical build passes; all **seven compiled outputs match the tested build byte for byte**. See [committed-source proof](evidence/m4c-project-lifecycle/committed-source.json) and [compiled-output comparison](evidence/m4c-project-lifecycle/integrated-build.json). Source originals, stash and original archive hashes remained unchanged.

The separate [canonical authenticated lifecycle smoke](evidence/m4c-project-lifecycle/canonical-lifecycle-smoke.json) uses normal canonical `registerRoutes` with an isolated synthetic OIDC issuer, HTTPS, the verified disposable PostgreSQL cluster and fresh browser contexts. **Three browser cases passed in 12.2 seconds**:

1. Duplicate uses the listed saved schema-5 revision while preserving unfinished current local work.
2. Archive/restore preserve saved revisions, raw local fields and paused Autosave.
3. A viewer can open archived projects but cannot mutate them; long names remain usable on a phone.

The fresh normal review is **[http://127.0.0.9:5193/physical-draft](http://127.0.0.9:5193/physical-draft)**, started as **PID 37160** against the expected implementation SHA. This address does **not** contain previous owner drafts. The [normal-review smoke](evidence/m4c-project-lifecycle/normal-review-smoke.json) passes **5/5 checks**: expected source identity; unavailable normal authentication with no session cookie; active/archived lists and all three lifecycle mutations return **503** with private responses; unfinished height remains exact in an editable synthetic local draft; zero page errors and zero browser API mutations. No owner origins were visited. The three canonical smoke images (desktop list, phone viewer list and normal unavailable-account panel) were visually inspected.

The [manifest](evidence/m4c-project-lifecycle/manifest.json) contains **27 sanitized evidence files**. The disposable test database cluster was stopped after verification; only the new normal review process remains available, and old 5192 is absent. Synthetic database tests and authenticated smoke do not verify a live provider or production database. The migration was applied only to the verified disposable local database, never to live data.

The documentation publication is **the commit containing this record**. Ordinary non-force push and the GitHub receipt in [#25](https://github.com/armentrout1/ModernFloorPlanner/issues/25) establish publication only after both implementation and documentation commits are confirmed on remote main. Documentation working/staged whitespace, remote synchronization, remaining working-tree state and issue updates are recorded in that receipt. No documentation SHA or remote confirmation is invented here. #25 may close for this complete assigned package; #9/#10 remain open for broader requirements.

Deployment: **NOT DEPLOYED**. Live provider/client registration, trusted HTTPS origin/callback and production PostgreSQL binding remain **NOT VERIFIED**; production migrations and onboarding were **NOT PERFORMED**. No paid provisioning, production data change, consumer integration or other-product change is established by local tests.

## Single next eligible task

After #25 publication, the next separately assigned task is **issue #4 runtime/dependency readiness**, beginning with Node compatibility/project pins and a scoped dependency-advisory review with complete regressions. It is **PROPOSED / NOT STARTED**, not part of this lifecycle assignment. Confirm current official documentation when activated; do not infer hosting or production configuration from the roadmap.

Real provider/client registration, trusted HTTPS-origin validation, approved production-database identity/migration permission, legacy saved-plan ownership review and actual release smoke remain explicit M4 gates. M5 supervised pilot/billing, M6 partnerships, M7 material recipes/purchasing and later trades are not activated by local lifecycle completion. No framework rebuild, runtime change, provisioning or deployment starts here.
