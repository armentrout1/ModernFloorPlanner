# Product ecosystem: start here

Active blueprint package: **v1.1 — My Way**, 2026-09-05.

Read:
1. [My Way workflow and controlling amendment](docs/ecosystem/MY_WAY_WORKFLOW.md)
2. [Master product architecture v1.0](docs/ecosystem/MASTER_PRODUCT_ECOSYSTEM_BLUEPRINT.md)
3. [Capability dependencies](docs/ecosystem/CAPABILITY_DEPENDENCIES.md)
4. [Product roadmap](docs/ecosystem/PRODUCT_ROADMAP.md)
5. [Repo-local workspace and parallel rules](docs/ecosystem/WORKSPACE_AND_PARALLEL_BUILD_RULES.md)

The My Way amendment supersedes old instructions about a control folder, combined workspace, documentation-branch-only delivery or mandatory staging/preview. Keep separate product repositories, local folders and product chats. Ordinary authorized releases go to the verified production branch. Specialized engines and UI stay in their owning products.

Canonical shared policy: `armentrout1/fixdonenow`, these paths on `main`. Other products carry mirrored policy. Cross-product execution tasks live as issues in the owning repository; the dependency register links capabilities, not duplicate task queues. No automatic worker or chat synchronization is installed by these documents. Local paths remain unverified until a local agent checks them.
