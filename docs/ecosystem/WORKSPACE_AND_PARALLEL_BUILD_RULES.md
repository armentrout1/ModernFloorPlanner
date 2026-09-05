# Repo-local workspace and parallel-build rules

Active package v1.1. Read `MY_WAY_WORKFLOW.md` first. No ecosystem-control folder, shared repository or required multi-root workspace.

Use `REPOSITORIES.json` for product-to-GitHub identity. Store verified machine roots in an ignored `.ecosystem.local.json` inside each existing checkout as needed; add it to local Git exclusions before writing. Never put Windows usernames/paths, database URLs, tokens or private inventory in public commits. No secrets belong in this file.

At setup and before edits verify: actual root, normalized origin, branch, HEAD, upstream, dirty status and worktree relationship. Preserve local-only commits, stashes and untracked work. A historical path is a search candidate, not current proof. Do not move, rename, reset, clean or clone repos merely for uniform folder names. Missing or multiple roots get a precise unresolved note.

A cross-repo task explicitly identifies its target and reads the target instructions. Access must be permitted by the execution environment; changing directories does not expand it. Keep commands scoped to the intended root. Keep separate product chats as the default; authorized cross-repo work is allowed when supported, not guaranteed by a document.

One writer per checkout and one publishing owner per repository. Workers in different repos may run concurrently. Check open ecosystem issues for in-progress work before claiming a task. Reconcile remote changes without force; do not share a dirty working tree. Use separate worktrees only when deliberately needed for same-repo parallelism, not as a new staging prerequisite.

Worker handoff: originating request; owner repo/issue; capability ID; verified root/remote; current SHA; authorized scope; compatible interface version; reproduction and acceptance; producer commit/deployment; consumer result. READY does not mean a worker started.

Read portable policy and product roadmap at session start, and reread after an authorized repo switch. Do not assume running sessions automatically reload changed instructions. Sync local main normally; remote documentation commits do not alter local folders. Historical v1 documentation branches are not the current operating instructions once v1.1 is on main.
