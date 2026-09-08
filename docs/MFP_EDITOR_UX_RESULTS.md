# Sketch selection and opening UX — 2026-09-07

Owning task: [Modern Floor Planner issue #8](https://github.com/armentrout1/ModernFloorPlanner/issues/8), DR-002. The owner explicitly requested whole-house selection/movement, keeping rooms together, individual item editing, label visibility, door swings/sizes, window sizes, and a simpler layout informed by other editors. Baseline: `818f93e4e9c38ff29cc807d8c17075122cf1f165` on clean, synchronized main. The existing Floor Planner task remained the sole checkout writer/release owner. Reviewers researched, reviewed, or drafted outside the checkout. Existing stash and archived unpublished roadmap were retained.

## Interaction decisions and implemented behavior

- **Select all rooms** and guarded Ctrl/Cmd+A select the complete drawing. Select & Move supports Shift-click toggling and one predictable intersecting marquee rule. A selected count and common boundary show the action target.
- **Drag any selected room** to translate the selection by the same model-space delta. Grid/proximity snapping adds one common correction, excluding moving peers. Window-placement constraints compare the proposed moving and stationary sets in both directions; the final snapped position is checked again. A click does not silently snap fractional coordinates.
- **Group rooms / Ungroup** explicitly persist flat membership in optional `room.groupId`. Touching walls do not create implicit groups. Groups do not merge rooms, wall faces, openings, quantities, or physical identities. Selecting a grouped room selects its group. Double-click or Drawing contents allows individual property editing; dragging still moves the group until it is ungrouped. Independent alignment/distribution and transforms cannot silently tear groups apart.
- **Drawing contents** lists rooms and their exact doors/windows. An opening selection clears room selection, so the property panel and delete command identify one target. At this checkpoint, narrow hit strips improved canvas selection; the later owner-assigned door follow-up below also makes the actual swing sector clickable. Door/window controls expose explicit Delete door/window labels. After deletion, selection clears so another Delete cannot remove the parent. Multi-room deletion asks once, and Undo delete restores the complete selection and attached objects.
- **Hide/Show room names** changes visibility only. Saved names and dimensions stay unchanged. Drawing tools remain visible; secondary alignment/transform sections are collapsed initially. The old geometry-changing Center Room action is labeled Reposition Room; Fit drawing remains view-only.
- **Flip hinge / Reverse swing** now change the drawn arc on all four walls as well as the stored settings. This checkpoint labeled the stored hinge side from inside the room; the later door follow-up below corrects displayed handing without relocating saved doors. Existing styles, attachments and custom metadata remain intact.
- **Common door widths** preserve height; custom widths/heights accept positive fractional inches. **Common window sizes** explicitly set width and height, with custom entry available. Examples are nominal choices, not universal standards or rough-opening promises. Invalid/empty entries do not invent dimensions. Widths crossing a wall end or overlapping another opening are rejected visibly.
- Legacy windows with no height remain unknown until an explicit entry/preset. Optional `windowProperties.height` stores entered inches in the legacy sketch. This does **not** activate M3B's physical opening forms, synchronized Quick Rooms or quantity integration; the v2 adapter still retains this new metadata without treating it as confirmed physical input.
- Touch opening drags now complete on release. Escape, blur and touch cancellation clear pending opening moves; a second finger cannot restart a cancelled drag. Existing Ctrl-wheel/pinch, middle-pan and fit behavior remain covered.

The legacy JSON payload and JSONB storage are retained. Optional metadata is explicitly validated without a database migration. No graphics engine, domain quantity policy, partner integration, billing, authentication or hosting change.

## Official documentation comparison

Research was limited to official product documentation and used to choose interaction patterns, not to claim feature parity or copy a CAD interface wholesale.

| Source | Documented pattern | Decision here |
| --- | --- | --- |
| [Floorplanner editor manual, April 2025](https://fpcdn.s3.us-east-1.amazonaws.com/static/brochures/Floorplanner-editor-manual-04-2025.pdf) | Shift/rectangle selection, collective actions, contextual door dimensions and hinge/wall-side settings. | Visible selection and contextual property actions; a contents list adds precise selection of small items. |
| [SketchUp selection](https://help.sketchup.com/en/sketchup/selecting-geometry) and [grouping](https://help.sketchup.com/en/sketchup/grouping-geometry) | Select All, modifier selection, bounding boxes, persistent groups and directional marquee behavior. | Adopt explicit flat groups and visible bounds. Keep one marquee rule; omit nested groups and directional CAD selection complexity. |
| [RoomSketcher doors](https://help.roomsketcher.com/hc/en-us/articles/360000808925-How-Do-I-Add-Doors-to-My-Project) and [room labels](https://help.roomsketcher.com/hc/en-us/articles/360000827169-How-Can-I-Add-and-Move-Room-Names) | Door flip/dimensions and editable room labels. Door dimensions include trim in its documented model. | Compact flip controls and label visibility; keep our measurement basis explicit rather than copying its dimension convention. |
| [RoomSketcher grouping limitation](https://help.roomsketcher.com/hc/en-us/articles/14546892866205-Can-I-Copy-and-Move-Multiple-Items-at-Once) | Does not support arbitrary selected-item grouped sets. | Our explicit room grouping addresses this owner's specific need; do not describe it as copied RoomSketcher behavior. |
| [Sweet Home 3D shortcuts, version 7.0](https://www.sweethome3d.com/storage/SweetHome3DShortcuts.pdf) | Select All, furniture grouping, selection rectangles, pan and pointer-centered zoom. | Keep navigation separate from editing. Its furniture grouping is not evidence of architectural whole-house grouping. |

## Verification

Final checks:

| Check | Actual result |
| --- | --- |
| `npm test` | 204/204 passed; zero failures/skips. |
| `npm run check` | Passed with the existing TypeScript configuration. |
| `npm run build` | Passed; 1,796 modules. Existing Browserslist freshness and bundle-size warnings are nonblocking; no dependency update was added. |
| `npx playwright test --workers=2` | All 71/71 passed in 2.6 minutes, zero retries/skips. Includes seven selection/group tests, four all-wall flip tests, custom size validation, actual opening touch/cancellation, and all previous canvas, opening, recovery, Quick Rooms and quantity parity regressions. |
| `git diff --check` | Passed. |
| Local frontend smoke, `http://127.0.0.1:5173/` | Fresh isolated browser, three fixture rooms grouped, hinge visibly changed from left to right, no uncaught page errors. Mocked persistence responses were intercepted in that isolated browser only; no existing saved plan was accessed. Both screenshots below were inspected. |

![Grouped layout and precise contents selection](evidence/editor-selection.png)

![Selected-door controls and flipped hinge](evidence/editor-door-controls.png)

One full browser checkpoint had 70 passes and one new Escape-cancellation failure. The follow-up probe showed that selecting an opening needed explicit focus and, decisively, gesture cancellation needed capture-phase ordering before parent Escape deselection replaced the listener. The exact case passed after the ordering fix. Ineffective React passive touch cancellation calls were removed in favor of the existing canvas `touch-action` policy; the final touch case also checks that those console errors are absent. The final complete 71-case run above passed after these corrections.

 Earlier checkpoints: 204/204 unit/API/domain checks, 24/24 opening browser checks, and 23/23 selection/canvas/navigation checks passed. Review then identified touch-release/cancellation and grouped-member movement edges; these were fixed and added to the final acceptance suite. The initial typecheck found one Set iteration incompatible with the existing TypeScript target; it was corrected with Array.from without changing compiler settings.

## Release and remaining scope

NOT DEPLOYED. No production smoke, deployment/database/auth binding certification or customer onboarding. Browser persistence tests use the disposable loopback fixture, not production data. Touch verification uses Chromium emulation, not physical phone hardware. The owner's existing app tab was not deliberately reloaded or operated on by acceptance tests; live development updates are distinct from saved-sketch persistence.

General move/resize undo, a full responsive panel redesign, automatic connected-wall topology, physical opening measurement/quantity integration and later roadmap milestones remain separate work. Existing Undo delete remains scoped to room/opening deletions. M3B is still the next eligible canonical milestone on a separate bounded assignment; it has not started. This report is evidence, not a second roadmap.


## Door handing and swing interaction follow-up — 2026-09-07

Explicit owner assignment on issue #8, based on clean synchronized main `6863b1dbf38653edfb0f732ae36a2468e79368f5`: inward LH/RH labels appeared reversed, placement preview changed its swing after placing, and the whole door/leaf/swept area needed selection and double-click hand flipping.

- Hand labels now use the owner's stated viewpoint: back against the hinge jamb, facing the latch; the arm following the opening swing determines the displayed hand. For inward doors this reverses the old inside-view hinge label. Stored `swingSide` keeps its existing geometric meaning, so previously saved doors do not silently flip. Reverse swing keeps the hinge fixed while the displayed arm-hand changes. The UI explains the viewpoint; this does not implement a manufacturer-specific LHR/RHR ordering code. [JELD-WEN's inward handing guidance](https://www.jeld-wen.ca/en-CA/Articles/projects/replacing-exterior-doors) also distinguishes the outside viewpoint from the previous inside-wall label.
- Placement, drag preview, saved rendering and hit sectors now share the same geometry and renderer. A newly created 36-inch door stores the matching 60 drawing-pixel size. Existing saved sizes, styles, IDs, dimensions, positions and custom metadata are not normalized or migrated.
- Click the door bar, open leaf, arc, or actual swept quarter-circle to select that door. Double-click to flip its hand once, preserving inward/outward direction. The swing turns blue when selected. Its square bounding box outside the real sector is not a catch-all target. The existing Flip hinge and Reverse swing controls remain available.
- Drag the wall opening to relocate it. Sector presses only select, and wall-bar movement needs four screen pixels before relocation. Double-click does not bubble into room/group editing. Pan-owned double-clicks are captured, so Hand/Space/Ctrl navigation cannot flip doors.
- Room backgrounds no longer isolate door symbols in separate stacking contexts, so an outward swing can be selected over an adjoining room while remaining attached to its own room. Touch feedback uses the existing highlight without scaling the room geometry.
- Sliding doors retain their style and no swing/hand action is added. Older doors with no `doorProperties` retain their historical display and remain selectable; double-click does not invent missing width/height/hand settings. Their swing editing remains unavailable until an explicit legacy-property workflow is separately added.

Checks for this follow-up:

- `npm test`: 222/222 passed, zero failures/skips, including 18 geometry/hand compatibility tests.
- `npm run check`: passed.
- `npm run build`: passed, 1,797 modules; existing Browserslist age and bundle-size warnings remain nonblocking.
- `npx playwright test tests/browser/editor.spec.ts tests/browser/canvas-view.spec.ts tests/browser/selection.spec.ts tests/browser/quick-room-navigation.spec.ts --workers=2`: 51/52 passed in 3.0 minutes. The one failed assertion counted the temporary preview as a persisted opening because both shared the same test-ID prefix. The inert preview was given a separate marker and hidden from the accessibility tree; no saved opening was created by the cancelled gesture.
- Final affected-case rerun: `npx playwright test tests/browser/editor.spec.ts tests/browser/canvas-view.spec.ts --grep 'door placement on|cancelled pan consumes' --workers=2`: 5/5 passed in 17.4 seconds, including all four preview/placement/save/reload cases and cancelled-pan persistence. Thus all 52 distinct relevant cases have passing evidence; the entire 52-case set was not rerun after the preview-marker-only adjustment. No retries/skips. Typecheck/build were rerun and passed after that adjustment.
- The passing broader run includes all four walls in both directions, leaf/arc/interior hits, exclusion outside the sector, exact persisted hand flips, outward selection over a grouped neighbor, existing styles/windows/custom sizes, touch drag cancellation, group movement, Ctrl-wheel/two-finger zoom and inactive-route keyboard guards. A dedicated test verifies Hand/Space/Ctrl double-clicks and subthreshold bar movement cannot mutate the door.
- `git diff --check`: passed.
- Fresh isolated frontend smoke at `http://127.0.0.1:5173/`: passed sector selection, inward LH/RH mapping and double-click hand flip, with no uncaught page errors. Mock plan responses stayed in the isolated browser; no owner draft or customer record was accessed. Screenshot inspected below.

![Selected door after double-click hand flip](evidence/editor-door-swing-hit.png)

NOT DEPLOYED. Production smoke and deployment/database/auth binding remain unverified. No customer onboarding, schema migration, other-product work or later milestone activation. M3B remains next eligible only on a separate bounded assignment.


## Contextual sidebar tabs follow-up — 2026-09-07

The owner explicitly requested research and replacement of the confusing right-side room accordion. Baseline: clean, synchronized main `fff757de9e340cb07994c2534dd35a6cae097631`; this Floor Planner task remained the integration/release owner. Issue #8 records the bounded DR-002 assignment.

Research findings:

- [Floorplanner's official editor manual, pages 8–10](https://fpcdn.s3.us-east-1.amazonaws.com/static/brochures/Floorplanner-editor-manual-04-2025.pdf) exposes room options and items in that room, and shows an object's sidebar when selected.
- [RoomSketcher's door guide](https://help.roomsketcher.com/hc/en-us/articles/360000808925-How-Do-I-Add-Doors-to-My-Project) shows door properties on the right after selecting the door. [SketchUp Entity Info](https://help.sketchup.com/en/sketchup-ipad/entity-info-panel) likewise shows attributes appropriate to the selected entity.
- Our Room / Doors / Windows tabs are a product-specific simplification of these contextual inspectors, not a claim that those products use this exact layout. The existing Radix/shadcn primitive supplies the roles, relationships and keyboard behavior described in the [WAI-ARIA tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/).

Implemented behavior:

- Selected-room name and top tabs remain visible while the properties scroll. Door/window counts stay visible in compact badges. Repeated Properties headings and the duplicate room-object summary were removed.
- Doors and Windows list only the current room's items. Each button shows its per-type number, wall and width; selecting it highlights the exact opening and displays that same numbered item's existing properties. Door widths use the entered door width where available.
- Clicking a room or opening on the canvas synchronizes the room context and tab. All rooms returns to a flat room list, with no details/summary accordion. Multi-selection keeps its Group/Ungroup/Delete controls; choosing one grouped room edits it individually without changing group membership.
- Browsing an opening tab never chooses an item implicitly. It clears the editing selection while retaining the room context, so Delete/Backspace cannot remove a room merely because its empty Doors tab is open. A real new selection discards old browsing state rather than reviving an unrelated room after deselection.
- Tab mouse presses commit valid focused size fields before Radix unmounts their panel; invalid edits remain unapplied. Arrow keys, Home/End and Enter work through the existing accessible tab primitive. Narrow tab labels and delete actions fit the panel instead of overlapping or clipping.
- No geometry, storage schema, quantity engine, opening placement/dragging/swing logic or saved metadata was changed. This is the requested sidebar improvement, not the full M3C responsive-layout milestone.

Actual checks:

| Check | Result |
| --- | --- |
| `npm run check` | Passed, including after final layout classes changed. |
| `npm run build` | Passed; 1,799 modules. Existing Browserslist age and bundle-size warnings remain nonblocking. |
| `npx playwright test tests/browser/selection.spec.ts tests/browser/editor.spec.ts tests/browser/quick-room-navigation.spec.ts --workers=2` | 42/42 passed in 2.2 minutes, zero retries/skips. Includes five new sidebar cases, exact selection, keyboard navigation, empty-tab Delete protection, size blur commits, stale-context prevention, existing grouping/deletion/recovery, all-wall door/window placement, opening styles/swing/dragging, and route guards. |
| Final layout follow-up: `npx playwright test tests/browser/selection.spec.ts --grep 'narrow sidebar'` | 1/1 passed in 11.3 seconds. Added after visual review found narrow tab-label/delete-button crowding; verifies text and action bounds at 820×900. Only layout classes changed after the 42-case run; that full set was not repeated. |
| Local frontend smoke at `http://127.0.0.1:5173/` | Fresh isolated browser: scoped tabs, exact door/window selection, empty editing target before choosing an item, 1600×1000 and 820×900 screenshots, no page errors. Both final screenshots inspected. Mock plan responses were isolated; the owner's tab/drawing was not reloaded or altered. |
| `git diff --check` | Passed. |

Unit/API/quantity suites were not repeated for this sidebar-only change; no calculations or persisted model changed. This follow-up adds six meaningful browser cases rather than duplicating implementation in unit tests.

![Room-scoped door tab and exact selection](evidence/editor-sidebar-tabs.png)

![Readable sidebar tabs and window controls at narrow width](evidence/editor-sidebar-tabs-narrow.png)

Producer-verified locally; NOT DEPLOYED. Production smoke and deployment/database/auth binding remain unverified. No customer onboarding, migration or other-product changes. No known blocker remains for this bounded sidebar acceptance. Full phone layout work remains separate; M3B is still next eligible on a separately authorized assignment.
