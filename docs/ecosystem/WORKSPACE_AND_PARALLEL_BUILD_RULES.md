# Workspace and parallel-build rules

Blueprint version: 1.0. This portable document contains no machine-specific secrets or absolute user paths.

## Repository registry

| Product key | Expected GitHub remote identity | Machine registry key | Selection |
| --- | --- | --- | --- |
| fixdonenow | armentrout1/fixdonenow | FIXDONENOW_ROOT | Known product; historical duplicate checkouts require selection |
| ledgerline | armentrout1/ledgerline | LEDGERLINE_ROOT | Known product; prior exact local root available |
| projectroll | armentrout1/projectroll | PROJECTROLL_ROOT | Known photo product; historical root available |
| drawing | armentrout1/ModernFloorPlanner | DRAWING_ROOT | Candidate; local root and final product choice not verified |

Record exact machine paths in a private local `workspace-registry.json` outside the repositories, or a private-only registry. Never publish usernames, local inventory, credentials, database URLs or private deployment configuration into a public repository. Do not change repository visibility as part of workspace setup.

For each checkout record: observed root, normalized remote identity, branch, HEAD, upstream, clean/dirty status, worktree/common-Git-directory relationship, stash count, timestamp, selected purpose, and whether it is canonical or a worker checkout. Historical paths are search candidates, not current filesystem proof.

## Locate before creating

Inspect known paths first, then relevant local Codex/GitHub/project directories for `.git` directories AND worktree `.git` files. Resolve `git rev-parse --show-toplevel` and remote identity. Never choose a folder merely because its name resembles the product.

Preserve all dirty files, stashes, local-only commits and worktrees. Do not move, rename, delete, reset or clean existing checkouts. Do not create new clones before resolving existing candidates. If a checkout truly does not exist, clone the verified repository into an explicitly chosen empty directory; do not initialize an unrelated new repository. A limited or failed search is not proof of absence.

One private editor workspace may point at all selected existing directories. It is a navigation file, not a fifth codebase and not a reason to relocate repositories. Record optional clean worker-worktree paths separately from canonical checkouts.

## Before every worker

Verify current path, root, normalized origin, branch, HEAD, upstream and status. Read `ECOSYSTEM.md`, this product's roadmap and assigned requirement IDs. Confirm the intended environment without printing values. Refuse unexpected roots, dirty overlap or unauthorized production configuration.

Assign one writer per checkout. Concurrent same-repository tasks require independent branches/worktrees and a named integrator. Stop for actual overlap; do not overwrite another worker's edits. Cross-product contracts are owned by their producer and coordinated through the shared register.

## Worker packet and return contract

Packet: product; requirement IDs; verified local root; expected remote; base SHA; task branch; owned files; API/UI/schema version; dependencies; tests; release scope; explicit exclusions.

Return: changed behavior and files; commit and push; actual validation commands/results; interface changes; consumer impact; unresolved requirements; production actions actually performed; next owner. Never label source checks as browser, database, or deployed integration proof.

## Shared-document synchronization

Canonical master and dependency register: FixDoneNow. Copies in other products must match its approved version byte-for-byte. Product roadmaps are product-specific. Record shared-file hashes and canonical commit in the handoff manifest. Synchronization is a deliberate coordinator action, not an already-running background process.

Keep each application's existing runtime/toolchain; there is no ecosystem-wide Node upgrade requirement. Do not move secrets between products. Test dependencies using actual supported interfaces, not cross-database access or forced readiness flags.
