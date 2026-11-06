# Modern Floor Planner UX/UI governance checklist

Status: Packet 6 implementation checklist; measured customer pilot remains unstarted  
Canonical architecture: [MFP UX/UI Architecture and Roadmap](MFP_UX_UI_ARCHITECTURE_ROADMAP.md)  
Owner issue: [GitHub #29](https://github.com/armentrout1/ModernFloorPlanner/issues/29)

## Purpose

Use this checklist before adding, moving or duplicating an editor control. It keeps the canvas primary, gives each command one discoverable home, and prevents new features from rebuilding the five-sided clutter that the UX/UI program removed. This document governs the legacy editor at `/`; it does not merge the Quick Rooms or Physical Draft state models.

## Control-placement decision

Answer the first matching question and stop. A feature may have a shortcut or search alias in addition to its primary home, but it must not gain a second permanent visual home.

| Question | Primary home | Examples |
| --- | --- | --- |
| Does it create or manipulate plan content? | Tool rail, with details in the expanded tool panel | Draw room, Door, Window, Align, Transform |
| Does it edit the current selection? | Contextual inspector | Dimensions, opening properties, Group, Ungroup, Delete |
| Does it manage the plan document? | Plan menu; row 2 only when frequent and space-safe | New, Save, Open, physical copy |
| Does it only change the canvas view? | Canvas navigation cluster | Zoom, Pan, Fit, Preview, Focus mode |
| Is it passive task information? | Status bar or the relevant result panel | Area, room count, active tool, selection count |
| Is it an infrequent safe command? | More tools / command search | Distribute, mirror, reposition |
| Is it a multi-step workflow with its own durable state? | Propose a named mode or route | Future catalog or takeoff workflow |

The typed registry records this decision as `primaryHome`. New registry commands fail review when that field is missing. Destructive and replacement commands stay outside searchable safe-command discovery unless a separate design explicitly preserves target clarity and confirmation.

## Feature intake checklist

Before implementation, record:

- [ ] user task and evidence that an existing control does not already solve it;
- [ ] one primary home selected using the table above;
- [ ] whether the command is primary, contextual, informational or advanced;
- [ ] empty, unavailable, loading, error and success states;
- [ ] plan-data, selection, layout-preference and account/workspace ownership boundaries;
- [ ] desktop, tablet, phone, keyboard and touch behavior;
- [ ] accessible name, role, state, focus order, Escape behavior and focus return;
- [ ] what must remain selected or mounted while the surface opens and closes;
- [ ] whether the change affects room/opening geometry, quantities, auth, persistence or database schema;
- [ ] tests and rollback boundary;
- [ ] architecture and issue updates when a permanent surface is proposed.

A new permanent surface requires evidence that progressive disclosure in the existing surfaces is insufficient. Convenience alone is not evidence.

## Packet 6 core-flow acceptance

These are product scenarios, not isolated component demos.

| # | Scenario | Required observable outcome | Automated coverage |
| --- | --- | --- | --- |
| 1 | Create and name a plan | Editable title retains its value and save state is clear | `editor.spec.ts`, header tests |
| 2 | Draw a room | Room appears at the intended scale without page movement | `editor.spec.ts`, `canvas-view.spec.ts` |
| 3 | Add and edit a door and window | Both openings remain wall-owned and their property edits persist | door/window regression suites |
| 4 | Select, move, align and transform | Selection and geometry remain authoritative through each command | `selection.spec.ts`, `editor-tools.spec.ts` |
| 5 | Inspect room and opening properties | The contextual inspector identifies the selected target | `selection.spec.ts`, `canvas-view.spec.ts` |
| 6 | View materials without losing context | Materials open without mutating rooms or selection | `panel-materials.spec.ts`, selection regressions |
| 7 | Save/open or explicitly remain local | Server save/open is deliberate; guest work remains browser-local | editor, authorization and auth suites |
| 8 | Enter focus mode and restore the interface | Panels hide temporarily; selection stays; Exit restores the exact prior shell | `editor-usability.spec.ts` |
| 9 | Repeat the core shell flow at responsive widths | Same controls remain reachable at 390, 820, 1280 and 1920 px | `editor-usability.spec.ts`, `canvas-view.spec.ts` |

## Release evidence matrix

Every UX/UI packet records actual results; a planned check is never written as a pass.

| Area | Release evidence |
| --- | --- |
| Static quality | `npm run check`, `npm run build`, `git diff --check` |
| State and registry | Layout-state tests plus registry uniqueness, availability and `primaryHome` assertions |
| Editor preservation | Full unit/integration suite and full Playwright suite, including all door/window scenarios |
| Responsive and overflow | Assertions at 390, 820, 1280 and 1920 px; no page-level horizontal overflow |
| Keyboard | Tool shortcuts, Ctrl/Cmd+K, Enter/Space, Escape, focus return and Shift+F |
| Accessibility | Names, roles, pressed/expanded states, inert hidden panels, live announcements and visible focus |
| Text enlargement | 200 percent root-text check at the defined desktop viewport |
| Visual | Final-source screenshots for phone, tablet and desktop focus/shell states |
| Production | Canonical URL, exact commit/deployment/asset match, route smoke and bounded warning/error log scan |
| Preservation | No unrelated route, schema, dependency, auth or quantity-engine change |

## Focus-mode contract

Focus mode is transient presentation state:

- it hides the left tools and right inspector without changing the saved device layout preference;
- it preserves the selected room or opening and all mounted draft state;
- a selected target exposes one small **Edit** affordance instead of reopening the inspector automatically;
- ordinary Exit, Escape or Shift+F restores the exact underlying shell state;
- choosing **Edit** exits focus mode and intentionally opens the selected target's inspector;
- it does not change zoom, geometry, plan data, workspace, auth or server-save state.

## Pilot protocol — not yet measured

The owner roadmap retains this hypothesis: after one explanation, at least four of five representative users complete the basic task without assistance in under two minutes. It is not an automated-test result and is not achieved by shipping Packet 6.

For a later supervised pilot:

1. recruit at least five representative first-time users and identify returning users separately;
2. give each user the same short task: name a plan, draw a room, add an opening, inspect/edit it, check materials, enter/exit focus mode, then save or state why the work remains local;
3. record time to first successful room, task completion, assistance, wrong-surface attempts, errors, save outcome and comments;
4. do not coach tool location after the stated starting instruction;
5. record screen width/input method and whether the user is first-time or returning;
6. report raw counts and exceptions; do not convert observations into a claim the sample cannot support;
7. open bounded follow-up issues for repeated friction before adding a new permanent surface.

## Rollout and rollback

- Ship a bounded compatible commit after the full applicable matrix passes.
- Keep the previous production commit and deployment ID in the Packet receipt.
- Use an ordinary revert for rollback; never reset or force-push.
- Geometry, quantity, auth and database changes require separate scope and evidence.
- A local pass is not a production pass, and automated usability coverage is not a measured customer pilot.
