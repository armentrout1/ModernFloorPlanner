# My Way: production-first cross-product work

Blueprint package **v1.1**, 2026-09-05. This is the controlling amendment to the master architecture v1.0. Product ownership, independent businesses, UI reuse and data isolation remain unchanged. This amendment replaces conflicting v1.0 workspace and release-process directions.

## Owner decisions

Keep one repository, local folder and primary product chat per app. Do not create/use an ecosystem-control folder, new umbrella repository or required multi-root editor workspace. Do not delete anything that may already exist on the owner's computer.

Use production-first delivery for explicitly assigned work: small change -> relevant quick automated checks -> verified production branch -> normal deployment -> live acceptance check. There is no mandatory staging database, preview deployment or separate development-preview cycle. Fast checks in the existing checkout are not another hosted environment. Do not bypass existing branch protections or tool permissions to achieve direct delivery.

The owner reports being the initial user. Do not extrapolate this into permission to delete data, disable security or spend/move money. Keep unrelated work and existing customer data intact. Additional LedgerLine backup/timestamp gates remain deferred until the owner's three-user milestone; do not introduce that gate now or disable existing managed backups. Other products keep their explicit data/recovery policies.

This request activates documentation and coordination. Broad photo/drawing feature programs remain parked. A later explicit request for a bounded photo/drawing fix activates that task, not its entire backlog.

## The trigger, record and execution loop

The trigger is feedback or a discovered dependency in an ACTIVE AI task, not a watcher that runs when chats are closed.

1. Capture the owner's requested outcome or reproduce the failure. Identify the true owner: host workflow/adapter in FixDoneNow; financial engine/editor in LedgerLine; media/annotation/report capability in ProjectRoll; geometry/quantities/editor in the drawing product. Location on a screen alone is not ownership proof.
2. Search the owning repository's open issues by requirement ID and symptom. Update the existing issue or create one using the ecosystem-change template. Use the repository plus issue number as the unique task identity. Link the affected consumer and the capability ID in the shared register when this is a new dependency. Do not create a second independently maintained issue for the same fix in every repository.
3. Record status explicitly: PROPOSED, READY, WORKING, PRODUCER_VERIFIED, DEPLOYED, CONSUMER_VERIFIED, or BLOCKED. Record the assigned worker and current authorization. An issue alone neither authorizes a build nor launches another agent.
4. Execute an explicitly requested, bounded fix in the owner repo when access, local identity and writer availability are verified. Announce the target, read its instructions, use its own working directory and separate commit, then return to the original consumer check. Do not copy or move product files between apps to simulate switching.
5. Without target access, record BLOCKED_ACCESS and give a ready-to-run handoff containing the repo, requirement, reproduction, scope and test. Request the narrow supported permission or continue in that product's chat; never bypass the sandbox. Do not promise a worker was launched unless a tool actually launched it.
6. Validate and release the producer first when a compatible new interface is needed. Update/release the consumer second. Test the original workflow in the app where the request arose. Preserve old consumers while adding the new capability.
7. Append commit, actual deployment SHA/ID when observable, checks, unresolved limitations and consumer result. Close an integration task only after its originating workflow passes. A documented contract or mocked test is not deployed integration proof.

## Example: feedback while using FixDoneNow

Owner: "The photo annotation arrows are too hard to use. Fix it in the photo app, then check it here."

Diagnose whether the issue is ProjectRoll's shared annotation UI or FixDoneNow's adapter/layout. If ProjectRoll owns it, create/update a ProjectRoll task linked to PR-002, make the bounded change there, verify standalone behavior, deliver through ProjectRoll's production branch, then test the same embedded workflow in FixDoneNow. Record any version update the consumer actually requires. Other ProjectRoll consumers must remain compatible.

"Record this for later" means PROPOSED, not permission to implement. An unavailable photo API becomes a producer requirement, not an excuse to build another photo engine in FixDoneNow.

## Repo-local path setup

The portable map is `docs/ecosystem/REPOSITORIES.json`. Each local checkout may hold an ignored `.ecosystem.local.json` mapping those product keys to locally verified paths, remote identities and verification dates. Add that exact filename to local Git exclusions before writing machine paths. No central folder, relocation, automatic cloning or credentials in the map. Missing or ambiguous roots remain unresolved, not guessed.

Changing shell working directory, a chat's selected project and permission to edit a directory are distinct. Cross-repo work requires the allowed path AND the target's instructions. Remote GitHub edits do not update a local checkout automatically. Local agents fetch and reconcile normally without overwriting dirty files or another worker.

## Parallel work and release limits

Different product repos can have active workers concurrently. Serialize writes and publication within each repo. Do not point two live tasks at the same dirty checkout or silently switch its branch. Agree API/UI/event inputs, outputs and versions before dependent workers implement both sides. If the remote advances, reconcile; never force push.

Production-first does not mean one unrestricted release of every backlog item. Use a rollback reference, targeted tests and a specific live acceptance check per small change. Missing provider configuration or a new destructive migration is a concrete decision, not authority to improvise. Accounting posting, customer notification, media publication and money movement must respect their existing authorization boundaries.

## Shared policy and evidence

The coordinator updates shared policy and capability IDs in FixDoneNow and mirrors approved text to the other repos. Record which copies were actually updated; do not claim live synchronization. Product roadmaps remain product-specific. Read the repository documents/issues when resuming; no reliance on another chat remembering the conversation.

ECO-001 now means verify existing repo-local roots, not create ecosystem-control. ECO-003 means install these routing instructions and issue templates, then exercise one authorized handoff. Documentation publication completes the instructions portion only. Local verification and a real cross-product handoff still require execution evidence.

No continuous runner, automated polling, automatic chat creation or autonomous deployment service is created here. Those would be separate implementation tasks, not hidden prerequisites to using this workflow now.
