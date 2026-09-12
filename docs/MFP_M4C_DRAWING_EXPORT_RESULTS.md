# M4C schematic drawing and quantity exports — local verification

Assigned issue: [#24](https://github.com/armentrout1/ModernFloorPlanner/issues/24). Broader requirements: [#9](https://github.com/armentrout1/ModernFloorPlanner/issues/9) and [#10](https://github.com/armentrout1/ModernFloorPlanner/issues/10).
Entry main: `bcc12d9cec94595a0237c57cb9bf3fc79173a960`.
Verification date: **2026-09-12**.
Status: **COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED.**
Implementation commit: `2d5844c65b2a2b3dd1f97e4f3841b01a89835c4a`.
Documentation publication: **the commit containing this checkpoint; the GitHub push/closeout receipt is recorded in #24 after remote confirmation**. Publication is not assumed by the local verification record.

The preceding quantity-report package [#23](https://github.com/armentrout1/ModernFloorPlanner/issues/23) is already published and closed: implementation `0dffa2d876c69aea76841528dacf9afa7ac34f43`, documentation `bcc12d9cec94595a0237c57cb9bf3fc79173a960`. Its historical results remain intact. This assignment adds the actual schematic plan to that existing report, without restarting quantity exports or changing the editor framework. Neither all M4C nor all M4 is complete.

## Implemented scope

**Report contents → Drawing + quantities** is an explicit option in Quantity reports. Existing quantity-only reports remain the default; the Download quantity CSV action retains the existing columns and quantity semantics. The captured HTML contains the schematic drawing followed by the captured selected quantities and provenance. Print / Save PDF uses the browser print dialog and the prepared report iframe, not a new server PDF service.

Current-local-draft preparation captures one immutable source document, selected work and measurement evidence. Drawing geometry reads that captured source, and the report numbers/CSV read the same captured calculation. It does not resnapshot the drawing independently or calculate replacement saved quantities. Later room name/dimension, opening style/handing or other edits leave the prepared report unchanged until another explicit Prepare report. Unapplied raw fields refuse preparation without applying/reverting them or silently exporting older committed dimensions.

The saved route adds `format=plan` to the existing `GET /api/physical-plans/:planId/revisions/:revisionId/export` interface. It reads the exact immutable saved revision under existing current-session, principal, workspace, membership and resource checks. Saved print retrieves that same revision again and verifies current context before delivery. The report choice is captured with the report, so later UI choices cannot silently change a prepared saved report's format. Existing `csv`/`html` formats, query validation, viewer read restrictions, conditional writes and account-context invalidation remain preserved.

## Physical-document and drawing contract

- Captured schemas 1–5 retain their original identities, source documents, selected quantity policies and evidence. Rendering does not upgrade old captures, invent measurements or confirm provisional dimensions. Current local physical envelopes retain richer levels, grouping, window heights, opening styles/handing, stairs, landings, surface openings, room uses, functional zones, cabinet blocks and source lineage.
- A room is drawn only with a captured layout position and usable captured plan dimensions. Full names, source IDs, dimensions, units and unresolved conditions remain in schedules. Unplaced/incomplete rooms and objects are identified explicitly instead of assigned made-up positions or sizes.
- Each captured level has one logical schematic sheet, with separate labels and ownership. An empty level is identified as empty. Historical documents without level ownership use a historical-layout sheet, not an inferred ground floor. Long schedules may continue onto additional physical pages; one logical sheet is not a promise of exactly one printed page per level.
- Door/window symbols use captured wall attachments and widths. Supported door styles and handedness follow the existing editor convention; no saved hand or style is reinterpreted. Unknown dimensions/appearance remain labeled, and an invalid/unplaced object cannot silently acquire verified geometry.
- Existing straight stairs are footprints with a direction arrow; endpoint landings and supported explicit surface openings retain their captured level/room associations. No tread count, surveyed interlevel alignment, clearance, structural design or construction compliance is invented. Layout-only zones and fixed cabinet blocks do not create additional room finish area or purchasing quantities.
- Drawing shows the entire captured layout; quantity totals still use only the explicitly captured selected scope. A visible room or object is not automatically selected for takeoff. Unsupported ceiling shapes retain their findings instead of receiving verified flat-ceiling quantities.

Every schematic is labeled **“Schematic only — not a certified scale drawing.”** Each level is fitted independently, so printed scale cannot be compared between levels. Feet/meters are display conversions of captured values. The drawing and quantities are measured planning evidence, **not a complete construction materials or purchasing list**. M7 retains material recipes/coverage/accessories/waste/purchasing; later trade modules retain construction and routing models.

## Compatibility, security and recovery limits

The renderer emits escaped self-contained HTML/SVG without scripts, remote images, fonts or other network resources. Captured variable names/IDs are text or escaped attributes, not executable markup. The existing quantity CSV formula defenses and exact canonical-number columns remain unchanged. Existing private/no-store response headers, attachment disposition, `nosniff` and HTML CSP remain in effect. The preview iframe permits modal printing and same-origin parent access but not scripts.

Current verified authorization is required on saved retrieval and redelivery; known IDs or an earlier preview do not grant later export permission. Account/context changes discard stale private preview work and prevent delayed delivery. Downloaded files cannot be recalled after access changes. Unconfigured normal composition remains fail-closed; isolated tests do not establish live authentication or a production database binding.

No schema, migration, dependency, framework, account onboarding or deployment change is included. Export does not use the legacy save endpoint, overwrite independent drafts, clear raw inputs, create account revisions or alter Undo/Redo/recovery. Owner browser tabs, existing drafts, stash, archives and original isolated work remain protected. Fresh isolated test and review origins do not contain previous owner drafts.

## Verification record

The final application/configuration/test source is frozen across **321 files**, digest `08857d04671f6751ab5809eed4e552941257609c781db6d2d44d5e82c9585af5` (text line endings normalized; binaries unchanged). The fresh final sequence below completed on that exact source: **all 12 command groups exited 0** and all **321 source hashes MATCH**. These counts are not assembled from targeted runs. The [source/check manifest](evidence/MFP_M4C_DRAWING_EXPORT_2026-09-12.json) records current-source verification and the separate integration/publication receipts. The isolated, integrated and committed source at `2d5844c65b2a2b3dd1f97e4f3841b01a89835c4a` all match that frozen identity. The full sequence is reused on unchanged source; the separate canonical build and smoke below are additional integration evidence, not a second fresh full run.

| Command or evidence | Current final result |
| --- | --- |
| `npm ci` | PASS; 508 installed / 509 audited; 26 existing advisories (2 low, 10 moderate, 14 high) |
| `npm test` | **677/677 PASS** |
| `npm run check` | PASS |
| `npm run build` | PASS; existing large-bundle warning retained |
| `npx playwright test --reporter=line` | **192/192 PASS**; 574.146 seconds (9.5 minutes) |
| `npm run test:authorization:db` | **15/15 PASS** |
| `npm run test:accounts:db` | **20/20 PASS** |
| `npm run test:accounts` | **32/32 HTTPS + 8/8 browser PASS** |
| `npm run test:physical:db` | **22/22 PASS** |
| `npm run test:physical` | **29/29 HTTPS + 14/14 browser PASS** |
| `npm run test:journal` | **17/17 browser PASS** |
| `npm run test:autosave` | **15/15 integration PASS** |
| Frozen source equality | **321/321 MATCH**, digest unchanged after the full sequence |
| Isolated changed-file whitespace | **PASS across all 9 changed application/test paths** |
| Canonical application working/staged whitespace and exact integrated/committed source equality | **PASS across all 9 integrated paths; 321/321 source hashes MATCH** in working files and committed archive; documentation checks belong to the publication receipt |
| Separate canonical build and integration smoke | **Build PASS; 7/7 smoke checks PASS** on the expected implementation SHA, with zero page errors/API writes |
| PDF page rendering/visual review | **PASS:** all 17 current-source A4 pages visually inspected; long unbroken ASCII and Chinese/Spanish names retained and wrapped, no clipping |

Targeted development evidence is retained separately: 35 focused renderer tests passed; the six new local drawing-report browser tests passed after correcting test-source encoding. Their first attempt was **3 passed / 3 failed** because expected em dashes and synthetic Chinese names had become mojibake during a test-file edit. Exact UTF-8 text was restored without weakening assertions; the rerun passed **6/6 in 15.0 seconds**. No application change resolved those encoding failures. An initial saved-export run passed **29 HTTPS cases and 12/14 browser cases**; two new test selectors were corrected. The corrected targeted saved-export browser rerun passed **14/14 in 45.6 seconds**. The fresh final physical run above independently passed all 29 HTTPS and 14 browser cases. None of these targeted runs is combined into a full integration pass.

The local browser cases verify real UI capture, parsed CSV values, matching snapshot identity, 12:10 then 14:10 room geometry, door handing/width edits, frozen prepared output, raw-field refusal, schema-5 level separation, linked object identities, explicit unplaced schedules, phone overflow and actual multi-level PDF creation. The synthetic two-level fixture retains gross floor 270 sq ft, explicit floor-hole deduction 18 sq ft, net floor 252 sq ft, 10% allowance 25.2 sq ft, adjusted 277.2 sq ft, flat ceiling 270 sq ft and gross walls 752 sq ft. Zones/cabinets do not inflate those totals.

The renderer's print layout uses compact IDs and names/dimensions where legible, full external schedules, independently fitted SVGs and page-break-aware tables. The current-source multi-level A4 PDF has **17 pages; all 17 were visually inspected without clipping**. Long unbroken ASCII and Chinese/Spanish labels remain readable in schedules. Extreme headings and quantity evidence can continue across pages. The page-four cabinet remains visible beneath the transparent stair footprint; the schematic does not conceal that overlapping layout annotation. Nine sanitized artifacts, including the PDF, synthetic screenshots and canonical smoke result, are retained with the manifest. Native printer output and universal browser/font behavior are not certified.

## Integration and publication

Canonical root `C:\Users\aaron\Documents\Codex\Modern Floor Planner`, branch `main`, upstream `origin/main`, remote and writer availability were verified immediately before integration. Entry main was clean and synchronized at `bcc12d9cec94595a0237c57cb9bf3fc79173a960`, with zero commits ahead/behind and no competing Modern Floor Planner writer observed.

Only the verified Modern Floor Planner review process **PID 39172** on `127.0.0.7:5191` was stopped after its exact command and actual working directory were confirmed. That origin was not restarted. The exact nine-file tested package was then integrated and committed as **`2d5844c65b2a2b3dd1f97e4f3841b01a89835c4a`**. All **321 integrated and committed source hashes MATCH** the final tested digest. Canonical application working/staged whitespace and the separate build pass. Owner tabs were not inspected, reloaded, closed or operated, and drafts, browser storage, stash, archives and source originals were preserved.

The new normal review is **[http://127.0.0.8:5192/physical-draft](http://127.0.0.8:5192/physical-draft)**, started as **PID 32536** against the expected implementation SHA. This new address does not contain previous owner drafts. The separate fresh synthetic smoke passes **7/7 checks**:

1. Expected implementation SHA and normal unconfigured application composition.
2. No authenticated session cookie issued by that unconfigured composition.
3. Saved `csv`, `html` and `plan` exports all return **503**, failing closed without configured authentication.
4. Actual local 12×10×8 ft input produces CSV floor/flat-ceiling/gross-wall values **120/120/352 sq ft** and a schematic from the same captured snapshot; the room aspect ratio is **1.2** and its door is included.
5. Preparation and export leave the captured physical draft/evidence unchanged; the synthetic screenshot was reviewed.
6. Raw unfinished ceiling-height text remains exact and blocks silently exporting older committed dimensions.
7. Zero page errors and zero API mutations; no owner browser origin was visited.

Sanitized evidence: [canonical smoke result](evidence/m4c-drawing-export-2026-09-12/canonical-drawing-smoke.result.json) and [synthetic review screenshot](evidence/m4c-drawing-export-2026-09-12/canonical-drawing-smoke.png). The normal-composition smoke is separate from the full synthetic authenticated HTTPS/PostgreSQL suites and does not verify a live identity provider or production database.

The documentation publication is **the commit containing this checkpoint**. Ordinary non-force push and the GitHub receipt in [#24](https://github.com/armentrout1/ModernFloorPlanner/issues/24) establish publication after both commits are confirmed on remote main; this local record does not claim that receipt prematurely. #24 may close only for this delivered package, while #9/#10 remain open for broader requirements.

The existing quantity-report implementation and documentation commits remain intact ancestors. Application/test changes require actual checks against the changed source. Documentation-only publication does not justify repeating the implementation cycle or representing reused results as a second fresh full pass. No force reset, force push, unrelated writer overwrite, broad process termination or owner-tab interaction is authorized by this implementation.

Deployment: **NOT DEPLOYED**. Live identity-provider/client registration, trusted HTTPS-origin validation and production PostgreSQL binding remain **NOT VERIFIED**. No production migration, provider provisioning, customer onboarding, production data change or other-product repository change occurs in this slice.

## Single next bounded feature

After #24 publication, the next implementation task is **project list, duplicate, archive and restore — NOT STARTED**, separately assigned. Existing legacy rename/delete routes do not satisfy that lifecycle contract. M4C/M4 are not all complete; #9/#10 remain open, #4 stays PROPOSED, and M5–M8/release gates keep their existing order.
