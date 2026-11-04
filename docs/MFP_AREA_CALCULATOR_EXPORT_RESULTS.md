# Area calculator Packet 4 - export and hardening results

Date: 2026-11-04
Issue: [#9](https://github.com/armentrout1/ModernFloorPlanner/issues/9) / DR-002
Entry commit: `7bc5b2f`
Status: **COMPLETE / PRODUCER_VERIFIED locally; NOT DEPLOYED**

## Delivered contract

The existing captured quantity report now includes an additive **Captured area grouping** section in CSV, HTML preview and print/PDF output. It answers the project, level and room area questions without introducing another calculator, route, report control, snapshot version or arithmetic path.

The grouping is a pure projection over records already stored in the immutable calculation snapshot:

- included outputs are floor area, flat ceiling area and gross wall area
- included targets are only the records selected when the snapshot was captured
- project rows include every captured record for an output
- schema 3-5 captures group those same records by their recorded levels and rooms
- schema 2 captures use the neutral `Historical / unassigned` level and do not invent ownership
- canonical values come from each record's captured `amounts.net`
- complete, provisional, partial and unavailable statuses are preserved
- exact included and excluded namespaced target IDs remain visible

Export does not invoke the geometry engine, expand to unselected rooms or outputs, reinterpret newer source bytes, or apply waste again. The detailed selected-work section remains below the grouped net-area summary and continues to carry its captured deductions, waste, allowances and adjusted totals.

## UX result

The phase adds no controls to the already established export workflow. The existing report source, report contents, prepare, CSV and print/PDF controls are unchanged. One explanatory sentence in the panel identifies the room/level/project grouping and its captured-target boundary.

In the report, the new section appears before **Selected quantities** so the beginner-facing answer is visible first while the existing evidence-rich takeoff remains intact. Long names wrap inside cells, table headers repeat across printed page breaks and partial/unavailable rows remain explicit.

## Verification

All checks used repository-owned code and synthetic data.

| Check | Result |
| --- | --- |
| `npm test` | 715 passed |
| Focused captured-summary and export renderer tests | 24 passed |
| Existing export/capture/drawing report regression set | 59 passed |
| `npm run check` | passed |
| `npm run build` | passed; existing large-chunk advisory only |
| Current-draft export and drawing Playwright suites | 12 passed |
| Saved-revision physical persistence/authorization browser suite | 24 passed |
| Quantity-only PDF | 8 A4 pages visually reviewed |
| Combined drawing and quantity PDF | 20 A4 pages visually reviewed |

The saved-revision suite used the repository's dedicated loopback-only PostgreSQL fixture with the `mfp_test` account. The harness verified the exact disposable data directory, created a randomly named test database, removed only that database during cleanup and then shut the fixture down.

Visual review confirmed:

- no clipped or overlapping grouping content
- readable project, level and room rows
- repeating table headers and stable page transitions
- wrapped long unbroken names without data loss
- rendered multilingual names
- unchanged provenance and uncertainty sections

## Compatibility and boundaries

This packet adds no package, route, schema, migration, database table, saved-document field or report authorization rule. Existing snapshot fingerprints and source/account revision identities remain authoritative. Downloaded-report privacy behavior, authorization on retrieval and immutable saved-revision selection remain unchanged.

This is area reporting, not purchasing or construction estimation. It does not add material recipes, coverage, package rounding, pricing, certified scale, surveyed area, code compliance or complete trade takeoffs.

## Release state

Publication on `main` uses a normal non-force push and is not a deployment. Live use and Packet 5 FixDoneNow integration remain blocked by the existing identity-provider, owner sign-in/consent, live database/hosting, pilot, workspace mapping and producer-contract gates.
