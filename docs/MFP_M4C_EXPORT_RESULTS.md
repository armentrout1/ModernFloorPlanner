# M4C quantity reports — local verification

Assigned issue: [#23](https://github.com/armentrout1/ModernFloorPlanner/issues/23). Broader requirements: [#9](https://github.com/armentrout1/ModernFloorPlanner/issues/9) and [#10](https://github.com/armentrout1/ModernFloorPlanner/issues/10).
Entry main: `a679c0504043ec7c4ad52a26601905eef9080d58`.
Verification date: **2026-09-12**.
Implementation commit: `0dffa2d876c69aea76841528dacf9afa7ac34f43`.
Documentation publication: **the commit containing this checkpoint; the GitHub receipt is recorded in #23 after remote verification**. Ordinary non-force push is the remaining publication step at this checkpoint.

**COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED.** All final isolated checks passed. The exact tested package was integrated and committed on canonical main as `0dffa2d876c69aea76841528dacf9afa7ac34f43`. All 317 integrated and committed source hashes match the frozen manifest; a separate canonical build and six-check normal-composition smoke passed. Publication must still be confirmed on GitHub before #23 closes. This is the first bounded M4C slice: CSV quantity reports and printable quantity reports with browser Save as PDF. It does not include a plan drawing. M4C and M4 as a whole are not complete. Existing M4B persistence, M4A authorization/session behavior and M1–M3/initial M3D remain preserved.

## Implemented contract

The physical-draft quantity panel offers an explicit report source, Prepare report, Download quantity CSV and Print / Save PDF. The two sources are visibly distinct:

- **Current local draft:** captures the committed document, selected work and measurement events through the existing versioned physical envelope and quantity-snapshot boundary. Unapplied fields require individual Apply or Revert; preparing a report does neither automatically. A local capture is not an account save and creates no server plan/revision.
- **Last acknowledged saved revision:** retrieves that exact immutable saved revision through the existing authenticated workspace boundary. It does not silently export newer unsaved edits or follow a changed server pointer. The captured source document/revision and the account plan/revision are separately identified.

CSV and print use the same captured calculation. Later edits do not change a prepared report; the interface identifies newer local edits and offers another explicit preparation. No measurement confirmation, policy upgrade, scope expansion or source mutation occurs during rendering. Historical v1–v5 captures retain their versions and captured semantics. The rendering module reads `snapshot.evaluation.calculation`; it never invokes the quantity engine to replace the captured result. Local capture uses the existing shared engine, while saved export reads the server evaluation recorded with its immutable revision. SHA-256 fingerprints identify captured content; they are not a digital signature, an ownership grant or a hosted-report guarantee.

Exporting does not replace the editor document, invoke legacy save, upload anonymous drafts or alter the original independent Quick Rooms/sketch sources. Existing levels, stairs, surface holes, room uses, zones, cabinet blocks, groups, window heights, door styles/handing, measurement evidence, Undo/Redo and recovery contracts remain unchanged. There are no schema, migration, dependency or framework changes in this slice.

## Report content and numerical meaning

Both formats include project/room names and source IDs; snapshot ID/date/kind/schema and capture/content/geometry fingerprints; source and account revision identities; engine/policy/result versions; display units; explicit selected target IDs; source room/opening dimensions, confirmation and supported-model declarations; gross, raw/effective deductions, net, waste, allowance and adjusted amounts; aggregate inclusion/exclusion; target details and missing, unsupported or provisional findings. CSV also retains the captured deduction trace and canonical amounts.

Feet/meters display uses four decimal places with trailing zeros removed. CSV canonical amount columns retain the exact captured unrounded `mm`, `mm2` or `count` values. The report explains that rounding is presentation only and displayed rows may not sum exactly. Identity inventory has no waste or purchasing conversion. A blocked selected total is unavailable, never a fabricated zero; any available subtotal remains visibly an incomplete selection, with excluded IDs. Provisional evidence stays provisional even when every selected target has a numeric value.

The finite acceptance fixtures cover 12×10×8 ft → floor/flat ceiling 120 sq ft and gross walls 352 sq ft; 9 ft height → walls 396 while floor/ceiling remain 120. Clearing height leaves appropriate floor/flat-ceiling quantities available and walls incomplete. An explicitly unsupported vaulted ceiling retains its reason and has no verified flat-ceiling result. Separate canonical source values remain exact under metric display. Layout-only zones/cabinets do not add room finish area, and existing explicit surface-opening deductions retain the captured arithmetic.

These are measured finish quantities, **not a complete construction materials or purchasing list**. M7 retains recipes, coverage, accessories, waste policies and purchasing; later trade modules retain their construction/routing models. This report has **no drawing and no print-to-scale claim**. Schematic drawing exports are a separate next slice.

## Retrieval, escaping and browser boundaries

`GET /api/physical-plans/:planId/revisions/:revisionId/export` requires a current server-established session/context, selected workspace, active membership/read permission and matching plan/revision ownership. Strict `format=csv|html` and `unit=ft|m` query controls reject missing, repeated, unknown and unsupported options. Known IDs, stale context or a forged workspace header are not authority. Viewers may export permitted records while existing write restrictions remain unchanged. Revoked membership, logged-out/expired sessions and foreign or mismatched resource IDs fail closed.

The route uses the existing private-response policy, attachment headers and `nosniff`; HTML adds a restrictive CSP and no-referrer policy. Preparing a saved preview does not grant later delivery: download/print fetch that same revision again and recheck current account context. Delayed responses after logout/context change cannot download or retain an old private preview. Workspace-scoped local reports also revalidate their selected account context. Already downloaded files cannot be retroactively recalled, which the interface and report state explicitly.

CSV uses UTF-8 with one BOM, CRLF records, consistently quoted cells and doubled embedded quotes. Formula-like text is prefixed with an apostrophe even when leading whitespace/control characters obscure ASCII or fullwidth `=`, `+`, `-` and `@`. Names containing commas, quotes, CRLF and Unicode round-trip through independent CSV parsers. CSV is a report format, not a lossless reimport of original names with protective prefixes removed. These guards apply to the produced file; third-party spreadsheet save/reopen behavior can strip protection, and universal spreadsheet compatibility is not certified. The saved-download Blob explicitly normalizes text to one BOM because Fetch text decoding can remove the server's marker.

All variable HTML is escaped. The self-contained report contains no scripts, external fonts, images or network requests. Its iframe permits same-origin parent access and modal printing but does not permit scripts. Print opens the browser's own dialog; Save as PDF depends on the browser/OS destination. The report's CSS wraps long names/headings, repeats table headers and preserves pagination without fixed-height clipping. A server-side PDF service, PDF job queue, native printer certification and universal browser/font certification are not included.

## Current-source verification

The final application/configuration/test/migration source is frozen across **317 files**, digest `3983b5b24baedf452dc85c3b4c2973cc4ac9eee2905cb7c12f857285aae83cb9` (CRLF normalized to LF for text; binaries unchanged). Ten application/test paths change. The fresh full sequence completed on this exact source. The isolated, integrated and committed source at `0dffa2d876c69aea76841528dacf9afa7ac34f43` all match its 317 hashes. The full results are reused because application/test/configuration files are unchanged; integration is not represented as another full-suite run. Documentation updates are outside that source set. Original `final-source.json`, `final-checks.json`, command logs and sanitized evidence remain preserved. The [source/check manifest](evidence/MFP_M4C_EXPORT_2026-09-12.json) records the full verification and separate integration evidence.

All full-suite results below come from the fresh final sequence after the last application/test change. The separate canonical build, source comparison and six-check smoke are identified independently; renewed publication authorization did not restart implementation or rewrite the passing source. Existing Node 20.20.2, npm 10.8.2, Playwright 1.55.1 and isolated PostgreSQL 17.5 are used.

| Command or evidence | Actual final result |
| --- | --- |
| `npm ci` | PASS; 508 installed / 509 audited; 26 existing advisories (2 low, 10 moderate, 14 high) |
| `npm test` | **642/642 PASS**, zero failures/skips; existing 618 plus 4 capture and 20 renderer tests |
| `npm run check` | PASS |
| `npm run build` | PASS; existing large-chunk warning retained |
| `npx playwright test --reporter=line` | **186/186 PASS**, zero failures/skips; 9.5 minutes |
| `npm run test:authorization:db` | **15/15 PASS** |
| `npm run test:accounts:db` | **20/20 PASS** |
| `npm run test:accounts` | **32/32 HTTPS + 8/8 browser PASS** |
| `npm run test:physical:db` | **22/22 PASS** |
| `npm run test:physical` | **27/27 HTTPS + 12/12 browser PASS**; includes existing 9 plus 3 dedicated saved-export browser cases |
| `npm run test:journal` | **17/17 real IndexedDB browser PASS** |
| `npm run test:autosave` | **15/15 synthetic OIDC/HTTPS/browser/PostgreSQL PASS** |
| Isolated changed-file whitespace | **PASS across all 10 changed application/test paths** |
| Frozen isolated source equality | **317/317 MATCH** |
| Canonical application working/staged whitespace | **PASS across all 10 integrated application/test paths**; documentation working/staged checks are recorded in the publication receipt |
| Exact integrated and committed source equality | **317/317 MATCH**, digest unchanged; canonical working files and Git archive independently checked |
| Separate canonical build | **PASS**; existing large-chunk warning retained |
| Separate canonical integration smoke | **6/6 checks PASS**, expected application SHA, normal unconfigured composition, zero page errors or API writes |
| Final-source rendered PDF and page inspection | **PASS:** four-page A4 stress report, two rooms, long unbroken ASCII and Chinese/Spanish names; all four pages visually inspected without overflow/clipping; floor 240, allowance 24, adjusted 264 sq ft |

The first full attempt passed 27/27 physical HTTPS tests but only 11/12 physical browser tests: an authenticated CSV download lost its UTF-8 BOM because `Response.text()` removes that leading marker. The bounded application repair normalizes downloaded text to exactly one BOM before creating the Blob; the independent byte assertions remain intact. A subsequent overlapping `npm ci` encountered a locked native `bufferutil` module (`EPERM`), which also interrupted the physical run (9 passed, 1 failed, 2 not run). The three new saved-export browser cases passed in that interrupted attempt, but the attempt is not a full pass. Original `first-full-attempt` and `install-lock-attempt` logs are retained. After every test process had exited, the full sequence restarted against the final digest above with a fresh successful install. No source change was made to resolve the orchestration failure.

The initial 622-test run consisted of the existing 618 plus 4 capture tests before the 20 renderer tests were added. The initial 27/27 physical HTTPS tests, 6/6 targeted local export browser tests, focused 20/20 renderer tests and the initial seven-page A4 report are separate historical development evidence. The initial PDF was rendered with JavaScript disabled and all pages inspected without clipping; the separate final stress report verifies the updated long-heading styles above. None of these earlier targeted runs is combined into a new full-suite pass. Original source copies, intermediate logs and screenshots remain preserved.

The final browser acceptance covers actual downloaded bytes and parsed values, prepared-report immutability, raw-input refusal, unknown/unsupported ceilings, print targeting/real PDF generation, phone layout, saved-revision values despite newer local height edits, revocation before a second download, and logout during a held real response. The saved-export cases use synthetic OIDC/HTTPS/PostgreSQL and verify unchanged revision/receipt counts. The latter race delays only delivery of a real authorized server response; it does not mock identity or report generation.

## Integration and publication checkpoint

Canonical Modern Floor Planner root `C:\Users\aaron\Documents\Codex\Modern Floor Planner`, main branch, origin remote and writer availability were verified. Entry main/origin/main were synchronized at `a679c0504043ec7c4ad52a26601905eef9080d58`; the completed M4B commits remain intact ancestors. The user answered **“please continue”** directly to the exact request to integrate this M4C package, stop only the verified old MFP review process, commit/push and update issues. That authorization resumed publication of the completed implementation.

The exact tested ten-file package was integrated and committed as **`0dffa2d876c69aea76841528dacf9afa7ac34f43`**. Both integrated files and the committed Git archive match all **317** frozen source hashes, digest `3983b5b24baedf452dc85c3b4c2973cc4ac9eee2905cb7c12f857285aae83cb9`. Canonical application working/staged whitespace checks pass; documentation working/staged checks belong to the final publication receipt. The canonical build passed with the existing large-chunk warning. The external archive-verification helper initially expected ZIP without selecting that archive format; its explicit-format rerun passed. That helper-only correction changed no application or test source and was not an application test failure.

Immediately before integration, the existing MFP process **PID 20680** serving `127.0.0.6:5190` was stopped only after its exact command and working directory were verified. That old review origin was not restarted. Owner browser tabs were not inspected, reloaded, closed or operated; browser storage, drafts, stash, archives and isolated source originals remain preserved.

The new normal review at **[http://127.0.0.7:5191/physical-draft](http://127.0.0.7:5191/physical-draft)** was started as **PID 39172** against the expected implementation SHA. It does not contain previous owner drafts. The separate `canonical-export-smoke.result.json` records **6/6 checks PASS** in a new headless context:

1. Expected application commit and normal unconfigured server composition; no session cookie issued.
2. Saved CSV and HTML export endpoints return **503** without configured authentication, failing closed.
3. Actual UI-created 12×10×8 ft room produces **120/120/352 sq ft** floor/flat-ceiling/gross-wall values; CSV and HTML share the same captured snapshot, with one CSV BOM and no source mutation. Unconfirmed source evidence remains provisional.
4. Screenshot captures only the fresh synthetic fixture.
5. Pending height text remains exact and report preparation refuses silently using older committed dimensions.
6. Zero page errors and zero API mutations; no owner origins visited.

Sanitized integration evidence: [six-check smoke result](evidence/m4c-exports-2026-09-12/canonical-export-smoke.result.json) and [fresh synthetic review screenshot](evidence/m4c-exports-2026-09-12/canonical-export-smoke.png). The screenshot was visually inspected without UI overflow and contains no owner data. Retained report artifacts include the [captured quantity PDF](evidence/m4c-exports-2026-09-12/captured-quantity-report.pdf) and [long-name two-room PDF](evidence/m4c-exports-2026-09-12/long-name-two-room-report.pdf).

This normal-composition smoke is separate from the already passed synthetic authenticated HTTPS/PostgreSQL suites. It does not establish live authentication, production database binding, customer readiness or deployment.

The documentation publication is **the commit containing this checkpoint; the GitHub receipt is recorded in #23 after remote verification**. At this checkpoint the implementation exists locally and the ordinary non-force push is still to be completed and verified. Issue #23 may close only after both commits are present on GitHub; #9/#10 remain open. No unrelated work, history rewrite or production operation is included.

**Historical approval block, superseded:** automatic approval review originally rejected the combined fetch/verified listener-stop/canonical-integration command before execution. Its stated reason was that trusted AGENTS instructions covered KC/Rivet and “okay next build” did not explicitly authorize M4C integration; this was not a detected MFP root mismatch. After the user's direct response to the exact authorization question, the guarded integration succeeded. The original `publication-block.json`, `manifest-before-authorized-integration.json` and previous logs remain retained as historical evidence; they do not describe the current integrated state. No alternate path bypassed the control and no feature rebuild occurred.

No live identity provider was registered or verified; production PostgreSQL binding remains **NOT VERIFIED**. No live migration, deployment, service provisioning, customer onboarding or other-product changes occurred. **NOT DEPLOYED.**

## Next bounded feature

After this package's publication is confirmed, the single next feature is **M4C schematic plan-drawing export alongside captured quantities**: preserve labels/openings/levels, identify the same captured source and verify print pagination without scale certification. Project list/duplicate/archive/restore lifecycle follows separately. This completed quantity-report slice does not complete all M4C or M4. M5–M8, the M4A live gate and #4 readiness retain their existing sequence.

## Primary references checked 2026-09-12

Browser Print uses the user agent's print dialog and blocks while it is open: [MDN `Window.print()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/print). Iframe sandbox tokens control same-origin access, scripts and modals separately; this preview never grants `allow-scripts`: [MDN iframe reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe). CSV spreadsheet interpretation makes quoted user text insufficient by itself, including fullwidth triggers: [OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection). These references informed the bounded design; the local tests above establish this implementation's evidence.
