# MFP-M3C responsive layout and focus results

Date: 2026-09-08. [Issue #15](https://github.com/armentrout1/ModernFloorPlanner/issues/15).
Entry main/origin/main: fccdde7c142aaec1c4a005021680fd9b174fadb0.
Application/test commit: eeb4f9c7c3ae539b8c0888855ade23eaba50b5c3. Documentation commit: recorded separately in Git history for this result document.
Publication verification: Normal main publication and final remote equality are recorded in issue #15 after the documentation commit.

Final decision: **M3C COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED**.

M3B, field Revert #12, manual physical view tabs #13 and committed Undo/Redo #14 retain their recorded completion. This assignment implements and verifies the already-agreed remaining responsive/layout and focus requirements. It does not rebuild those predecessors.

## Resulting behavior

The existing unified physical workflow uses one docked inspector on wide layouts and a deliberate modal inspector on narrow layouts. The actual boundary is 1024 CSS px: below that, Drawing provides a named Edit selected room/opening control. Quick Rooms keeps its primary room form directly available. Selecting or beginning to drag an opening does not unexpectedly open a drawer or swallow the gesture.

Physical drawing names and dimensions share a spaced annotation stack; name badges use one line with ellipsis so enlarged names do not cover dimensions; the full names remain available in the wrapping room selector, inspector and accessible room target. The drawer has an accessible target title, reserved visible Close control and bounded internal scrolling. Forms, quantity cards, target lists, long names and errors shrink or wrap within the available width. Container-width-driven quantity/opening grids preserve readable controls without shrinking the text. The drawing retains its own bounded two-dimensional pan surface while the surrounding page remains scrollable.

A single target and interactive inspector avoid duplicate writable fields or IDs. The provider, measurements, raw fields, request, evidence and history coordinator remain outside responsive inspector remounts. A view-only transition defers unintended blur/composition commits, preserves the pending field's unit context and restores focus to an appropriate surviving control. This includes close/reopen and both breakpoint directions. Ordinary Apply/Enter and ordinary user blur continue through the existing commit behavior.

Escape has one owner: the active preset, the existing pending field's Revert, or the active dialog/drawer. Modal background interaction is blocked and focus stays within the active layer. The prior review dialog keeps its own entry and return-focus behavior. Late portal cleanup preserves focus already transferred into the docked inspector.

Locate source reveals and highlights the drawing without changing work scope or unnecessarily opening the inspector. Edit source opens the intended target. A removed target clears or closes its inspector safely; opening recovery still uses the existing guarded general/targeted history boundaries. Changes to the interaction surface cancel unfinished drawing gestures, and later opening movement reads current viewport coordinates.

These are bounded UI changes. React/Vite, the renderer, shared measurement and quantity contracts, history semantics, source data and snapshot formats remain in use. No new room/group movement, levels, stairs, material purchasing or financial engine is included.

## One fresh final verification

Runtime: Node 20.20.2, npm 10.8.2, Playwright 1.55.1.
Final source manifest: [exact source and check hashes](evidence/MFP_M3C_LAYOUT_FOCUS_2026-09-08.json).
Existing baseline retained: 399 unit and 143 browser cases. Added cases: 0 unit and 7 browser.
Selector changes for the intentional drawer: physical-journey.spec.ts, physical-openings.spec.ts and physical-revert.spec.ts now explicitly open/close the narrow drawer before accessing controls. Their behavioral assertions are retained; the other 41 predecessor test files are unchanged.
Application/config/dependency scope: 240 non-document source files are frozen and match canonical. Changed files are limited to the responsive shell, form/quantity layout, opt-in physical annotation spacing, input focus/gesture integration, browser zoom metadata and tests; no dependencies, schemas or quantity engine changes.

| Check | Actual result | Duration |
| --- | --- | --- |
| npm ci | PASS; 505 packages installed, 506 audited | 12.57s |
| npm test | 399/399; zero failures/skips | 3.46s |
| npm run check | PASS | 6.12s |
| npm run build | PASS | 4.63s |
| npx playwright test --reporter=line | 150/150; zero failures/retries/skips | 403.29s |
| git diff --check / staged whitespace check | PASS, unstaged and staged application diff | not separately timed |

Earlier attempts and bounded repairs, reported separately: Initial focused run: 4/7 pass. One real unbroken-name overflow was repaired with shrinkable wrapping text; two fixture assumptions (source row identifier and recovered Door 1 selection) were corrected. A later 6/7 run exposed a helper race immediately after resize; helpers now wait for the responsive opener/dock contract. Visual inspection then found enlarged room-name badges covering drawing dimensions. Truncation alone passed Alpha but a strengthened text-range assertion showed a 19.93px overlap in smaller Beta. An opt-in physical annotation stack plus single-line name ellipsis now separates names from dimensions without reducing text size; the legacy RoomBox default is retained, and full names remain in the selector/inspector/accessible room target. The first full run was intentionally interrupted at case 42 to make this repair; its logs/source are preserved as pre-label-full-* and are not a full-suite pass. These failures and traces remain in local evidence; only the fresh full run above establishes the final pass. The initial missing harness module ran zero tests and was corrected before testing.
Install/build advisories: npm ci reports the existing 28 advisories (4 low, 10 moderate, 14 high). Build retains the large-chunk and outdated Browserslist-data warnings. No unrelated dependency upgrade was performed.

## Acceptance matrix for all existing M3C requirements

The initial finite checklist is retained in issue #15 and the local evidence folder. All mapped cases below passed in the final full-source run.

| Retained completed capability | Prior evidence | Current preservation result |
| --- | --- | --- |
| M3B physical inputs, openings, quantities, review and recovery | [M3B results](MFP_M3B_RESULTS.md), issue #10 | PASS in the current 399-unit / 150-browser full run; existing behavioral assertions retained. |
| Legacy panels, centering, selection, opening controls and pan/zoom | [Editor UX](MFP_EDITOR_UX_RESULTS.md), [centering](MFP_CANVAS_CENTERING_RESULTS.md), [pan/zoom](MFP_CANVAS_PAN_RESULTS.md), issue #8 | PASS in the current 399-unit / 150-browser full run; existing behavioral assertions retained. |
| Revert and pending-field Escape | [Revert results](MFP_M3C_FIELD_REVERT_RESULTS.md), closed #12 | PASS in the current 399-unit / 150-browser full run; existing behavioral assertions retained. |
| Manual view tabs and inactive-view protection | [View-tab results](MFP_M3C_VIEW_TABS_RESULTS.md), closed #13 | PASS in the current 399-unit / 150-browser full run; existing behavioral assertions retained. |
| Committed Undo/Redo and recovery boundaries | [Undo/Redo results](MFP_M3C_UNDO_REDO_RESULTS.md), closed #14 | PASS in the current 399-unit / 150-browser full run; existing behavioral assertions retained. |

| ID / requirement | Completed basis -> current package | Current proof / outcome |
| --- | --- | --- |
| LF-01 Wide docked layout | Retain existing docked editing; now bound inspector width, shrink children and reserve controls. | T1: 1600x900 and 1280x720, populated canvas and dock, no page overflow or obscured controls. PASS in the final full suite; source/check hashes above. |
| LF-02 Narrow inspector | Inline narrow inspector becomes one deliberate drawer; Quick Rooms primary form remains available. | T2/T7: 820x1180, 390x844, 844x390 and 320 CSS px; correct accessible target, exactly one interactive inspector, scrolling reaches fields/presets/Revert/actions. PASS in the final full suite; source/check hashes above. |
| LF-03 Modal focus and Escape | Preserve review, Revert and menu ownership inside new layout. | T2/T5/T7: entry/Tab/Shift+Tab, inert background, preset Escape, field Escape, drawer dismissal and return; separate review modal restores its trigger. PASS in the final full suite; source/check hashes above. |
| LF-04 Pending text and composition | Existing raw state remains authoritative through close/remount/view changes. | T3 plus retained Revert/history cases: valid and invalid pending room/opening/waste text, exact original units, caret, delayed compositionEnd and no unintended domain/request/evidence changes. PASS in the final full suite; source/check hashes above. |
| LF-05 History/provider lifetime | Preserve completed chronological coordinator and redo branch. | T3 plus history regressions: layout-only actions keep labels, availability and registry/history state; no new transactions or confirmation. PASS in the final full suite; source/check hashes above. |
| LF-06 Breakpoint focus and scroll cleanup | New modal locks/remounts cannot strand focus or lock page scroll. | T3/T6: 1023 -> 1024 and reverse, field counterpart focus, no hidden/detached focus, body usable after closing, target/raw state preserved. PASS in the final full suite; source/check hashes above. |
| LF-07 Reflow, short height and enlarged text | Existing viewports retained; full populated long-label and short-height proof added. | T1/T7: 200% root font size, 320 CSS px, 844x390 landscape, unbroken room name, last preset accessible, focused invalid input and partial quantities reachable. PASS in the final full suite; source/check hashes above. |
| LF-08 Synchronized inputs and takeoff | Retain shared physical document and engine through inspector relocation. | T1/T2/T7 and M3B journey: fixture 120 floor/ceiling, 352 gross walls, 319 net walls, 41 baseboard/shoe, 132 floor with 10% waste; cleared window height yields unavailable full net walls and explicitly partial 256 subtotal. PASS in the final full suite; source/check hashes above. |
| LF-09 Updated drawing coordinates/cancellation | Retain exact opening identity, styles and atomic gestures after layout changes. | T4 plus opening regressions: four clockwise walls, representative zoom, post-drawer/resize bounds, correct offset, unrelated rooms unchanged, canceled gesture no mutation. PASS in the final full suite; source/check hashes above. |
| LF-10 Locate versus Edit source | Preserve scope/view/edit separation. | T5: Locate keeps selection/request and reveals highlight; Edit opens correct inspector; work-scope controls stay independent. PASS in the final full suite; source/check hashes above. |
| LF-11 Removal and coordinated recovery | Existing target deletion/Undo remains guarded. | T6: safe disappeared-target focus, general Undo/Redo then targeted recovery without duplicate restore or stale inspector. PASS in the final full suite; source/check hashes above. |
| LF-12 Navigation/reload/standalone compatibility | Retain temporary recovery, independent originals and quantity/snapshot parity. | T3, full prior suites and disposable standalone smoke: exact latest document/request/evidence/pending raw text recovers; history empty after reload; / and /quick-room still work. PASS in the final full suite; source/check hashes above. |

Case references from tests/browser/physical-layout.spec.ts:

- T1: docked inspectors retain the populated fixture at desktop widths and enlarged text
- T2: narrow inspector edits synchronize fields and drawing with one focus trap and one Escape owner
- T3: breakpoint transitions preserve pending text caret units and redo, then reload the latest temporary draft
- T4: opening gestures use current resized bounds on every wall and cancel when the surface changes
- T5: Locate source preserves selection and scope while Edit source opens the intended narrow inspector
- T6: deleting a drawer target restores logical focus and both guarded opening recovery paths
- T7: 320px and short-landscape reflow keep invalid drawer fields, focus and explicit partial takeoff reachable

## Exact viewport and text method

Viewport sizes are CSS pixels: desktop 1600x900 and 1280x720; tablet 820x1180; phone portrait 390x844; short landscape 844x390; narrow reflow 320x844. The actual inspector breakpoint is tested in both directions at 1023/1024 px.

The increased-text case injects a root rule with font-size: 200% !important, checks layout and input focus, then removes it. This tests enlarged root-relative text/layout. It is not a native desktop browser-zoom test. The 320 CSS px viewport tests narrow reflow; the viewport meta check verifies that browser zoom is not disabled. Do not describe either as physical-device or native-browser-zoom certification.

Short available height and Chromium touch/viewport emulation do not prove behavior with a physical phone's software keyboard. Retain that limit explicitly.

## Genuine screenshots and separate smoke

- [Desktop docked inspector](evidence/MFP_M3C_LAYOUT_DESKTOP.png)
- [Phone drawer and visible invalid input](evidence/MFP_M3C_LAYOUT_PHONE_INVALID.png)
- [Partial net-wall takeoff](evidence/MFP_M3C_LAYOUT_PARTIAL.png)
- [Keyboard focus / enlarged text](evidence/MFP_M3C_LAYOUT_ENLARGED.png)

Visual inspection findings: Reviewed all six genuine final-source screenshots. The local `final-screenshot-manifest.json` records the original artifact paths, image hashes/dimensions, and exact final source-manifest/test hashes. Long full-page images were inspected in consecutive original-scale crops without modifying the originals.

- **Desktop:** `final-layout-desktop-docked.png` shows the single docked inspector beside the drawing. Room labels and dimensions are distinct. The complete fixture displays 120 floor, 120 ceiling, 352 gross walls, 319 net walls, 41 baseboard, 41 base shoe, and 132 floor quantity after 10% waste. No visible encoding corruption or ordinary-content width clipping.
- **Phone and 320px:** `final-layout-phone-invalid-drawer.png` and `final-layout-narrow-invalid-drawer.png` show Window 1, visible Close and Revert controls, the rejected 99 ft height, wrapped error text, and a clear focus outline. Labels and fields fit the available width. Native select text may truncate within its control; full room names remain in the selector options and page room list.
- **Short landscape:** `final-layout-landscape-invalid-drawer.png` keeps the title and Close in view at 844 by 390. The form scrolls internally, the focused invalid input is visible, and the background is dimmed. The associated browser assertions verify focus containment, blocked background selection, and access to the last preset within the bounded menu.
- **Partial takeoff:** `final-layout-phone-partial.png` shows the full net-wall total explicitly unavailable and the provisional subtotal of 256 sq ft with the top wall excluded. Long unbroken target names wrap; floor remains 120 + 12 = 132 and baseboard/base shoe remain 41. The drawing retains local two-dimensional scrolling independently of the page.
- **Enlarged text:** `final-layout-enlarged-text.png` uses the explicitly tested CSS `:root { font-size: 200% !important; }` at 1280 by 720. Controls, focused opening fields, targets and quantities remain readable. Full-sized room-name badges are truncated within their available width and stacked separately from the dimension annotations; both Alpha 12 by 10 and Beta 8 by 6 remain unobscured. Full room names remain in the room buttons and accessible room names.

No remaining visual blocker was observed in this finite final-source matrix. These checks do not claim native browser-zoom certification, physical-device or hardware-keyboard testing, screen-reader certification, a complete WCAG audit, or a measured customer pilot. Historical failed screenshots and repair verification are preserved separately in `visual-review-history.md` and their original artifact directories.

Verified safe local review URL: http://127.0.0.1:5183/physical-draft.
Source/listener/HTTP evidence: Canonical source eeb4f9c7c3ae539b8c0888855ade23eaba50b5c3; listener PID 36008; HTTP 200.
Separate canonical smoke: 2/2 PASS, 14.16s, fresh disposable browser contexts on canonical review. No page errors or non-read API writes. Console-error capture is not claimed.
This smoke is separate from the full suite. Production/deployment smoke is NOT VERIFIED; the product remains NOT DEPLOYED.

## Owner work and release limits

Owner 5182 protection: The verified 5182 watcher PID 16556 (parent 40380) was stopped immediately before integrating tested files to prevent HMR into unsaved owner work. That protected origin was not restarted. The next unused origin 5183 is used solely to avoid reconnecting the owner tab to changed code; it does not copy drafts. No owner tab is a fixture or a place to reload a draft. Do not create a new port just to label this task; report the actual safe integration route. A different origin does not transfer old draft storage, and browser memory is not saved in Git.

Original imported source, independent standalone documents, historical snapshots, retained stash and roadmap archive: Stash 779950aeaa1b81fc8955ad8f399ab87ae5e59063 and original roadmap archive SHA256 4AA44769A3AF1CC8A4FE940B09E024109FEA19630F61181772B42F7EFDB7BCF1 are unchanged. Owner tabs/storage were not inspected, reloaded, or used for testing; isolated copies carried no owner environment or browser data. No destructive migration, force reset/push, customer onboarding, hosting or other-product repository change.

Recovery remains temporary and same-tab. There is no verified account saving, database persistence, production identity/access isolation or partner integration. No complete WCAG, screen-reader or physical-phone certification is claimed. The WAI guidance informed the bounded implementation and tests:

- [Modal dialogs](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum)
- [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow)

M3B issue #10 stays open for release; #2 remains unreleased; hosting #4 stays PROPOSED; CRM work stays separate. The four-of-five users / under-two-minutes pilot target remains unmeasured unless a real pilot was performed; it is not a new local completion gate.

## Three owner checks in a disposable draft

1. Create a 12x10x8 ft room. In Drawing, open the selected room inspector on a narrow screen, change ceiling height to 9 ft, then Undo. Floor/flat ceiling stay 120 sq ft; gross walls change 352 -> 396 -> 352 sq ft.
2. Leave an unfinished opening width, close/reopen the drawer and resize wide/narrow. The exact text and history stay; Revert restores only that field. Try preset Escape, field Escape and drawer Escape separately.
3. Locate a takeoff source, then Edit in inspector. Only Edit opens the drawer. For the documented door/window fixture, clear window height to see incomplete full net walls and the 256 sq ft partial subtotal; reload only this disposable tab to verify temporary recovery and empty history.

## M3C decision and next existing slice

**M3C COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED**. All agreed local LF-01–LF-12 criteria and retained regressions pass; no remaining local M3C blocker. Release limits below remain unchanged.

After verified completion, the existing proposed next slice is **M3D level ownership and level selector BEFORE stairs**. Follow the existing lossless/versioned legacy adapter and active-level scope boundaries; historical unknown ownership stays unassigned. M3D is not implemented or started by this package. Stop after the evidence-based M3C decision and publication.
