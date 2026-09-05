# Ecosystem working instructions

Read `ECOSYSTEM.md`, then `docs/ecosystem/MY_WAY_WORKFLOW.md` before ecosystem work. The active blueprint package is v1.1: the v1.0 architecture plus the controlling My Way amendment. Do not create or use an ecosystem-control directory or a combined repository.

At task start, verify the actual root, normalized remote, branch, HEAD and working tree. Read this repository's roadmap and the assigned issue; check related open ecosystem issues for active writers and dependencies. Use a verified repo-local `.ecosystem.local.json` for paths when available, never a guessed folder name. Preserve unrelated changes.

TRIGGER: owner feedback, a reproducible defect, or a missing cross-product capability encountered during an assigned task must be routed by diagnosed ownership. Search for an existing owner-repository issue; update it or create one using `.github/ISSUE_TEMPLATE/ecosystem-change.md`. Record the request, affected consumer, requirement ID, producer, acceptance check and authorization. Do not build the other product's engine in this repo. A photo-looking bug can still belong to the host adapter; diagnose first.

Explicitly requested bounded fixes may proceed in the owning repository when its local root, applicable instructions, access permission and writer availability are verified. Read that target's AGENTS.md; announce the target; use explicit working directories; keep commits separate. A shell directory change does not grant access or reload all instructions. Otherwise leave a complete issue/handoff marked READY or BLOCKED_ACCESS; do not claim another chat or worker started.

For authorized ordinary changes, deliver small compatible commits directly to the verified production branch, with applicable fast checks and production smoke. No mandatory staging or preview step. No force push, shared dirty checkout, unrelated migration, secret exposure or live money movement. Existing tool permissions and task-specific approvals remain binding. One writer/release owner per repo; other repos may progress concurrently.

Record commit, deployment evidence and originating-consumer verification before closing an integration issue. Queued is not started; committed is not deployed; deployed is not integration-verified. Broad photo/drawing work stays parked unless a specific task is activated. Instructions and issues do not create a background runner or synchronize chats automatically.
