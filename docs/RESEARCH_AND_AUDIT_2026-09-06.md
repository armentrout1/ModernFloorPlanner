# Modern Floor Planner — source audit and research

Review date: 2026-09-06. Baseline: `876968e78d7070775e7924f33a3164ba20905d42` on `armentrout1/ModernFloorPlanner/main`. Companion: [executable roadmap](BUILD_ROADMAP.md).

## Review limits and document reconciliation

The owner supplied a Codex summary describing quick-room entry, quantities, pricing and eight milestones. The linked complete MD is a local output, not a retrievable GitHub URL. The reviewed remote main roadmap still called drawing implementation parked and product selection unverified. Only `main` and `docs/ecosystem-blueprint-v1` were returned by branch search; no matching open issue or PR was returned before creating M1 issue #2. This is not proof that Codex has no unpublished local edits or active local task.

This review used connected GitHub source reads and official external documentation. It did not execute the repository, authenticate to a live deployment, inspect customer records or run a vulnerability test. Shell clone failed because that environment could not resolve GitHub; the connector continued to work. Do not report typecheck/build failures or test success as observed runtime facts.

The product-specific roadmap now recognizes the selected repository and the owner's active planning request. Shared v1.1 policies, independent product ownership and production-first rules remain intact. Codex must reconcile the complete local MD rather than discard it or continue maintaining a separate canonical roadmap.

## Source findings

| ID / severity | Observed evidence | Consequence and planned response |
| --- | --- | --- |
| F01 / critical quantity correctness | [`materialCalculator.ts`](../client/src/utils/materialCalculator.ts) adds `perimeter - doorWidth` inside each door iteration and adds `perimeter` for each window. | Multiple openings can multiply baseboard totals. M1 adds perimeter once and deducts eligible interruptions once. |
| F02 / precision and policy | The same file rounds door width to 0.5 ft before deductions/grouping; base shoe always gets full perimeter. | 32 inches can become 30 inches; shoe ignores doors. M1 keeps precise widths and applies explicit trim interruption rules. |
| F03 / destructive interaction risk | [`FloorPlanner.tsx`](../client/src/pages/FloorPlanner.tsx) checks selected room before selected object in its delete handler; object selection is resolved through a selected room. | An opening-delete action can take the room-delete branch. M1 reproduces, fixes target precedence and adds recovery/keyboard regressions. |
| F04 / physical model gap | [`shared/schema.ts`](../shared/schema.ts) and [`types.ts`](../client/src/utils/types.ts) use room plan `width/height`, pixel object size and percentage offset; no ceiling-height/window-height/sill model sufficient for the proposed quantities. | Add shared v2 physical schemas, completeness and provenance. Do not interpret plan height as ceiling height. |
| F05 / conversion coupling | [`canvas.ts`](../client/src/utils/canvas.ts) defines 20 pixels per one-foot grid; creation snaps dimensions; area display rounds to whole sq ft. | Migration needs the original model scale. Typed measurements and authoritative totals must be independent of viewport/grid/display rounding. |
| F06 / customer isolation release blocker | [`routes.ts`](../server/routes.ts) passes request bodies to storage; [`storage.ts`](../server/storage.ts) lists plans globally and gets/updates/deletes by ID; the floor-plan table has no workspace ownership column. | The reviewed route/storage boundary does not establish tenant-safe access. M1 validates inputs and inventories exposure; M4 implements scoped authorization before customer/partner launch. This is static evidence, not a certified live exploit. |
| F07 / saving and revision gap | Reviewed plan table stores name, rooms and text timestamps; update replaces current fields. Main UI has manual save/load; no immutable revision contract is demonstrated. | M4 adds transactions, revision concurrency, autosave/recovery and snapshot exports. Preserve legacy originals. |
| F08 / executable quality gates absent in package scripts | [`package.json`](../package.json) has dev/build/start/check/db:push scripts, but no test script or test runner dependency shown. | Establish and run compatible tests in M1. This does not prove every possible external test is absent or that build currently fails. |
| F09 / responsive layout risk | [`MaterialCalculationPanel.tsx`](../client/src/components/MaterialCalculationPanel.tsx) fixes width with `w-80` inside a resizable panel. | Fixed child width can conflict with container size. M3 must test real viewport overflow and unobstructed controls; static inspection is not a screenshot verification. |
| F10 / documentation conflict | Historical [`MODERN_FLOOR_PLAN.md`](../MODERN_FLOOR_PLAN.md) describes broad features and future work; [`DOORS_AND_WINDOWS.md`](../DOORS_AND_WINDOWS.md) labels June 2025 behavior stable. Previous ecosystem roadmap remained parked. | Historical documentation is not proof of present implementation. New roadmap governs execution and requires regression evidence. Preserve opening behaviors and old documentation as reference. |

### Arithmetic illustration of F01

For a 10 ft × 12 ft room, perimeter is 44 ft. With one 3-ft door and one normal window, the reviewed loop adds `(44 − 3) + 44 = 85 ft` of baseboard. Under the new explicit policy the expected quantity is `44 − 3 = 41 ft`. This is a source-derived arithmetic illustration, not a browser test result. The golden fixture in the roadmap extends it to walls, ceilings and trim.

## Official product research and implications

Sources were reviewed on September 6, 2026. Vendor descriptions are evidence of their advertised/documented capabilities, not independent usability tests or market-demand proof. Pricing can change; recheck before publishing comparisons or charging customers.

### magicplan — closest quantity/workflow comparator

Its statistics documentation distinguishes project and room totals, gross/net interior-wall surfaces and a floor perimeter adjusted for doors [R1]. Its PRO Estimator documentation describes material/labor estimating from floor plans and item libraries [R2]. The current pricing page presents project-based plans with users included, but plan amounts were dynamically loaded in the retrieved page; no exact current dollar amount is asserted [R3].

Implication: make deductions and measurement basis explicit. Our proposed differentiation is fast typed room input, auditable quantities and an independent reusable engine. It is not that competitors cannot calculate walls. Unlike a full in-app estimator, our ecosystem leaves financial estimate authority in LedgerLine.

### RoomSketcher — measurement and packaging comparator

Its area documentation distinguishes multiple inclusion methods rather than one ambiguous total-area number [R4]. The pricing page retrieved showed Pro at $24 monthly or $144 billed yearly, and Team at $70 monthly or $420 yearly with five users; credit-dependent features also exist [R5]. These packages are not like-for-like with this proposed product.

Implication: label our output interior finish-face area, not generic gross/living area. The owner's $19/month Solo hypothesis is plausible to test against workflow value, but is not automatically cheaper than competitors' annual options or evidence of demand.

### Floorplanner — occasional-use comparator

Its pricing page documents up to five free projects with limited/watermarked exports and credits for project upgrades [R11]. Some subscription figures were not populated in the retrieved page, so they were not treated as actual zero-dollar plans.

Implication: one-off project access is a reasonable packaging experiment alongside subscriptions. Avoid requiring a contractor to understand credits just to correct a dimension. Do not build high-resolution 3D export infrastructure merely to imitate its pricing system.

## Technical research and adopted decisions

**View geometry:** MDN documents SVG `viewBox` as user coordinates mapped into a viewport [R6]. This supports an explicit view transform. The decision to keep physical measurements outside the renderer is our architectural recommendation, not a requirement to rewrite the existing editor in SVG immediately.

**Authorization:** OWASP calls for object authorization on every operation receiving a resource ID [R7]. PostgreSQL documents row policies and privileged-role bypass behavior [R8]. Adopt server-side workspace checks and cross-tenant denial tests; consider row policies only with the actual runtime role and connection model verified.

**Safe saves:** MDN documents `If-Match` and 412 precondition failure for conditional writes [R9]. Adopt revision-based optimistic concurrency, a conflict UI and retry idempotency. Do not use silent last-write-wins for customer measurements.

**Host/editor messaging:** MDN's postMessage documentation covers explicit origin targeting and sender checks [R10]. Begin with a hosted product flow, with narrow one-time launch exchange and allowlisted return context. An iframe cannot serve as an authorization boundary.

**Browser tests:** Playwright documents assertions that retry until an expected UI state is reached [R12]. Use behavior assertions for save state, selection, dimensions and opening persistence, rather than fixed sleep delays or screenshot-only claims. Exact test-tool versions must match the existing runtime/toolchain.

## Sources

- **R1:** [magicplan — statistics definitions](https://help.magicplan.app/what-do-the-statistics-mean-in-magicplan)
- **R2:** [magicplan — PRO Estimator](https://help.magicplan.app/estimate-plan)
- **R3:** [magicplan — pricing](https://magicplan.app/pricing)
- **R4:** [RoomSketcher — area calculation definitions](https://help.roomsketcher.com/hc/en-us/articles/213924629-Can-I-Calculate-the-Total-Area-of-a-Floor-Plan)
- **R5:** [RoomSketcher — pricing](https://www.roomsketcher.com/pricing/)
- **R6:** [MDN — SVG viewBox](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/viewBox)
- **R7:** [OWASP — API1:2023 Object Level Authorization](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)
- **R8:** [PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- **R9:** [MDN — If-Match](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/If-Match)
- **R10:** [MDN — Window.postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
- **R11:** [Floorplanner — pricing](https://floorplanner.com/pricing)
- **R12:** [Playwright — assertions](https://playwright.dev/docs/test-assertions)

## Audit disposition

F01–F03: first implementation task. F04–F05: measurement engine and compatibility model. F06: hard customer/partner launch gate. F07: dependable standalone release. F08: M1 evidence harness. F09: quick-room UX acceptance. F10: resolved as a planning-document hierarchy, not as proof that historical functionality works.

Deployment status, local unpublished document contents, saved-plan ownership, operating costs and market demand remain unverified. No application fixes, tests, migrations or production releases are claimed by this audit.
