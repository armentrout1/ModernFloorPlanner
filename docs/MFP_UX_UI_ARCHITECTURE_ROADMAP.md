# Modern Floor Planner UX/UI architecture and build roadmap

- Date: 2026-11-06
- Version: 1.4
- Status: PACKETS 1–3 DEPLOYED AND LIVE-VERIFIED
- Baseline reviewed: `a80ccbd1c72e9825f72c1694d6e2e66b43f2c0e3` on `main`
- Packet 2 implementation: `933a7ba0329bda2236a15fd8a6e6e3bdbed03aef` on `main`
- Packet 3 implementation: `07c39cc7489cc9f957e636115b521f72b7f744fc` on `main`
- Owning requirement: [issue #29](https://github.com/armentrout1/ModernFloorPlanner/issues/29), `MFP-UX-CANVAS-SHELL`
- Primary workflow: the main sketch editor at `/`
- Related architecture: [area calculator blueprint](MFP_AREA_CALCULATOR_BLUEPRINT.md) and [canonical build roadmap](BUILD_ROADMAP.md)

## Purpose and authority

This document is the product rulebook for placing controls and growing the Modern Floor Planner editor. It defines:

- what each permanent interface region is for;
- where existing commands will move;
- where future tools are allowed to appear;
- how the left tool system, right inspector, canvas controls and status bar behave;
- how the interface adapts across desktop, tablet and phone widths;
- how the redesign will be delivered and verified in bounded packets.

This roadmap governs the main sketch editor shell. Quick Rooms at `/quick-room` and Unified Physical Draft at `/physical-draft` remain separate workflows with their existing data and recovery contracts. They should follow the same design principles over time, but this roadmap does not merge the routes, duplicate their engines or silently move user work between them.

The canonical product build sequence remains [BUILD_ROADMAP.md](BUILD_ROADMAP.md). This document is the controlling UX placement architecture for editor-shell work activated under issue #29. An implementation packet begins only when the owner explicitly advances that packet.

## Executive decision

Modern Floor Planner will use a **canvas-first, progressively disclosed editor shell**.

The target shell has five permanent responsibilities:

1. a two-row document header for plan identity and high-frequency document actions;
2. a three-state left tool system for creating and transforming plan content;
3. the drawing canvas as the dominant work surface;
4. a contextual right inspector for the current selection and related results;
5. a thin bottom status bar for information and view state.

No new feature receives a new permanent toolbar, full-width strip or floating panel merely because space is available. Every feature must fit an existing responsibility or propose an explicit architecture amendment.

The left tool system cycles one state per activation:

`expanded panel -> icon rail -> hidden -> expanded panel`

From expanded, one activation produces the icon rail, a second fully hides it, and a third restores the expanded panel. The current state is visible, keyboard accessible and remembered on the device.

## Product language

Use these terms consistently in issues, components, tests and user-facing help:

| Term | Meaning |
| --- | --- |
| Account workspace | The authenticated team/tenant selected near the avatar. It is not a canvas or panel. |
| Plan | The floor-plan document currently being edited. |
| Editor shell | The header, tool system, canvas, inspector and status bar surrounding a plan. |
| Tool rail | The icon-width left state containing primary tool categories and actions. |
| Tool panel | The expanded left state containing icons, labels, groups and supporting controls. |
| Inspector | The right-side contextual editor for the current room, opening, object or selection. |
| Focus mode | The shell state with the left tools hidden and nonessential panels minimized. |
| Status bar | The thin informational strip below the canvas. |
| Plan menu | The document-command menu containing New, Open, Save As and related plan actions. |

Do not label the drawing canvas itself a workspace. That would conflict with the authenticated account workspace.

## Current-state diagnosis

At the reviewed baseline, the main editor distributes controls across more surfaces than the product can sustainably grow:

1. identity header row;
2. action header row;
3. a separate full-width side-panel toggle strip;
4. left Tools & Actions panel;
5. right Properties or Materials panel;
6. floating canvas navigation controls;
7. bottom area, view and preview controls.

The current implementation also has overlapping responsibilities:

- Fit/reset/navigation controls appear in both the floating cluster and bottom controls.
- File commands, workflow navigation, undo, materials, keyboard help and view actions share one action row.
- The side-panel toggle strip spends full canvas width on two small controls.
- The right panel remains visible even when its empty state has little value.
- The left panel repeats a panel title, a Tools heading and accordion section headings.
- Adding tools by appending buttons would reduce canvas space and increase scanning time.

The current functions are not being removed. The redesign changes their presentation and hierarchy while retaining their behavior.

## Research basis

The adopted architecture is informed by current or published official product guidance:

- RoomSketcher exposes commonly used features in a top toolbar and groups broader project/tool actions behind its menu: <https://help.roomsketcher.com/hc/en-us/articles/14476178785437-Toolbar-Buttons-and-Options>
- SketchUp for Web separates a model/menu bar, primary left toolbar, expanded toolset, right-side panels and a bottom status/measurement area: <https://help.sketchup.com/en/sketchup-web/navigating-sketchup-web>
- SketchUp's long-tail tools live in an expanded toolset that can feed recent or chosen tools back into the main toolbar: <https://help.sketchup.com/en/sketchup-web/sketchup-web-expanded-toolbar>
- Floorplanner's published editor manual uses a sidebar whose content changes with tools and selections. The manual is older layout evidence, not certification of its current feature set: <https://cdn.floorplanner.com/static/brochures/Floorplanner%20editor%20manual%20version%20180219.pdf>
- magicplan places selection identity in the toolbar and uses a bottom details surface on phones rather than compressing a desktop inspector: <https://help.magicplan.app/the-new-magicplan>
- AutoCAD Web emphasizes essential drafting commands, additional options behind a more menu, a collapsible left pane and shortcuts: <https://help.autodesk.com/view/ACADWEB/ENU/?caas=caas/sfdcarticles/sfdcarticles/Is-it-possible-to-customize-the-AutoCAD-Web-App-interface.html>
- Figma separates a slim navigation rail, dynamic left sidebar, contextual right properties and a minimized-canvas mode: <https://help.figma.com/hc/en-us/articles/360039831974-Explore-the-navigation-bar-and-left-sidebar>
- Visual Studio Code provides a familiar activity-rail/side-panel model with remembered layout state: <https://code.visualstudio.com/docs/configure/custom-layout>
- The Material mini-drawer pattern supports expanded and icon-width persistent states, with temporary drawers on smaller screens: <https://mui.com/material-ui/react-drawer/>

The goal is not to copy another product's brand or complexity. The reusable lesson is to give every surface one job and reveal secondary capability only when it is relevant.

## Design principles

### 1. The canvas is the product center

The drawing remains the largest continuous region. Interface growth must not steadily shrink it.

### 2. One command has one primary home

The same command may have a keyboard shortcut, menu entry or contextual affordance, but it has one visually primary home. Duplicate permanent buttons are not allowed without a documented reason.

### 3. Creation belongs left; properties belong right

- The left side answers: **What do you want to create or do?**
- The right side answers: **What is selected, and what can be changed about it?**

### 4. Project commands are not drawing tools

New, Open, Save As, Export and related document operations belong in the Plan menu. They do not compete with Draw Room, Door, Window, Select or Move.

### 5. Frequent before advanced

Primary tools remain visible in the rail. Advanced or infrequent tools live in grouped expanded content, a More tools surface or future command search.

### 6. Context replaces clutter

Selection-specific controls appear when a selection exists. Empty panels should not permanently occupy valuable canvas width.

### 7. Responsive means changing the surface, not squeezing it

Desktop panels become tablet drawers and phone bottom sheets or temporary drawers. The app must not shrink a 300-pixel inspector into an unusable sliver.

### 8. State changes are predictable and reversible

Panel changes preserve draft state, selected objects, pending field text, undo/redo context and canvas position. Layout controls never alter the plan.

### 9. Simple for a new user; efficient for a returning user

Icons include labels in the expanded panel, tooltips in the rail, and shortcuts where useful. The default workflow must not require command-line or shortcut knowledge.

## Target shell

```text
+-----------------------------------------------------------------------+
| Row 1: Brand | editable plan name + save state | workspace | avatar   |
+-----------------------------------------------------------------------+
| Row 2: Plan menu | Undo | Redo | workflow/view actions | Preview      |
+--------+---------------------------------------------+----------------+
| Tool   |                                             | Contextual     |
| rail / |                  CANVAS                     | inspector      |
| panel  |                                             | / materials    |
|        |                                             |                |
+--------+---------------------------------------------+----------------+
| Active tool hint | Total area | Rooms              Zoom | Scale       |
+-----------------------------------------------------------------------+
```

The target preserves the stable two-row header introduced at baseline `a80ccbd`. The redesign simplifies the second row; it does not return to a single crowded header.

## Surface contracts

### Header row 1: document identity

**Purpose:** identify the product, current plan, account workspace and user.

Permanent contents:

- Modern Floor Planner brand or compact MFP mark at phone width;
- editable plan name;
- save status adjacent to the plan name;
- account workspace selector;
- account avatar and settings menu.

Rules:

- The row never contains drawing tools.
- The row never contains materials, geometry or selection properties.
- Save state may disappear after confirmation, but saving, failure and required states remain visible.
- The account workspace name may compact visually; its accessible name remains complete.
- This row stays structurally separate from row 2 at every width.

### Header row 2: document and workflow actions

**Purpose:** provide high-frequency plan-level actions and switches.

Target permanent contents:

- Plan menu;
- Undo and Redo;
- a compact workflow/view switch only when it changes the whole editor;
- Preview;
- optional Share/Export primary action when that capability is actually released.

The Plan menu owns:

- New plan;
- Open/load plan;
- Save or Save As when manual save remains required;
- Open a physical copy;
- Import and Export when supported;
- plan history or duplicate when supported;
- destructive plan deletion only behind a separately confirmed flow.

Quick Rooms is a workflow entry, not a file command. Its final placement may be a compact workflow switch or a create/start menu, but it must not be mixed into a list of save/load controls.

Keyboard shortcuts belong in Help, account/settings or command search. A permanent unlabeled keyboard button is not required once discoverability exists elsewhere.

### Left tool system

**Purpose:** activate creation, selection, alignment and transform tools.

#### State model

| State | Width | Contents | Typical use |
| --- | ---: | --- | --- |
| Expanded | 240–280 px | Icons, labels, groups, tool options and help | Learning, detailed work, large desktop |
| Rail | 52–60 px | Primary icons, active indicator, tooltips and state control | Repeated work, laptop/tablet |
| Hidden | 0 px | A small restore affordance remains reachable | Focused drawing or small screen |

State transitions:

| Current | Activation result | Announcement |
| --- | --- | --- |
| Expanded | Rail | Tools collapsed to icons |
| Rail | Hidden | Tools hidden |
| Hidden | Expanded | Tools expanded |

Requirements:

- One activation advances exactly one state.
- The state-control icon and tooltip describe the next result.
- Keyboard and pointer users can reach the control in every state.
- A screen-reader status announcement identifies the new state.
- Expanded width and current state are remembered locally by device and account context where appropriate.
- Hidden content remains mounted when required to preserve draft input, but hidden controls are removed from tab order and accessibility navigation.
- Resizing the expanded panel never changes the plan or active tool.
- Phone use opens expanded content as a temporary overlay rather than permanently narrowing the canvas.

#### Primary rail order

Initial order:

1. Select and Move
2. Draw Room
3. Add Door
4. Add Window
5. Align
6. Transform
7. More tools, when needed

Select and Move is the safe default. Tool categories may expand into choices, but the rail must not become an unbounded stack of every future command.

#### Expanded content

The expanded panel provides:

- visible tool name and shortcut;
- grouped choices and presets;
- concise active-tool guidance;
- selection-independent actions such as Show/Hide room names;
- a More tools or search entry when the long-tail tool count warrants it.

Do not repeat a generic Tools heading above a panel already identified as tools.

### Canvas

**Purpose:** create, inspect and navigate plan geometry.

Rules:

- The canvas is never used as storage for unrelated floating cards.
- The active drawing gesture owns pointer input until completed or canceled.
- Escape cancels the active transient tool or closes the topmost temporary surface without deleting work.
- Selection handles, opening previews and contextual geometry affordances may appear on the canvas because they directly represent plan content.
- Tooltips, menus and popovers must not cover the active target when a practical alternate placement exists.
- Canvas pan, zoom, fit and reset have one compact navigation home.

#### Navigation cluster

The target cluster contains:

- Zoom in;
- Zoom out;
- Fit drawing;
- optional Reset to 100 percent or Home only if its behavior is materially different from Fit;
- Pan/hand mode when needed for pointer devices;
- current zoom value.

Fit drawing must not appear as a second permanent command in the status bar. Center selected may appear only while an appropriate selection exists.

### Right inspector

**Purpose:** inspect and edit the current context.

Contexts:

| Context | Inspector content |
| --- | --- |
| Nothing selected | Hidden, compact project summary or helpful empty state only when useful |
| One room | Room name, dimensions, appearance and room actions |
| Door/window | Opening type, size, wall/position, style/swing and opening actions |
| Multiple rooms | Count, group/ungroup, alignment, distribution and shared actions |
| Project/material mode | Materials or quantities tab using existing calculation authority |

Behavior:

- Selecting editable content opens the inspector unless the user has explicitly entered focus mode.
- The inspector can be pinned, resized or closed on desktop.
- If explicitly closed in focus mode, selection presents a small Edit affordance rather than repeatedly forcing the panel open.
- Materials may begin as a tab in the inspector. If quantity/estimate work grows into a multi-step workflow, it becomes a documented editor mode rather than an ever-longer inspector.
- The inspector never recalculates authoritative physical quantities independently from the existing engine.

Responsive surfaces:

- Desktop: docked resizable inspector.
- Tablet: narrower docked panel or overlay drawer depending on available canvas width.
- Phone: bottom sheet or full-height temporary drawer with a visible close action.

### Status bar

**Purpose:** show lightweight plan and view information without competing for attention.

Target contents:

- active tool name and one concise hint;
- total area and room count;
- zoom/scale value if not already integrated into the navigation cluster;
- selection count when useful;
- transient noncritical status.

Rules:

- Target height is 28–36 pixels on desktop.
- The status bar is informational, not another toolbar.
- Long guidance truncates visually with an accessible full label or tooltip.
- Phone content may reduce to area, rooms and active tool, with additional status behind a details action.

## Command placement registry

This table is the initial source of truth for current commands.

| Command or information | Primary future home | Notes |
| --- | --- | --- |
| Product brand | Header row 1 | Compact mark on phone |
| Plan name and save state | Header row 1 | Editable in place |
| Account workspace | Header row 1 | Do not confuse with canvas workspace |
| Account/settings/sign out | Avatar menu | Keep one account home |
| New plan | Plan menu | Confirm before replacing unsaved work |
| Load/Open plan | Plan menu | Project list may later replace the modal |
| Save/Save As | Plan menu and save state | Permanent button is unnecessary after dependable autosave |
| Open physical copy | Plan menu or workflow transition | Preserve explicit adoption semantics |
| Quick Rooms | Workflow switch/start entry | Not a file command |
| Undo/Redo | Header row 2 | Keep visible and support shortcuts |
| Keyboard shortcuts | Help/command search | No dedicated permanent icon required |
| Materials | Inspector tab, later mode if needed | Do not add a second calculator engine |
| Select and Move | Left rail | Safe default tool |
| Draw Room | Left rail | Primary creation tool |
| Add Door/Window | Left rail | May share an Openings category later |
| Select all rooms | Expanded tool panel or command search | Not primary rail content |
| Show/Hide room names | Expanded tool panel or View menu | Presentation setting |
| Align/Transform | Left rail categories | Choices appear in expanded panel or contextual inspector |
| Room/object properties | Right inspector | Selection-specific |
| Group/Ungroup/Delete selection | Right inspector and shortcuts | Contextual; destructive actions need clear target |
| Zoom/Pan/Fit | Canvas navigation cluster | One visual home |
| Preview | Header row 2 or view control | Whole-editor view action |
| Total area/room count | Status bar | Informational summary |

## Rules for adding future features

Before adding any UI control, answer these questions in order:

1. **Does it create or manipulate plan content?** Place it in the left tool system.
2. **Does it edit the current selection?** Place it in the right inspector.
3. **Does it manage the plan document?** Place it in the Plan menu or header row 2 if truly frequent.
4. **Does it change only how the canvas is viewed?** Place it in the navigation cluster or View menu.
5. **Is it informational?** Place it in the status bar or a contextual result panel.
6. **Is it an infrequent advanced command?** Place it in More tools or command search.
7. **Does it require a multi-step task with its own state and results?** Propose a named editor mode or separate route; do not create another floating panel.

A new permanent surface requires all of the following:

- a user task that cannot fit an existing surface;
- evidence that progressive disclosure is insufficient;
- phone, tablet, desktop and keyboard behavior;
- ownership and state-preservation rules;
- an update to this architecture document.

## Responsive architecture

Breakpoints are behavior bands, not guarantees tied to one exact device.

### Wide desktop: 1280 px and above

- Expanded left tool panel is the default for a first visit.
- The user may select rail or hidden and that choice persists.
- Right inspector opens contextually and may be resized.
- Header row 2 displays its approved high-frequency commands without horizontal scrolling.
- With both side panels open, the canvas should retain at least 55 percent of editor width where practical.

### Compact desktop and tablet: 768–1279 px

- Tool rail is the default for a first visit.
- Selecting a rail category may open an overlay/temporary expanded panel.
- The inspector uses a narrow dock only when minimum canvas width is preserved; otherwise it overlays.
- No page-level horizontal overflow is allowed.

### Phone: below 768 px

- Left tools are hidden by default with a persistent restore control.
- Tool content opens as a temporary drawer.
- Properties and materials use a bottom sheet or full-height temporary drawer.
- The header keeps two structural rows but compacts text and exposes overflow commands through menus.
- Touch targets are at least 44 by 44 CSS pixels where practical.
- The page never requires horizontal scrolling; only the drawing canvas may pan internally.

### Resize behavior

- Crossing a behavior band may change the presentation type, but it does not discard the user's selected tool or draft state.
- The app remembers explicit device-local preferences without letting a wide-screen pixel width force an unusable phone layout.
- Ordinary resizing must not repeatedly open and close panels or move keyboard focus.
- Any forced safety adaptation is announced and reversible.

## Accessibility and interaction requirements

Every packet must preserve or improve these requirements:

- Complete keyboard access to shell, tools, inspector, menus and canvas-adjacent actions.
- Visible focus at all supported zoom and panel states.
- Accessible names remain complete when visible labels compact to icons.
- Tooltips supplement accessible names; they do not replace them.
- Icon rail selection exposes `aria-current`, `aria-pressed` or the correct equivalent.
- Expanded/rail/hidden changes are announced without a noisy live region.
- Temporary drawers and bottom sheets contain focus, close on Escape and return focus to their opener.
- Hidden mounted content is inert and absent from the tab order.
- Color is never the only indication of active tool, invalid input, save state or selection.
- Layout supports 200 percent text enlargement without page-level horizontal overflow at the tested desktop viewport.
- Pointer targets do not become smaller merely to fit more tools.
- Reduced-motion preferences apply to panel transitions.
- Tool and status language remains direct and beginner friendly.

## Layout state and persistence

Layout preference is presentation state, not plan data.

The first implementation should use a versioned local preference envelope, conceptually:

```ts
interface EditorLayoutPreferenceV1 {
  version: 1;
  leftMode: 'expanded' | 'rail' | 'hidden';
  leftExpandedWidth?: number;
  rightPinned: boolean;
  rightWidth?: number;
}
```

Rules:

- Never store geometry, room data, measurements, auth tokens or calculation results in this envelope.
- Validate every restored value and fall back safely when unsupported.
- Keep account-workspace identity separate from layout preference.
- Do not automatically upload local layout preference with a guest draft.
- A failed preference write must not block editing.
- Preserve current plan recovery, session and workspace boundaries unchanged.

## Proposed component architecture

Exact names may change during implementation, but responsibilities should remain separated.

| Proposed responsibility | Likely path or adaptation |
| --- | --- |
| Shell composition and responsive bands | `client/src/components/editor/EditorShell.tsx` or a bounded extraction from `FloorPlanner.tsx` |
| Layout state machine and persistence | `client/src/components/editor/useEditorLayout.ts` |
| Document identity and plan actions | Adapt `AppHeader.tsx`; add `PlanMenu.tsx` |
| Three-state tool system | Adapt `Sidebar.tsx`; add `ToolRail.tsx` and `ToolPanel.tsx` only if separation reduces complexity |
| Side-panel layout | Adapt `ResizablePanels.tsx`; retire the separate `PanelHeaderControls.tsx` strip |
| Context inspector | Adapt `SelectionPanel.tsx`, `PropertyPanel.tsx` and `MaterialCalculationPanel.tsx` behind one inspector contract |
| Canvas navigation | Consolidate `CanvasControls.tsx` and bottom view controls in `CanvasContainer.tsx` |
| Status information | Extract an `EditorStatusBar.tsx` from the bottom canvas bar |
| Command metadata, later | `client/src/features/editor-tools/registry.ts` only when Packet 5 is activated |

Avoid a big-bang rewrite. Existing components should be adapted or extracted only when the packet's tests prove behavior preservation.

## Delivery plan

### Packet 0: architecture publication — current assignment

**Goal:** establish one owner-approved placement standard and bounded build sequence.

Deliverables:

- this architecture and roadmap;
- canonical-roadmap link;
- issue #29 research and planning evidence;
- explicit statement that implementation has not started.

Checks:

- Markdown/link review;
- repository whitespace check;
- clean documentation diff;
- no application, dependency, database or deployment change.

Completion state: documentation may be committed and pushed. It is not a deployed UX implementation.

### Packet 1: shell foundation and three-state left tools

**Goal:** create the scalable shell without changing any drawing command behavior.

In scope:

- add `expanded`, `rail` and `hidden` left modes;
- provide one-state-per-activation cycling and direct accessible state labels;
- preserve resizable expanded width;
- show current primary tool icons in the rail;
- make the expanded panel use the same tool definitions and active state;
- remove the separate full-width panel-toggle strip;
- retain the existing right panel behavior for this packet;
- persist validated layout preference locally;
- keep hidden content inert while preserving required draft state.

Out of scope:

- moving header commands;
- redesigning the right inspector;
- changing canvas navigation;
- adding tools;
- changing room/opening behavior or data.

Likely paths:

- `client/src/pages/FloorPlanner.tsx`
- `client/src/components/ResizablePanels.tsx`
- `client/src/components/PanelHeaderControls.tsx`
- `client/src/components/Sidebar.tsx`
- new bounded editor-layout state and tool-rail modules
- responsive editor browser tests

Acceptance:

- expanded -> rail -> hidden -> expanded works by pointer and keyboard;
- active tool and plan state survive every transition;
- panel width and state survive same-device reload;
- the canvas gains space in rail and hidden modes;
- no page overflow at 390, 820, 1280 and 1920 pixels;
- no loss of unsaved title, room, opening, selection or recovery context;
- left controls have complete accessible names and visible focus.

Release gate:

- applicable unit tests;
- TypeScript check and production build;
- focused Playwright state/responsive/accessibility regressions;
- existing editor and selection regressions;
- desktop/tablet/phone visual review;
- normal production deployment and live resize/state smoke after separate authorization.

Implementation checkpoint — 2026-11-05:

- `expanded`, `rail` and `hidden` modes are implemented with one-step pointer and keyboard cycling;
- expanded width and the validated, versioned layout preference persist locally;
- the icon rail and expanded panel share the same primary-tool definitions and active state;
- the former full-width panel-toggle strip is retired while the existing right-panel contract remains intact;
- phone expanded mode is an accessible overlay with focus containment, Escape dismissal and focus return;
- room, opening, selection, authorization-preservation and inspector regressions remain green;
- producer verification passed: 723 unit tests, TypeScript check, production build and 83 browser tests;
- visual review passed at 390, 820, 1280 and 1920 pixels; existing narrow-header command crowding is intentionally deferred to Packet 3;
- implementation commit `e78660faacda882c8b2422f261d54b79b29df6d7` and deployment-packaging commit `250ccd68ae14578758d85967c45736e10f3ae789` are pushed to `main`;
- production deployment `dpl_AvaTkexV4m5WZYAjEw69uMLkvESw` is READY at the canonical URL;
- isolated live desktop and phone smoke passed mode cycling, canvas-space recovery, phone overlay/focus return, page-overflow and browser-error checks with zero console or page errors.

### Packet 2: canvas navigation and status bar consolidation

**Goal:** remove duplicated canvas controls and recover vertical space.

In scope:

- define one compact navigation cluster;
- keep one Fit drawing command;
- reconcile Fit, Home/reset and 100 percent semantics;
- move area, room count, active tool and view information into a thin status bar;
- keep Preview in its approved whole-editor location;
- preserve canvas coordinates, pan, zoom, selection and opening placement.

Acceptance:

- every former view action still has one reachable primary home;
- duplicate permanent Fit controls are gone;
- status height meets the target desktop range;
- keyboard shortcuts and accessible names remain intact;
- fit/reset results are unchanged for empty, one-room and multi-room drawings;
- canvas and status remain usable at phone, tablet, desktop and 200 percent text.

Implementation checkpoint — 2026-11-06:

- one compact floating navigation toolbar now owns Zoom Out, the current zoom value, Zoom In, Reset to 100 percent, the single Fit command, Pan and contextual Center Selected;
- Reset and Fit have distinct behavior and accessible names; `Home` resets zoom to 100 percent while Fit continues to center the real drawing bounds without changing coordinates;
- the duplicate footer Fit control and the obsolete `TotalAreaDisplay` component are retired;
- a 36-pixel informational status bar now owns total area, room count, active tool, a responsive tool hint and selection count without adding another command surface;
- Preview remains an adjacent whole-editor view action; pointer activation, `P`, Escape, explicit close and focus return are preserved;
- room coordinates, drawing/opening placement, pan, zoom, selection, grouping, save/recovery and material calculations are unchanged;
- Quick Rooms and Physical Draft use reliable direct route imports after production-bundle verification found their former lazy promises could leave a successful chunk request on the loading fallback; no route data contract changed;
- producer verification passed: 723/723 unit tests, TypeScript check, production build, 201/201 full browser regressions and a final focused Preview regression;
- responsive and enlarged-text checks passed at 390, 820 and 1280 pixels plus 200 percent text; visual review confirms the narrow desktop inspector is the intentional Packet 3 target;
- implementation commit `933a7ba0329bda2236a15fd8a6e6e3bdbed03aef` is pushed to `main`;
- production deployment `dpl_67jtF42dEn4GPQ3tnVCqKssA1xEm` is READY at `https://modern-floor-planner.vercel.app`;
- isolated live desktop/phone and route smoke passed the canonical URL with zero console or page errors, and the first-hour Vercel error scan returned no errors.

### Packet 3: contextual inspector and responsive properties

**Goal:** make the right side relevant to the current selection and adaptable to the viewport.

In scope:

- introduce an explicit inspector context contract;
- hide or minimize the empty inspector;
- preserve room, opening, multi-selection and materials content;
- add pin/close behavior on desktop;
- provide overlay drawer behavior on tablet and bottom-sheet/full-height behavior on phone;
- preserve pending raw field text, validation, Revert, history and focus rules.

Acceptance:

- selecting each supported content type opens the correct context;
- deselection follows the documented pin/empty-state policy;
- pending or invalid input survives panel mode and viewport changes;
- focus containment, Escape and focus restoration pass;
- the canvas remains independently pannable;
- materials display existing calculations without new arithmetic.

Implementation checkpoint — 2026-11-06:

- one explicit inspector context now owns Materials, door/window properties, multi-room selection, single-room properties and Plan contents;
- the empty Plan contents state is minimized automatically, while an explicit All rooms navigation choice remains open long enough to support room and opening browsing;
- desktop uses a non-squeezing overlay by default and an explicit pin control for a docked, keyboard- and pointer-resizable inspector; unpinning empty contents minimizes it again;
- tablet uses a right overlay drawer and phone uses a full-width bottom sheet; only one inspector DOM tree is retained across all three presentations, preserving pending and invalid input, the active inspector tab and element identity;
- non-desktop overlays contain focus, close with Escape and restore focus to their opener; context reveal waits for the selecting gesture to finish so the inspector cannot steal a room, opening, pan or pinch gesture;
- a collapsed inspector becomes inert immediately, and open overlays move the floating canvas-navigation cluster clear without changing canvas coordinates, geometry, selection, saved plans or quantity calculations;
- Materials continues to display the existing calculator result, and room/opening/multi-selection actions continue to use their existing command and persistence contracts;
- producer verification passed: TypeScript check, production build, 723/723 unit and integration tests, 42/42 focused inspector/canvas/selection browser tests and 204/204 full browser regressions;
- fresh visual review passed for the desktop multi-selection overlay, tablet Materials drawer and phone opening sheet; the existing large main-bundle warning remains tracked separately and did not block this bounded UX packet;
- implementation commit `07c39cc7489cc9f957e636115b521f72b7f744fc` is pushed to `main`;
- production deployment `dpl_D327Cswqg44M3wzonFQYJRTX6AE8` is READY at `https://modern-floor-planner.vercel.app`;
- isolated live smoke passed the empty state, desktop room context and pinning, tablet drawer and Materials context, phone bottom-sheet fit, Quick Rooms and Physical Draft routes, with zero browser/console errors and no errors in the bounded Vercel production-log scan.

### Packet 4: header action architecture and Plan menu

**Goal:** keep the approved two-row identity while reducing permanent action clutter.

In scope:

- create the Plan menu;
- move New, Load/Open, Save As and Open physical copy into it;
- keep Undo/Redo and Preview visible;
- place Quick Rooms as a clear workflow entry;
- relocate keyboard-shortcut discovery to Help/settings or the future command surface;
- keep title save state, account workspace and avatar unchanged.

Acceptance:

- all current commands remain reachable by mouse and keyboard;
- destructive replacement confirmation remains unchanged;
- the two header rows remain stable across widths;
- phone overflow is handled by menus rather than page scrolling;
- save state and account controls remain visible and accurate;
- command placement matches the registry in this document.

### Packet 5: scalable tool registry and command discovery

**Goal:** let future tools grow without adding permanent chrome.

Activation condition: start only when the tool count or planned feature set justifies registry/search complexity.

In scope:

- one typed metadata source for tool ID, label, icon, group, shortcut, availability and help;
- render the rail and expanded panel from shared metadata where behavior permits;
- add More tools or command search;
- expose unavailable tools honestly rather than silently hiding required prerequisites;
- support concept aliases for beginner language only after tested examples exist.

Acceptance:

- adding a registered tool does not require editing multiple unrelated toolbar lists;
- keyboard activation and active state stay synchronized;
- search never executes destructive commands without confirmation;
- bundle and render costs remain proportionate;
- no dynamic code path bypasses existing authorization or plan-state guards.

### Packet 6: usability hardening and governance

**Goal:** verify that the architecture is simpler for real tasks before broad feature growth.

Required scenarios:

1. Create and name a plan.
2. Draw a room.
3. Add and edit a door and window.
4. Select, move, align and transform rooms.
5. Inspect room and opening properties.
6. View materials without losing selection or drawing context.
7. Save/open or explicitly remain local as applicable.
8. Enter focus mode and restore the interface.
9. Complete the same core flow at desktop, tablet and phone widths.

Targets for a later measured pilot:

- a first-time user can find Draw Room, Door, Window, Select and plan saving without instruction;
- a returning user can reach the same tools from the rail or shortcuts;
- panel changes produce no data loss or unexplained canvas jump;
- users can identify where future categories belong;
- the four-of-five users / under-two-minutes milestone remains a measured pilot target, not an unverified claim.

## Cross-packet invariants

Every implementation packet must preserve:

- existing room, opening, group, transform, selection and canvas semantics;
- physical measurements independent from pixels, zoom and panel width;
- current undo/redo scope and deletion recovery;
- unsaved local draft boundaries and explicit server-workspace selection;
- Supabase authentication and server-side workspace authorization;
- current plan-name save behavior;
- legacy plan and opening compatibility;
- quantity engine authority and completeness language;
- Quick Rooms and Physical Draft route/state separation;
- no automatic upload or reassignment of guest work;
- no database migration unless separately justified by persisted product semantics;
- no new dependency merely to animate or position panels when existing libraries suffice.

## Required verification matrix

Each packet selects the applicable rows and records actual results.

| Area | Required evidence |
| --- | --- |
| Static quality | TypeScript check, production build, whitespace check |
| Unit/state | Layout state transitions, preference validation and failure behavior |
| Editor behavior | Existing room/opening/selection/undo/save regressions |
| Responsive | 390, 820, 1280 and 1920 pixel viewport assertions |
| Overflow | No page-level horizontal overflow; canvas-only internal pan is allowed |
| Keyboard | Tab order, shortcuts, Enter/Space activation, Escape and focus return |
| Accessibility | Names, roles, states, visible focus, inert hidden panels and announcements |
| Text enlargement | 200 percent text review at the defined desktop viewport |
| Visual | Desktop, tablet and phone screenshots from final tested source |
| Production | Canonical URL, exact asset/deployment match, primary task smoke and error-log scan |
| Preservation | No unrelated source, data, auth, schema or route change |

## Rollout and rollback

- Deliver one packet at a time as a small compatible commit.
- Record the entry commit and issue authorization before each packet.
- Do not combine shell refactoring with geometry, quantity, auth or database changes.
- Use normal non-force commits and pushes to verified `main` when authorized.
- Deploy only after the packet's relevant checks pass.
- Keep a normal previous-production deployment/commit reference for rollback.
- Roll back with an ordinary revert when assigned; never reset or force-push.
- A committed roadmap is not an implemented shell, and a deployed shell is not usability-verified until the originating scenarios pass.

## Deferred decisions

These decisions are intentionally deferred until their activation conditions exist:

| Decision | Activation condition |
| --- | --- |
| Materials as inspector tab versus full editor mode | Materials/quantity workflow becomes multi-step or exceeds an inspector's usable depth |
| Command palette/search | Primary and grouped tools become difficult to discover without search |
| Customizable rail order | Real users demonstrate materially different frequent-tool sets |
| Shared shell across `/`, `/quick-room` and `/physical-draft` | State/persistence contracts can be preserved without route coupling or big-bang migration |
| Collaboration/share controls | Collaboration capability is implemented and authorized |
| Project dashboard replacing Load modal | Saved-project lifecycle and onboarding work are activated |

Deferred does not mean approved for implementation. Each item needs a bounded owner decision and issue update.

## Definition of UX architecture completion

The architecture program is complete only when:

- all activated packets have actual commit and deployment evidence;
- the command placement registry matches production;
- desktop, tablet and phone scenarios pass;
- keyboard and accessibility acceptance passes;
- no duplicated permanent command or undocumented surface remains;
- future contributors can place a proposed feature using the decision rules;
- the owner verifies that the editor feels simpler while retaining required capability.

Packet 0 publication alone completes the roadmap artifact, not the redesign.
