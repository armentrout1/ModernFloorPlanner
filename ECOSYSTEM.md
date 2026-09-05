# Product ecosystem: start here

This repository participates in the **Master Product Ecosystem Blueprint v1.0**, dated September 4, 2026.

Read in this order:

1. [Master architecture and product boundaries](docs/ecosystem/MASTER_PRODUCT_ECOSYSTEM_BLUEPRINT.md)
2. [Cross-product capability dependencies](docs/ecosystem/CAPABILITY_DEPENDENCIES.md)
3. [This product's roadmap](docs/ecosystem/PRODUCT_ROADMAP.md)
4. [Workspace and parallel-build rules](docs/ecosystem/WORKSPACE_AND_PARALLEL_BUILD_RULES.md)

FixDoneNow is the initial integration/reference application, not the owner of every engine. LedgerLine, ProjectRoll, and the drawing product remain independently usable and commercially separable products. Stripe is an external provider, not an owned repository.

The canonical shared architecture and dependency register live in `armentrout1/fixdonenow` at the paths above. Other repositories carry versioned copies. A copy is not an automatic synchronization service. A coordinator must reconcile mirrors when shared contracts change.

This addition is documentation and working agreements only. Existing product roadmaps remain relevant within their domains. No application, database, credential, customer, or production configuration is changed by this blueprint.
