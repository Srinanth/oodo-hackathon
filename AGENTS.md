# Workspace Agent Instructions

These rules apply to all agents working in this repository. The product requirements, domain boundaries, API contract, feature status, and architecture decisions are maintained in `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/FEATURE_TRACKER.md`, and `docs/adr/`.

## Repository layout

- `frontend/` contains the React + TypeScript + Vite client and client-side feature modules.
- `backend/` contains the Django project, REST API, domain apps, and Django models/migrations.
- `db/` contains the reviewed PostgreSQL schema reference and ER diagram. Django models and migrations in `backend/` are the executable source of truth; update the reference schema when those models change.
- Keep frontend and backend in their respective folders. Do not create a second app or schema definition at repository root.

## Team and branches

- Srinanth works on `dev/srinanth` only.
- Angelo works on `dev/angelo` only.
- Deepak works on `dev/deepak` only.
- `development` is the shared integration branch. `main` is the selection/demo release branch.
- Feature commits belong on the owner's `dev/<name>` branch. Never commit feature work directly to `development` or `main`.
- The owner completes and reviews a feature as one logical unit, updates its tracker entry, then creates one commit for that completed feature. Do not commit each small edit or leave a feature commit half done.
- Keep unrelated changes out of the feature commit. Do not amend, reset, rebase, or overwrite another teammate's commits without coordination.
- Do not merge owner branches into `development` or `main`. Srinanth/the project lead reviews conflicts and performs those merges after feature completion.
- If the current branch does not match the assigned owner, stop before editing or committing and tell the user which branch is checked out.

## Feature workflow

1. Read the relevant PRD requirements, architecture decision records, and API contract before changing a domain.
2. Claim the feature in `docs/FEATURE_TRACKER.md` by setting its status to `In progress` and recording the owner. Avoid claiming work already owned by a teammate.
3. Deliver the feature as a vertical slice across its assigned `frontend/` and `backend/` areas. Keep implementation inside the domain and use the documented module/API seams. Propose a documentation change before changing a shared contract.
4. Finish the feature's acceptance criteria, review the complete diff for unrelated changes, and update the tracker to `Done` in the same feature commit.
5. Make one descriptive commit for the completed feature. Include the feature ID in the message, for example `feat(SUB-01): implement subscription lifecycle`.
6. Report the commit hash, completed criteria, verification performed, and any follow-up work. Do not claim completion when acceptance criteria remain open.

## Shared contracts and decisions

- Record a material architecture choice or change in `docs/adr/` with context, decision, consequences, and status.
- Update `docs/API.md` whenever an endpoint, payload, authorization rule, or error contract changes.
- Update `docs/FEATURE_TRACKER.md` whenever feature ownership or status changes.
- Treat customer ownership checks, invoice history snapshots, and billing idempotency as required invariants.
- When a brief is ambiguous, preserve the current documented decision and flag the question rather than silently changing behavior.

## Collaboration and safety

- Do not edit files outside the repository or send messages to third parties.
- Do not expose secrets, credentials, customer data, or environment values in commits or responses.
- Do not commit credentials, local databases, generated build output, or temporary files.
- Preserve teammates' uncommitted work. Inspect status and the diff before staging; stage only files belonging to the completed feature.
