# Drawing and measurement product ecosystem roadmap

Blueprint version: 1.0. Repository candidate: `armentrout1/ModernFloorPlanner`. Initial source baseline: `5b1a92f5cc5972a2f23fa300395b283fc577847d`. Current activation: **DOCUMENTATION ONLY; drawing implementation parked.** Final drawing-product selection and local checkout remain unverified.

## Owned responsibility

The drawing product is independently usable and commercially separable. It owns drawing UI, geometry, dimensions, units, measurement provenance, takeoffs/quantity calculations, saved versions, exports and its tenant-scoped persistence and authorization. It exposes reusable interfaces to FixDoneNow and unrelated applications. FixDoneNow stores authorized drawing references, not the drawing engine or its canonical database.

## Source-supported starting point

The reviewed documentation describes rooms, dimensions, openings, drawing interaction, material calculations, save/load and print-oriented preview. Some exports/versioning are future work. Reviewed route/storage methods retrieve and mutate floor plans by ID and do not demonstrate a business/organization authorization boundary. These are source observations, not a live vulnerability test or production certification.

Evidence: [product documentation](../../MODERN_FLOOR_PLAN.md), [routes](../../server/routes.ts), [storage](../../server/storage.ts). Do not expose the existing methods as a multi-tenant integration without verifying and implementing the missing boundary in this product.

## Parked producer requirements

1. **ECO-001: identity and workspace.** Confirm that this repository is the intended drawing product and locate its local checkout. Preserve any existing plans, local changes and deployments. Do not rename the product or relocate folders automatically.
2. **DR-001: tenant foundation.** Define direct and enterprise customer modes, workspace membership, platform/app authority, authorized design/project ownership, idempotent creation and explicit consent for existing-workspace linking. Enforce isolation on list/get/write/export operations, not only in UI navigation.
3. **DR-002: reusable editor and quantities.** Reuse existing drawing components through a supported hosted/module/package interface. Return a versioned drawing reference plus quantity records with units, source geometry version, calculation method, waste/rounding assumptions, confirmed dimensions and uncertainty. Quantities feed LedgerLine-owned estimate lines; they are not financial totals.
4. **DR-002: export and version contract.** Specify supported image/vector/PDF output only after implementation proof. Define version snapshots, authorized download/share, expiry, callbacks and change notifications. ProjectRoll report composition receives drawing outputs through this interface, not direct database access.
5. **ECO-002: qualification.** Prove two businesses cannot read or overwrite each other's drawings, standalone editing still works, expired permissions are rejected, and revised geometry does not silently rewrite an issued estimate or report.

## Future domain AI

Drawing assistance and geometric/measurement reasoning belong here. Label measured versus inferred dimensions. Require user confirmation for estimating quantities when measurements are uncertain. Host conversation may invoke drawing tools but must not maintain an independent geometry engine.

## Boundaries

No application changes, deployments, authentication bypasses, production data actions or drawing-feature build are authorized by this blueprint. This repository is public: keep machine-specific local paths and private inventories outside it. Do not change repository visibility. Photo/drawing work remains parked while the initial business/financial integration contract is established.
