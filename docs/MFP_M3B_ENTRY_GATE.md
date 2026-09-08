# MFP-M3B entry gate: shared draft, ceiling height and takeoff boundaries

Date: 2026-09-08
Requirement: DR-002 / MFP-M3B
Issue: [MFP-M3B / issue #10](https://github.com/armentrout1/ModernFloorPlanner/issues/10)
Gate: **BLOCKED - fresh full browser baseline is 95/96. Design review complete; feature implementation must wait.**
Implementation: NOT STARTED. This assignment changes documentation only.
Canonical sequence: [BUILD_ROADMAP.md](BUILD_ROADMAP.md); this is its design/evidence record, not another roadmap.

## 1. Verified baseline and preservation

The existing Modern Floor Planner checkout is on main, tracking origin/main, with origin armentrout1/ModernFloorPlanner. Entry HEAD was documentation-only checkpoint `6b8ef92d2ea4347918a95b7c5502f603d78820d8`; origin/main was `91402e8ced8b0121b12d1f53e54714d14fe5f173`. The checkpoint changed only BUILD_ROADMAP.md, was the sole unpublished commit, and was safely fast-forward pushed after fetching and checking divergence. The fresh integration source is therefore 6b8ef92; application code is unchanged from 91402e8. No reset, force push, stash operation or application edit was performed.

Available local task/worktree/process checks found no other Modern Floor Planner writer. The owner's tab at 127.0.0.1:5173, live sketch and Quick Rooms draft were not inspected, reloaded or operated on. The existing dev server and its dependencies were not restarted/reinstalled. Browser drafts are not claimed saved to Git or an account. The named historical stash remains at `779950aeaa1b81fc8955ad8f399ab87ae5e59063`; the archived original roadmap SHA-256 remains `4AA44769A3AF1CC8A4FE940B09E024109FEA19630F61181772B42F7EFDB7BCF1`.

Fresh checks ran serially against a disposable tracked-source `git archive` of 6b8ef92, with Node 20.20.2 / npm 10.8.2. This is a test directory without Git metadata, not a second product checkout. All 232 tracked files matched the commit after Git's CRLF conversion (48 byte-identical, 184 line-ending-only); none differed in content. No owner draft, .env or database credentials were copied. Playwright uses isolated browser contexts and local fixtures at 4173/4174, including disposable in-memory APIs, not the owner's 5173 tab or a production database.

| Fresh command | Actual result | Exit | Duration |
| --- | --- | --- | --- |
| `npm ci` | Added 505 packages; audited 506. Completed with advisories below. | 0 | 8.62 s |
| `npm test` | 234/234 passed; 0 failed, skipped or cancelled. | 0 | 1.93 s |
| `npm run check` | TypeScript passed. | 0 | 5.69 s |
| `npm run build` | Vite frontend and esbuild server passed; 1,803 modules transformed. | 0 | 4.59 s |
| `npx playwright test --reporter=line` | 96 tests, one worker, no retries: **95 passed, 1 failed**. Full run, no grep or targeted replacement run. | 1 | 261.56 s |
| `git diff --check` | Passed in the actual checkout, including final documentation before commit. | 0 | Not timed |

Commands ran on 2026-09-08; full browser run was 14:04:12-14:08:33 UTC. npm reported 28 dependency vulnerabilities (4 low, 10 moderate, 14 high) and deprecated esbuild-kit packages. Build warnings: old caniuse-lite data and a main chunk over 500 kB. No audit fix, dependency update or warning suppression was applied; advisory remediation remains scoped readiness work under issue #4. These warnings are separate from the failing browser gate.

**Only failing case:** `tests/browser/canvas-view.spec.ts:182`, opening placement after a scaled fit and later viewport resize; assertion at line 199. At 820 x 720 the test captures Bedroom's bounding box BEFORE selecting the room. Selection reveals Center Selected Room, the bottom controls wrap, the canvas height changes and the fitted view recenters upward about 20 CSS pixels. The test then places a window with its stale pre-selection coordinates. The captured click (338.069, 379.896) hits Living room's top wall; saved data correctly records that room/top attachment at approximately 50.523%, whereas the assertion expects only Bedroom's bottom wall to change. Retained trace frames show the reflow. This diagnoses a test-coordinate defect, not evidence that a correctly targeted window reverses walls. It still prevents claiming a full integration pass.

**Required gate repair:** in a separately assigned bounded follow-up, obtain the target wall's current bounds/scale AFTER selection and tool activation have settled; preserve the non-1 scale assertion, exact intended-room/wall/offset checks, no-other-room mutation and post-resize/save checks. Do not weaken the assertion, raise timeouts or redesign the controls to make the test pass. Re-run the corrected focused case and then the full requested isolated baseline on its new commit. No repair or rerun was performed during this documentation assignment.

Raw command logs, per-command JSON, full tracked-file hash verification and the failed trace/screenshots remain in the local task evidence directory `work/m3b-entry-gate/evidence-6b8ef92`. The committed [sanitized baseline manifest](evidence/MFP_M3B_BASELINE_2026-09-08.json) records source/lock identity, counts, versions and evidence hashes. Post-run verification found zero tracked-source mismatches. Fixture ports 4173/4174 stopped; the owner's 5173 process remained PID 15820.

The fresh full run supersedes historical targeted counts as the current integration baseline. Earlier results remain dated evidence, not retroactively revoked or combined into a full pass. Read: [M2A](MFP_M2A_RESULTS.md), [M2B](MFP_M2B_RESULTS.md), [M2C](MFP_M2C_RESULTS.md), [M3A](MFP_M3A_RESULTS.md), [latest editor UX](MFP_EDITOR_UX_RESULTS.md), [centering](MFP_CANVAS_CENTERING_RESULTS.md), [pan/zoom](MFP_CANVAS_PAN_RESULTS.md), and [issue #9's latest ceiling/takeoff addition](https://github.com/armentrout1/ModernFloorPlanner/issues/9#issuecomment-5586261905).

Deployment and production smoke: NOT VERIFIED / NOT DEPLOYED. Real PostgreSQL persistence and authenticated workspace isolation were not exercised by fixture tests. Hosting issue #4 remains PROPOSED; M4 remains the customer-access gate. No hosting, database, identity or runtime-version changes are authorized here.

## 2. Current runtime versus selected M3B design

Today Quick Rooms at /quick-room and the legacy sketch at / are independent drafts, not synchronized. Quick Rooms already stores physical schemaVersion 2 and exposes `physicalRoom.ceilingHeight`; legacy `room.height` is a vertical PLAN dimension in pixels. Existing shared quantities are authoritative for the physical workflow. Recent grouping, opening selection, door handing/styles, window height, compact controls, panel toggles, preview and viewport fixes must be retained; they do not already implement this bridge.

**Selected design: one selected physical draft, with two views.** An application-level draft registry/provider above the routes owns the selected draft ID and its complete physical document. Quick Rooms cards, the drawing inspector, the derived sketch and quantity requests all resolve that same identity. They dispatch the same measurement/command actions. There is no second editable Room[] copy to synchronize by effects and no second ceiling-height field.

Each draft entry owns its full physical document, raw field text with the unit context in which it was entered, validation state, measurement actions/evidence and selected work. Selection and per-view camera state are separate transient presentation concerns. Switching views keeps the draft ID; choosing another draft is explicit. Draft identity is local, not a fabricated server revision or authorization token.

Adoption is explicit and copies ONE source: current Quick Rooms draft, supported legacy sketch, or a new empty physical draft. A source summary identifies the source and conversion/review limitations. Both independent originals remain available. Never merge a Quick Rooms room into a legacy room by matching name, size, position or current selection; never overwrite an original merely by opening the other view. Duplicate/adopted documents have distinct draft identities; preserved domain IDs are scoped by their document. Intentional room duplication regenerates its room/wall/opening IDs consistently.

Render the physical document through a detached millimeter-to-view projection, preserving its supported layout/appearance. Pixels, view fit, zoom, pan and group visibility are never canonical measurements. Missing dimensions remain unresolved; a nonmeasured schematic placeholder must not masquerade as measured geometry. Reuse current rendering and viewport behavior. Only typed, tested commands may write from the physical view; an unsupported command is visibly unavailable and cannot secretly mutate the standalone legacy draft. Do not rebuild the framework or drawing engine.

Quantity requests read the selected document and explicit selected scope. Derived totals are not stored as authoritative measurements. Invalid/pending numeric input masks only dependent outputs so that the inspector never displays stale wall quantities while height text is invalid. An Enter followed by blur commits once. A unit change cannot reinterpret uncommitted text.

## 3. Ceiling-height and applicability contract

Use the existing `physicalRoom.ceilingHeight` measurement in both the room form and visible drawing inspector. For the first supported model it means finished-floor to finished-ceiling height for vertical uniform-height walls. Keep it distinct from plan length/width, level elevation, floor-to-floor stair rise, rough framing height, slab thickness and suspended-ceiling plenum. None is inferred from another.

Manual changes, presets and newly imported dimensions remain unconfirmed unless the existing explicit measurement confirmation action is performed. Preserve valid prior evidence; an edit invalidates confirmation only as the existing action rules require. Missing historical ceiling/sill dimensions stay unknown. Optional Apply to selected rooms is deferred to a separately bounded action with explicit targets and overwrite protection, not an implicit global height.

Unsupported ceiling shapes require a typed contract consumed by shared validation, readiness, calculation AND snapshots. A warning in React or arbitrary metadata is insufficient: current v1 readiness assumes flat ceiling L x W, and current v1 geometry/content hashes exclude arbitrary metadata.

Retain physical schemaVersion 2 and the existing measurements/room/opening shapes. Add this explicitly versioned calculation contract on the SAME document during implementation:

```text
calculationContract.version = room-applicability-v1
calculationContract.rooms[roomId] = {
  ceiling: declaration(flat | unknown | unsupported),
  walls: declaration(vertical-uniform | unknown | unsupported),
  crownPath: declaration(rectangular-horizontal | unknown | unsupported)
}
declaration = { value, source, confirmation, detail? }
quantityPolicyVersion = rectangular-flat-v2
```

Require exactly one profile per room, valid room references and typed source/confirmation states. Unknown/unsupported declarations carry a preserved reason/source. Separate declarations prevent a ceiling limitation from automatically blocking independently supported wall or floor quantities. A vertical-uniform wall declaration explicitly establishes that ceilingHeight is also the uniform finished-wall height used by this first model. An arbitrary height entered for a nonflat ceiling cannot acquire that meaning automatically; keep the wall declaration unknown when it is unresolved. A proposed supported model permits explicitly provisional calculations; unconfirmed applicability keeps its dependent outputs provisional even if their dimensions were already confirmed. It never creates confirmed dimensions. Missing historical shape evidence starts unknown until explicit review. Choosing a supported shape and confirming measurements are separate actions.

Shared readiness binds each output to its actual dependencies:

| Requested output | Additional applicability check |
| --- | --- |
| Floor area, floor-run trim, opening inventory | Retain existing rectangular floor/opening dependencies; unsupported ceiling alone does not block them. |
| Ceiling finish area | Requires supported flat ceiling with no unmodeled void, slope, step or soffit; unknown/unsupported yields no usable ceiling area. |
| Gross/net walls | Requires supported vertical uniform-height wall model and ceilingHeight; net walls also retain opening basis/fit/overlap checks. |
| Crown | Requires supported horizontal rectangular crown path; full-height gap deductions additionally require the supported wall-height model and their measured top/height dependencies. |
| Casing | Retain opening dimensions/basis and attachment fit; if its vertical-fit check relies on an unsupported/nonuniform wall profile, mark that selected result incomplete. Ceiling shape alone is not a blanket casing prohibition. |

Sloped, vaulted, stepped, soffit, void and separate-finish-height conditions are preserved with the affected scope and a visible Unsupported or Missing information reason. Do not erase entered height, invent slope geometry, or label projected floor area as verified ceiling finish area. Later geometry/policies may support those conditions. No new structural design is implied.

Pair the new contract with `rectangular-flat-v2`, `rectangular-engine-v2`, `quantity-result-v2` and `quantity-snapshot-v2`. Require contract/policy agreement; reject missing/mismatched/unknown combinations, including attempts to send new semantics to v1 evaluation. Use `physical-geometry-v2` and `calculation-content-v2` fingerprints: applicability values affect geometry/calculation basis; their source/review evidence affects content; presentation-only view changes do not. Full snapshot capture retains the whole document and evidence.

Keep v1 calculation and snapshot verification dispatch frozen for already captured documents/results. A schemaVersion-2 document with an older policy is not silently reinterpreted under the new policy. Explicit adoption/upgrade produces a new working draft and new evaluation, preserving the source document and historical snapshots unchanged. The new contracts are design decisions, NOT code/schema changes made in this entry gate.

### Required ceiling acceptance, not claimed implemented

For a 12 x 10 ft rectangular room with no openings and a supported flat/uniform profile:

| Action | Floor | Flat ceiling | Gross walls |
| --- | --- | --- | --- |
| Set ceiling height to 8 ft | 120 sq ft | 120 sq ft | 352 sq ft |
| Change height to 9 ft in either view | 120 sq ft | 120 sq ft | 396 sq ft |
| Clear height in either view | 120 sq ft | 120 sq ft | Incomplete / unavailable, never zero |
| Mark ceiling unsupported while retaining supported walls and height | 120 sq ft | Unsupported, no flat-area certification | Remains independently eligible |
| Mark wall heights unsupported/nonuniform | 120 sq ft | Independently evaluated | Unsupported until a supported model exists |

These numeric values do not imply confirmation: manual/imported inputs yield provisional outputs until explicitly confirmed. Repeat with equivalent metric/fractional inputs, invalid raw edits, route changes and temporary recovery. General undo remains M3C; the shared command boundary must preserve action evidence so later supported undo can restore measurements and invalidate dependent outputs correctly. Assert same draft/room identity, preserved length/width/openings, single action per commit and unchanged original drafts. Missing legacy heights and unreviewed shape declarations must never acquire defaults or automatic confirmation.

## 4. Versioned import, grouping and recovery

**Freeze legacy-pixels-v1.** Its older fixtures remain valid: missing schemaVersion or 1 uses the historical 20 pixels/foot convention; captured physical v2 passes through validated and detached. Its preserved metadata is not permission to recalculate its past meaning.

Introduce an explicit opt-in `legacy-pixels-v2` importer for new legacy adoption, with a narrow compatibility.adapterVersion discriminator extension:

- Interpret validated recorded `windowProperties.height` in inches as physical millimeters (x 25.4), retaining original input/source as imported and unconfirmed. Missing window height/sill/ceiling stays unknown. Reject or retain unresolved invalid values with review evidence; do not borrow UI defaults.
- Preserve room/opening IDs, deterministic wall IDs, offsets, colors, stored door style/swing/hinge geometry and all originals/unknown nested metadata. Hand-label changes must not flip a saved hinge. Keep conflicting opening widths as review candidates; do not pick one silently.
- Map explicit `groupId` into a typed `sketch-editor-v1` editor contract on the document containing group IDs and member room IDs. Validate unique memberships and retain original values. After adoption this typed membership is the sole editable group authority; preserved metadata.groupId and compatibility.original remain inert source evidence. This encodes editor group behavior only, not shared-wall topology, levels or trade layers. Preserve common-delta group movement and attached opening placement when writable group commands are later connected.
- Record importer version, source lineage and before/after room/opening counts. Preserve original JSON separately from the working interpretation; do not strip fields to satisfy a narrower form.

For already captured physical v2, an explicit `physical-draft-upgrade-v1` operation creates a new detached working draft with source lineage and a field-review summary. It does not rerun the new importer over compatibility.original automatically. New interpretation of a recorded source field requires explicit selection/review; it cannot replace newer physical edits. Keep older snapshots and original capture byte/content semantics intact. Unknown future extensions are retained as recoverable original content and marked unsupported, not discarded by a partial editor.

Current `quick-room-draft-v1` recovery deliberately rejects openings, compatibility originals, extra domain content and confirmed-measurement states. Removing those guards would not make it lossless. Add a distinct `mfp-editor-draft-v1` envelope/key `modern-floor-planner:editor-draft:v1` for a registry of physical drafts and selected draft ID. Store the FULL document including applicability/editor contracts, openings, window heights, provenance/review evidence and original compatibility content, plus raw field text/unit context and selected work. Retain the old Quick Rooms storage key/bytes and legacy draft; explicit copy/adoption never overwrites them.

Validate the complete supported envelope, plain JSON/limits, measurement-event consistency and version before hydration. Preserve valid measurement evidence without manufacturing confirmation; inconsistent or unsupported captures remain quarantined/read-only with original bytes available. A hash is content integrity, not proof of identity or measurement. Stale writes must check draft identity and an envelope-local monotonic edit revision so switching drafts cannot overwrite another entry. This edit counter is not the physical revisionId, which remains null for unsaved drafts.

Storage quota/read/serialization failure keeps in-memory edits and last good recovery bytes and shows an actionable unsaved state. No delete-before-write. Keep unrecognized/corrupt bytes for explicit recovery/export/discard; do not auto-clear them. Account-backed persistence remains M4. Physical drafts must never be sent through legacy `/api/floor-plans`/saveSketch, or reconstructed for saving from a rounded pixel projection. Disable that save path for physical mode and label temporary recovery honestly.

## 5. Measured quantities are not a full construction material list

| Phase | Deliverable and required inputs |
| --- | --- |
| M3B | Shared-engine measured floor/ceiling/wall areas, gross/net opening deductions, trim lengths, physical opening inventory and explicit selected scope/provenance/missing inputs. Measured view defaults to zero waste; any existing allowance is separately labeled and applied once. |
| M7 | Selected, versioned material/system recipes: product/type/thickness/layers, installation and deduction basis, coverage/coats/primer, waste, package/stock size, accessories and compatible pooling. Separate net finish quantities, material consumption and rounded purchase quantities. |
| Later bounded trade modules | Their required assemblies, fixtures/routes/elevations/sizes/fittings/connectivity/schedules and supported design/rule inputs. Source plans, sections, specifications or confirmed field measurements supply hidden construction information. Never infer it from a room outline or missing symbols. |

M7 examples require specified systems: drywall panels, layers, sheet/cutting method, fasteners and compound; paint coverage/coats plus separate primer; flooring/tile coverage/pattern/underlayment or setting materials/transitions; suspended ceiling panels/grid/perimeter/tees/hangers from verified configuration. No universal waste, deduction or coverage factor. Compatible quantities may pool before package round-up; incompatible products must not. Linear trim plus allowance is not cutting optimization.

Framing must distinguish a unique physical wall assembly from its two finish faces before counting members; summing room perimeters is not stud-wall length. Members/spacing, plates, corners, openings, blocking and approved header details require explicit later inputs. Plumbing/electrical/HVAC need specified routes and connections, not just device counts. The app quantifies a selected design; this gate introduces no structural sizing or code certification.

Future scope identifies supported project/level/room/zone/trade and existing/retain/new/demolish state explicitly. Absence is not proof of nonexistence. Imported drawing dimensions require source revision and calibrated scale per view, with confirmation; pixels/printed scale/AI are not measurement proof. Zones cannot double-count parent floors, and clearance envelopes are not material surfaces.

Report each requested scope as Ready for review, Estimated with assumptions, Missing information, Unsupported or Not in scope, with exact blockers/source objects. Never advertise a global complete takeoff by silently excluding unsupported trades. Trace source/scope revision -> geometry -> policy/recipe -> net quantity -> allowance -> package estimate, retaining units, specifications, dates and explicit manual allowances. Prior snapshots stay stable. LedgerLine keeps financial pricing/tax/document authority; durable saving and PDF/CSV remain M4 or a separately assigned extension.

Levels before stairs, rooms/zones distinct from trade views, proposed M3D and later kitchen/bath/trade work remain as in the canonical roadmap. None is implemented or made a hidden prerequisite for this shared-draft slice.

## 6. First bounded implementation slice and gate disposition

**Gate result: BLOCKED on one existing browser regression.** The documentation/design entry work is complete, but M3B feature implementation is not eligible until the bounded test-coordinate correction and fresh full baseline pass. The single next implementation task is that regression repair under the M3B entry issue. Do not begin a UI redesign or the bridge while treating 95/96 as green.

**First M3B feature slice: shared selected physical draft and ceiling-height round trip.** Implement the selected provider/registry, explicit single-source adoption and versioned import/recovery foundation above; connect existing Quick Rooms measurement actions, one selected room's inspector and a read-only physical drawing projection. Show shared floor/flat-ceiling/gross-wall quantities and typed applicability/missing-input states. Add the narrowly versioned policy/snapshot dispatch required to make those states authoritative. Preserve originals and the standalone legacy editor. This slice is specified here, not started.

Exit requires the ceiling table, bidirectional field synchronization, independent-original preservation, newer group/window/door metadata, adapter idempotency, old snapshot verification, new applicability fingerprint sensitivity, view-only fingerprint invariance, raw-input/unit handling, full recovery/error preservation and existing M1-M3A/editor/parity regressions. A legacy-only drawing mutation cannot alter a physical draft, and physical mode cannot call legacy save.

Opening creation/edit forms, selected work/surface controls, writable geometry/group commands and full shared-engine breakdown remain subsequent bounded slices of M3B. Keep all completed legacy UX; remaining M3C gaps are inventoried later. No stairs, levels schema, trade models, cosmetic redesign, new framework, billing/partner work, hosting or database migration belongs in this entry gate or first slice.

Rollback for this documentation change is an ordinary reviewed revert; source baseline is 6b8ef92. The entry assignment ends after publishing its documentation/issue evidence. It does not authorize implementation or closing unreleased milestones.
