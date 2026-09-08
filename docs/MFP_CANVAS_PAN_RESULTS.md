# Mouse-pan repair — 2026-09-07

Issue [#8](https://github.com/armentrout1/ModernFloorPlanner/issues/8), DR-002. Assigned scope: the owner's middle-button grid movement defect and its existing Hand/Space pan paths. **PRODUCER_VERIFIED locally; NOT DEPLOYED.**

Implementation: `09675778f5ff55b7f996c3e2ac31582d1db1f22c`.

Baseline/rollback reference: `104e6fa9295b21f6d832221f4366d44591269ad9`, verified `main` tracking `origin/main` in `armentrout1/ModernFloorPlanner`. Safe entry/pre-release fetch found no divergence. The existing Floor Planner task is the sole observed writer/release owner; reviewers were read-only. Retained M1 stash and archived original roadmap were verified intact. `docs/BUILD_ROADMAP.md` remains canonical.

## Behavior and cause

Hold the middle mouse button and drag to pan; the drawing follows the pointer in screen pixels and stops when released. Hand mode and Space+left drag use the same gesture path; enabling either alone does not move the view. Normal wheel scrolling remains available, and shortcut help now describes it correctly.

The previous editor started its own middle-button pan without cancelling native browser autoscroll. Those mechanisms could move in opposite directions, consistent with the owner's circular cursor, fast motion and reversal report. Hand/Space also started active movement before a held drag, using stale pointer coordinates. Room/opening/resize descendants could intercept middle presses, and opening placement preceded the pan handler.

The new mouse-pan hook captures gestures before descendant editing, cancels native defaults, and stores the pointer anchor in a ref. It applies one screen-pixel delta per move regardless of zoom and updates the anchor at scroll limits so reversal responds immediately. Pan ownership persists through cancellation and every swallowed button release; trailing clicks cannot select rooms or place openings. Release outside the grid, Space release, Escape, blur, missing held buttons and inactive navigation stop movement. Leaving a door/window hover preview now clears it rather than placing an opening.

No room/opening schema, IDs, coordinates, style, dimensions, calculation, save format, touch-gesture engine, dependency or runtime change. Previous fit/centering behavior is retained. No database/production operation or changes to other products.

## Checks

Environment: Windows, Node 20.20.2, npm 10.8.2, TypeScript 5.6.3, Vite 5.4.14, Playwright 1.55.1 Chromium; existing dependencies, no new installation.

- `npm test`: **201/201 passed**, no failures/skips, 1.18 s.
- `npm run check`: **passed**.
- `npm run build`: **passed**, 1,793 modules, Vite 3.16 s and server bundle 6 ms.
- Final `npx playwright test`: **55/55 passed**, one worker, no retries/skips, 1.9 min.
- `git diff --check`: **passed**.

Six new browser regressions supplement all 49 prior tests: exact small bidirectional movement at 100% and reduced zoom; starts over grid/rooms/openings/resize handles in each tool; native default cancellation; unchanged save data; outside release and immediate scroll-limit reversal; Hand/Space readiness; cancellation/navigation/wheel behavior; pending-opening protection and both orders of a two-button release. No existing expectations were weakened. Tests compare actual rendered movement and saved geometry, not only internal state.

Intermediate checks exposed cancellation/hover-leave placement defects, corrected before final acceptance. The first default-cancellation probe sampled too early in event propagation; final tests retain the native event and inspect its cancellation after dispatch. A Set-spread typecheck failure was corrected with Array.from for the existing compiler target. Existing stale Browserslist data and browser fixture color-environment warnings remain nonfatal.

## Local smoke and remaining limits

A fresh isolated browser against the running frontend at `http://127.0.0.1:5173/` drew two rooms and exercised tiny moves, reversals and release: native default cancelled, maximum screen-pixel error **0**, release stopped movement, geometry unchanged, no page errors. The owner's existing browser/sketch was not reloaded or edited. Persistence regressions use the disposable loopback fixture, not a hosted database.

This verifies browser input dispatch and application behavior; it does not certify the physical mouse's firmware or visually inspect the operating system's native autoscroll overlay. The selected interaction deliberately uses hold-and-drag with a grabbing cursor, not click-to-latch autoscroll.

Deployment/production smoke: **NOT VERIFIED / NOT DEPLOYED**. The owner reports no hosting yet. No database/auth binding is certified or customer onboarding enabled.

Assigned pan acceptance: **complete locally**, no known blocker for this bounded repair. Select All/group movement remain proposed in open issue #8. Next canonical build task remains M3B on a separate bounded assignment; it has not started. M1 #2 is unreleased and hosting/runtime #4 remains proposed.


## Zoomed-out grid follow-up — 2026-09-07

Separate bounded owner repair, baseline `2805e3049548696c4274fe263673b02ba3709f38`: remove the duplicate background from the transformed drawing plane. One grid now renders on the stage with the original zoomed spacing/origin and screen-pixel lines. This prevents the white rectangle/subpixel grid disappearance without changing geometry, event handlers or physical units.

Actual checks: `npm run check` and `npm run build` passed; four existing browser cases (near/far/negative fit and scaled opening placement/save/resize) passed in 17.0 seconds. Fresh isolated local frontend captures at 100%, 48%, 23% and 11%; the 48%/11% screenshots were visually inspected and show a continuous grid. Room geometry unchanged, zero page errors. Existing full-suite results above belong to the prior pan repair; the full suite was not rerun for this rendering-only change. No new dependency or migration; retained work preserved. PRODUCER_VERIFIED locally / NOT DEPLOYED; issue #8's selection/group work remains proposed.


## Ctrl-wheel and two-finger zoom — 2026-09-07

Bounded owner assignment, baseline `f7127217ded40b0df9be73272d29d965be28503e`: Ctrl+wheel now zooms at the pointer; two fingers smoothly zoom and move the drawing around their midpoint. Gesture zoom is bounded to 2%–800%. Canvas-scoped nonpassive capture prevents native page zoom and descendant edits during these gestures; plain wheel scrolling and page interactions outside the canvas retain their existing behavior. Pinch takeover cancels unfinished drawing/drag/resize/placement, keeps ownership through a partial finger lift, and lets child pressed feedback clean up. The existing stepwise, background-only pinch handler was removed; no physical geometry or API change.

Actual validation: `npm run check` passed; `npm run build` passed (1,794 modules, Vite 2.94s, server bundle6ms); `npx playwright test tests/browser/canvas-view.spec.ts tests/browser/editor.spec.ts tests/browser/quick-room-navigation.spec.ts` **36/36 passed**, no retries/skips, 1.9min. Three new browser cases verify Ctrl-wheel pointer anchoring/scope/plain scroll, continuous pinch ratios over rooms/doors/windows, safe partial release, unchanged save data and fresh drawing after all fingers lift. Existing fit/pan/opening/style/keyboard/recovery and inactive-navigation checks pass. The unrelated quantity and Quick Rooms form suites were not repeated for this gesture change.

Fresh isolated local frontend smoke at390×844 with two rooms and browser-generated touch input: requested pinch ratios1.4/0.8 measured1.39999984/0.79999995; anchor error0.20/0.40 CSS pixels; geometry unchanged, no page errors. This is Chromium touch emulation, not physical iOS/Android hardware certification. The initial partial-release test used the wrong CDP event; a direct browser probe established touchEnd with the released ID, and the corrected test observes a real touchend with one remaining finger. No product validation was relaxed.

Assigned gesture acceptance complete locally, **PRODUCER_VERIFIED / NOT DEPLOYED**. Saved sketches and retained work preserved; no provider/database/auth change or production operation. Select All/group movement remain proposed in open issue #8; M3B remains the next separately assigned canonical task.
