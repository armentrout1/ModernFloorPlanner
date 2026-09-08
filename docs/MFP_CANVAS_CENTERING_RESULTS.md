# Sketch centering repair — 2026-09-07

Issue: [#8](https://github.com/armentrout1/ModernFloorPlanner/issues/8), DR-002, **centering/view-controls slice only**. Status: **PRODUCER_VERIFIED locally; NOT DEPLOYED**.

The owner's request to center the project activates this bounded repair. Select All and group movement remain proposed. M3B and the broader responsive editor redesign have not started.

## Change and preservation

Baseline/rollback reference: `76fd4d65be0f1f6a276f64f5d8e68f5224a69f3e`.
Implementation: `6bb528c3a54a8987d0594e51ad67de90b6b64d9f` on verified `main`, tracking `origin/main` in `armentrout1/ModernFloorPlanner`. Entry and pre-commit fetch found no remote divergence. Observable task/process checks found no competing writer; this Floor Planner task owns the release. Retained M1 stash and the archived original roadmap remain intact. The canonical roadmap remains `docs/BUILD_ROADMAP.md`.

The drawing container previously exceeded the panel's visible height, hiding its bottom controls. Fit also requested negative browser scroll positions near the origin, which browsers clamp; the fixed drawing extent limited far-edge centering.

- Bound the canvas to its actual panel and reserve a wrapping footer for totals and a visibly labeled **Fit drawing** button.
- Add view-only scroll gutters and bounds that accommodate near-origin, far-away and negative room coordinates. Fit uses the visible client area; selected-room centering, zoom and viewport resizing preserve the intended view.
- Preserve the drawing element's model-coordinate reference for placement and dragging. Initial transitional panel sizes do not shift the origin; whole-pixel gutters preserve existing pointer alignment. User panning back to an earlier fitted position remains the current view when resized.
- Room coordinates, dimensions, IDs, opening styles/attachments, quantity calculations and legacy save/API formats are unchanged. No migrations, dependency/runtime changes, provider provisioning or production data operations.

## Actual final checks

Environment: Windows, Node 20.20.2, npm 10.8.2, TypeScript 5.6.3, Vite 5.4.14, Playwright 1.55.1 Chromium. Existing installed dependencies were used; this repair did not rerun `npm ci`.

| Check | Result |
| --- | --- |
| `npm test` | **201/201 passed**, 0 failed/skipped, 1.15 s |
| `npm run check` | **Passed**, TypeScript exit 0 |
| `npm run build` | **Passed**, 1,792 modules; Vite 2.87 s and server bundle 6 ms |
| `npx playwright test` after the build | **49/49 passed**, one worker, no retries/skips, 1.4 min |
| `git diff --check` and staged whitespace check | **Passed** |

All 43 existing browser regressions remain unchanged and pass, including legacy door/window placement on all walls, dragging between walls/rooms, styles and resizing, save/reload, deletion/recovery, keyboard guards, Quick Rooms navigation and shared-engine parity. Six new browser tests cover three-room fit at near/far/negative coordinates, repeated fit, zoom, selected-room centering, pan away/back plus resize, unchanged saved geometry, scaled opening placement and controls at narrower sizes. New view tests observed no page errors.

Intermediate full-suite runs exposed opening-drag regressions from transitional panel sizing and subpixel gutters. Those defects were fixed before the final successful run; no existing expectations were weakened. The build still prints the existing stale Browserslist-data advisory; browser fixtures print color-environment warnings. Neither caused a check failure.

## Local workflow evidence and limits

A fresh isolated browser against the running Vite frontend at `http://127.0.0.1:5173/` drew three rooms and fitted them: center error **0 px horizontally, -0.5 px vertically**, no page errors. The owner's existing browser/sketch was not reloaded or edited by this check. Save/reload acceptance used the disposable loopback fixture API, not a hosted database.

Final fixture screenshots were visually inspected at [desktop 1440×1000](images/canvas-centering-desktop.png), [tablet 820×720](images/canvas-centering-tablet.png) and [phone 390×844](images/canvas-centering-phone.png). The drawing is centered and footer totals/navigation do not overlap. Phone/tablet viewport emulation verifies this bounded behavior only: the legacy sidebars remain cramped at narrow widths and broader responsive editor work is still deferred.

Deployment SHA/ID and production smoke: **NOT VERIFIED / NOT DEPLOYED**. The owner reports that this app is not hosted. No hosting, database or authentication binding was introduced or certified; no customer onboarding through unscoped plan access is authorized.

## Acceptance and next work

The assigned centering repair is complete locally with no remaining blocker for this slice. Issue #8 stays open because its Select All/group movement and related selection/help work are still proposed. Sidebar **Center Room** still repositions one room; use **Fit drawing** to center the view.

The next eligible canonical build task remains **M3B**, on a separate bounded assignment. M3 as a whole is incomplete; M1 #2 remains unreleased and hosting/runtime #4 remains proposed. This repair does not activate them.
