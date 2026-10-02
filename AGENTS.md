# Ecosystem working instructions

Read `ECOSYSTEM.md`, then `docs/ecosystem/MY_WAY_WORKFLOW.md` before ecosystem work. The active blueprint package is v1.1: the v1.0 architecture plus the controlling My Way amendment. Do not create or use an ecosystem-control directory or a combined repository.

At task start, verify the actual root, normalized remote, branch, HEAD and working tree. Read this repository's roadmap and the assigned issue; check related open ecosystem issues for active writers and dependencies. Use a verified repo-local `.ecosystem.local.json` for paths when available, never a guessed folder name. Preserve unrelated changes.

TRIGGER: owner feedback, a reproducible defect, or a missing cross-product capability encountered during an assigned task must be routed by diagnosed ownership. Search for an existing owner-repository issue; update it or create one using `.github/ISSUE_TEMPLATE/ecosystem-change.md`. Record the request, affected consumer, requirement ID, producer, acceptance check and authorization. Do not build the other product's engine in this repo. A photo-looking bug can still belong to the host adapter; diagnose first.

Explicitly requested bounded fixes may proceed in the owning repository when its local root, applicable instructions, access permission and writer availability are verified. Read that target's AGENTS.md; announce the target; use explicit working directories; keep commits separate. A shell directory change does not grant access or reload all instructions. Otherwise leave a complete issue/handoff marked READY or BLOCKED_ACCESS; do not claim another chat or worker started.

For authorized ordinary changes, deliver small compatible commits directly to the verified production branch, with applicable fast checks and production smoke. No mandatory staging or preview step. No force push, shared dirty checkout, unrelated migration, secret exposure or live money movement. Existing tool permissions and task-specific approvals remain binding. One writer/release owner per repo; other repos may progress concurrently.

Record commit, deployment evidence and originating-consumer verification before closing an integration issue. Queued is not started; committed is not deployed; deployed is not integration-verified. Broad photo/drawing work stays parked unless a specific task is activated. Instructions and issues do not create a background runner or synchronize chats automatically.

## Modern Floor Planner planning activation — 2026-09-06

Read `docs/BUILD_ROADMAP.md` for the canonical product build sequence and `docs/RESEARCH_AND_AUDIT_2026-09-06.md` for baseline evidence. The owner's September 6 request activates researched roadmap publication and prepares M1 (issue #2); it does not implement or automatically start the full backlog. Follow each milestone's bounded assignment and gates.

Before implementation, reconcile the owner's existing local `Modern-Floor-Planner-Complete-Roadmap.md` with the committed roadmap without discarding unpublished changes. Verify local writer availability; remote issue searches cannot prove an idle local checkout. Historical feature documents are references, not runtime certification. Keep physical units and quantity logic independent from pixels; preserve legacy plans and opening behaviors. Do not duplicate LedgerLine's financial engine or another product's data ownership.

## Aaron Development Workflow (ADW) v1.0

This repository uses the Aaron Development Workflow by default. It supplements, and does not replace, stricter repository-specific safety, security, branching, migration, deployment, financial, or product rules elsewhere in this file or repository.

### Roles and handoff

- **ChatGPT is the architect/reviewer.** It should do the initial repository inspection, architecture reasoning, task decomposition, risk analysis, acceptance criteria, and pushed-code review whenever practical.
- **Codex is primarily the local implementation worker.** Use it when local multi-file implementation, test execution, or repo-local tooling is more efficient than direct GitHub edits.
- **GitHub is the handoff point.** Codex works on local files that ChatGPT cannot see through GitHub until they are committed and pushed.
- When ChatGPT can safely make a small, targeted GitHub change directly, prefer that over spending Codex credits unnecessarily.

### Before sending work to Codex

ChatGPT should narrow the task first and provide a bounded implementation packet containing, when known:

1. exact goal and out-of-scope items;
2. target repository and branch strategy;
3. likely files/components involved;
4. invariants and safety constraints;
5. acceptance criteria;
6. exact validation commands/checks;
7. whether commit/push is authorized for the task;
8. the recommended Codex model and effort level.

Avoid broad prompts such as "audit and fix everything" when the work can be decomposed into smaller verified tasks.

### Codex effort policy

Use the lowest effort that is appropriate for the work:

- **Low / fast:** mechanical edits, renames, isolated documentation, simple test updates, narrow UI changes.
- **Medium:** default for ordinary multi-file feature work, straightforward bugs, bounded refactors, and test implementation.
- **High:** only when needed for migrations, security-sensitive work, difficult state/concurrency bugs, architectural refactors, or changes spanning several tightly coupled subsystems.
- **Extra High:** exceptional use only when lower effort has failed or the problem is genuinely unusually difficult.

Do not spend higher effort merely because a task is large; first make the task smaller and more explicit.

### Codex local execution contract

For an authorized implementation task, Codex should:

1. verify local repository root, remote, branch, HEAD, and working tree before editing;
2. read all applicable repository instructions before changing code;
3. preserve unrelated local work;
4. implement only the authorized scope;
5. run the required validation and fix in-scope failures;
6. inspect the final diff for unintended changes;
7. create a coherent commit;
8. push the branch when the task authorizes push;
9. report branch, commit SHA, files changed, checks run, and any remaining blocker or risk.

A local-only Codex change is **not reviewable by ChatGPT through GitHub**. When ChatGPT review is the next step, Codex must commit and push first.

### GitHub review gate

After Codex pushes, ChatGPT should review the actual GitHub branch/commit/diff and available CI evidence rather than relying only on Codex's completion summary. The next action should be one of:

- accept and advance to the next bounded task;
- make or request a small corrective patch;
- send a narrowly scoped follow-up task to Codex;
- stop for a genuine owner decision, missing credential, safety gate, or external dependency.

### Consequential actions

Unless explicitly authorized in the current task and permitted by stricter repository rules, do not:

- merge or deploy;
- run production migrations or destructive database operations;
- move live money or alter billing;
- expose, rotate, or commit secrets;
- force-push, rewrite history, or discard unrelated work;
- claim real-world, production, Windows/hardware, or integration verification that was not actually performed.

### Completion standard

A coding task is complete only when implementation evidence matches the requested scope and acceptance criteria. Distinguish clearly between:

- planned;
- implemented locally;
- committed;
- pushed;
- reviewed;
- merged;
- deployed;
- production/integration verified.

Do not collapse those states into a single "done."
