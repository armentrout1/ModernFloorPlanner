# Repo-local workspace and parallel-build rules

Active package v1.2. Read `MY_WAY_WORKFLOW.md` for operating policy and `CRM_AND_COMMERCIAL_AMENDMENT.md` for the bounded September 8 clarification. No ecosystem-control folder, shared repository or required multi-root workspace.

Use `REPOSITORIES.json` for product-to-GitHub identity. Store verified machine roots in an ignored `.ecosystem.local.json` inside each existing checkout as needed; add it to local Git exclusions before writing. Never put Windows usernames/paths, database URLs, tokens or private inventory in public commits. No secrets belong in this file.

At setup and before application edits verify: actual root, normalized origin, branch, HEAD, upstream, dirty status and worktree relationship. Preserve local-only commits, stashes and untracked work. A historical path is a search candidate, not current proof. Do not move, rename, reset, clean or clone repos merely for uniform folder names. Missing or multiple roots get a precise unresolved note.

For remote-only documentation, verify repository/ref/current HEAD and issue activity. Remote inspection does not establish local writer availability, saved browser drafts or a clean local checkout. Do not race a known active writer: publish isolated documentation changes and a merge handoff where needed, without imposing a new hosted staging/preview workflow.

A cross-repo task explicitly identifies its target and reads the target instructions. Access must be permitted by the execution environment; changing directories does not expand it. Keep commands scoped to the intended root. Keep separate product chats as the default; authorized cross-repo work is allowed when supported, not guaranteed by a document.

One writer per checkout and one publishing owner per repository. Workers in different repos may run concurrently. Check open ecosystem issues for in-progress work before claiming a task. Reconcile remote changes without force; do not share a dirty working tree. Use separate worktrees only when deliberately needed for same-repo parallelism, not as a new staging prerequisite.

Worker handoff: originating request; owner repo/issue; capability ID; verified root/remote; current SHA; authorized scope; compatible interface version; reproduction and acceptance; producer commit/deployment; consumer result. READY does not mean a worker started.

Read portable policy and product roadmap at session start, and reread after an authorized repo switch. Do not assume running sessions automatically reload changed instructions. Sync local main normally; remote documentation commits do not alter local folders. Historical v1 documentation branches are not the current operating instructions after a newer package is adopted. A new mirror branch is not adopted main until merged by the publishing owner.
