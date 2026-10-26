# Production deployment plan

Status: ready for implementation. Owner: Codex; implementation: agy, Gemini 3.8 Flash (High).

## Goal

Prepare Tandelo for the owner's Docker HomeLab, with a reproducible API/web build,
explicit database migration and bootstrap procedures, health checks, backups and
recovery instructions. Keep the existing local development workflow working.

## Phase 1 — repository preparation and local verification

Implement this phase now. Finish it before changing remote infrastructure.

1. Inspect repository instructions, resolved Nx targets, runtime configuration,
   database initialization, existing CI and Copilot streaming. Reuse existing
   build artifacts and `/api/health`; distinguish process liveness from database
   readiness. Read the HomeLab skill for deployment conventions:
   `/Users/artemnesin/.agents/skills/homelab-deploy/SKILL.md`.
2. Add deterministic multi-stage container builds for the NestJS API and Angular
   static frontend. Preserve Node/pnpm versions from the repository. Runtime API
   dependencies must include native modules correctly built for the image.
   Exclude secrets, local env files, dependency directories and caches from the
   Docker build context. Run application containers without root where practical.
3. Serve the SPA with deep-link fallback and proxy `/api` to the API on the same
   origin. Preserve Copilot SSE streaming, cancellation and long response timing.
   Keep API and database ports private; publish only the frontend to loopback.
4. Add `compose.deploy.yml`, using the existing external `homelab` network and
   shared PostgreSQL. Keep development `docker-compose.yml` unchanged. Use real
   health probes present in the final images, restart policies and an explicit
   runtime env file. Treat hostname, free host port, registered runner labels and
   Infisical project values as unverified configuration inputs.
5. Provide runnable, explicit migration and first-admin bootstrap commands using
   the built images or a dedicated tooling target. Preserve all applied migrations.
   Deploy/update never reruns access-control seeds. Migration is a separate
   deliberate step; readiness alone does not apply migrations. New installations
   initialize roles and admin once, with credentials supplied at runtime.
6. Prepare HomeLab CI/CD following the skill: `deploy-home` branch/manual trigger,
   repository runner, Infisical OIDC, serialized deployments and temporary secret
   file cleanup on both success and failure. Keep the current CI/release workflow.
   Missing runner/project configuration must be explicit; do not invent live facts.
   Keep production migration and first-user bootstrap out of automatic startup.
7. Write `HOMELAB_DEPLOY.md` covering setup, required env and GitHub variables,
   shared DB/user, Caddy, migration sequence, first install, update, backup and
   restore, rollback, HomeLab Control and remaining infrastructure prerequisites.
   Include executable backup/restore commands that use placeholders, preserve
   JWT_SECRET for encrypted Copilot keys, and restore only to an explicitly chosen
   disposable/new database during verification. Link the guide from README.
8. Run focused tests for changed behavior and deployment configuration; build API
   and web through pnpm Nx. Validate Compose with dummy configuration without
   logging secrets. If Docker is available, build and smoke-test against an
   isolated disposable DB/network, never the developer or production database.
   Test health, SPA deep links, API proxy and SSE where feasible. Record every
   command's outcome and distinguish unavailable checks from passing checks.

Acceptance:

- A documented clean installation can build and start API/web, apply migrations
  explicitly, bootstrap one admin, and use CRM and Copilot through the frontend.
- Update instructions preserve records, permissions, migration history and saved
  Copilot credentials. Backup and restore steps state where to stop writes.
- Repository prep has no real credentials, production database access, deployment,
  pushes or commits. Existing architecture and release behavior are preserved.
- An implementation report lists changed files, checks and unresolved prerequisites;
  unavailable Docker/remote checks remain outstanding acceptance items.

## Phase 2 — infrastructure configuration

Pending Phase 1 review and verified infrastructure access/values. Confirm the
shared network/DB, allocate a limited application DB role, select an unused
loopback host port and LAN hostname, verify runner labels, configure Infisical
secrets/OIDC and repository variables, Caddy routing and HomeLab Control.
Do not put real values or credentials into this plan.

Acceptance: the runner can fetch this project's prod secrets, proxy routing reaches
the intended container, and Stop/Start/Game Mode manage the application and runner.

## Phase 3 — installation and recovery rehearsal

Pending Phase 2. Take a backup before upgrading an existing installation. Deploy
the reviewed revision, migrate explicitly, bootstrap only a new installation,
and verify login, record operations, permissions and Copilot streaming/confirmation
when configured. Restore a backup into a separate database and verify the restored
records and encrypted Copilot settings. Document image/code rollback separately
from database recovery.

Acceptance: smoke tests and a restore rehearsal have observed results; report the
deployed revision and all remaining limits. A running container alone is not proof
of successful deployment or recoverability.

## Implementation boundaries

The delegated implementer owns only Phase 1 deployment files, deployment docs,
minimal required API readiness changes and their focused tests. Read adjacent
source only as needed. Others may edit this workspace: preserve their changes.
Do not add features, refactor business logic, change authentication/permissions,
edit applied migrations, access real secrets, deploy remotely, commit or push.
If a command is unavailable or blocked, report it rather than bypassing controls.
