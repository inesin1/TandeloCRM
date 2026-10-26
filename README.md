<div align="center">
  <img src="assets/tandelo-logo.svg" alt="Tandelo logo" width="64" height="64" />
  <h1>Tandelo</h1>
  <p><strong>A self-hosted CRM for sales workflows.</strong></p>
  <p>
    <a href="https://github.com/inesin1/TandeloCRM/actions/workflows/ci.yml">
      <img alt="CI" src="https://github.com/inesin1/TandeloCRM/actions/workflows/ci.yml/badge.svg?branch=main" />
    </a>
    <img alt="Self-hosted CRM" src="https://img.shields.io/badge/Self--hosted-CRM-1f9d55?style=flat-square&logo=server&logoColor=white" />
    <img alt="MVP in development" src="https://img.shields.io/badge/MVP-in%20development-f59e0b?style=flat-square" />
  </p>
</div>

Tandelo brings leads, companies, contacts, pipelines, and lead-linked tasks into one app. The frontend uses Angular, the API uses NestJS, and PostgreSQL stores the data.

This is an active MVP project. There is no hosted demo, and the seed command does not create sample CRM records.

[Releases](https://github.com/inesin1/TandeloCRM/releases) · [Changelog](CHANGELOG.md) · [HomeLab Deployment](HOMELAB_DEPLOY.md)

## Features

- View leads in board and list layouts across pipelines.
- Link leads to companies and contacts.
- Create and complete tasks attached to leads, with optional assignees.
- Manage users and groups with Admin and Member access levels.
- Enforce permissions in the API and authenticate users with JWT.
- Review lead counts and total value by pipeline stage.
- Define custom fields for CRM records.
- Use Copilot for private CRM chat, permission-aware record search and summaries, and confirmed proposals for supported changes.

## Architecture

```text
Browser
  |
  v
Angular web app
  |
  v
NestJS API (/api)
  ├── Authentication and access control
  ├── Leads and pipelines
  ├── Companies, contacts, and tasks
  ├── Copilot (optional, configurable AI provider)
  ├── Custom fields and analytics
  └── Users and groups
  |
  v
PostgreSQL
```

The API is divided into NestJS modules. Drizzle ORM manages the PostgreSQL schema and migrations. OpenAPI documentation is available at `/api/docs` while the API is running.

## Tech stack

<p>
  <img alt="Angular" src="https://img.shields.io/badge/Angular-DD0031?style=flat-square&logo=angular&logoColor=white" />
  <img alt="PrimeNG" src="https://img.shields.io/badge/PrimeNG-8B5CF6?style=flat-square&logo=prime&logoColor=white" />
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
  <img alt="Nx" src="https://img.shields.io/badge/Nx-143055?style=flat-square&logo=nx&logoColor=white" />
  <img alt="Vitest" src="https://img.shields.io/badge/Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white" />
  <img alt="Playwright" src="https://img.shields.io/badge/Playwright-45ba4b?style=flat-square&logo=playwright&logoColor=white" />
</p>

- Angular and PrimeNG for the frontend
- NestJS for backend services
- Drizzle ORM and PostgreSQL for the data layer
- Nx for monorepo orchestration
- Vitest for unit tests and Playwright for browser tests

## Quick start

You need Node.js 26, pnpm 12, and Docker with Compose. This setup runs the web app and API locally with PostgreSQL in Docker; it is intended for development.

Create your local environment file and generate a JWT secret:

```bash
cp .env.example .env
openssl rand -hex 32
```

Put the generated value in `JWT_SECRET` in `.env`. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` there before creating the first user.

Install dependencies, start PostgreSQL, and prepare the database:

```bash
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed-admin
```

`db:seed-admin` also initializes the built-in roles and permissions. The separate `pnpm db:seed` command initializes those records without creating an admin. Neither command adds sample leads, companies, or contacts.

Start the web app and API in separate terminals:

```bash
pnpm nx run web:serve
```

```bash
pnpm nx run api:serve
```

Open the web app at `http://localhost:4200`. The API runs at `http://localhost:3000`; its Swagger UI is at `http://localhost:3000/api/docs`.

## Copilot

Copilot is disabled by default. After applying migrations with `pnpm db:migrate`, administrators can configure it under **Settings → Integrations**. Management requires `users:write`, the existing permission for user administration. Choose Responses API or OpenAI-compatible Chat Completions, enter the API base URL (including `/v1` if required), model, and optional API key, then save. A saved workspace configuration takes precedence over environment defaults and applies to new messages without restarting the API. An active response keeps one configuration for its entire tool cycle. **Test saved connection** sends a synthetic request with no CRM data; it contacts the configured provider and may incur its normal usage charges. The selected model must support function calling and strict JSON-schema output. Normal automated tests use deterministic fakes and do not contact a provider.

For environment-based setup, set `COPILOT_ENABLED=true`, `COPILOT_API_FORMAT=responses` or `chat-completions`, `COPILOT_BASE_URL`, `COPILOT_MODEL`, and `COPILOT_API_KEY` if required. Defaults are Responses API and `https://api.openai.com/v1`; there is no default model. The existing `OPENAI_API_KEY` remains supported only for that default URL. A local compatible server can use a URL such as `http://localhost:11434/v1` without a key; choose an installed model that supports the required features. The URL is reached from the API server, so `localhost` inside Docker refers to its own container. Native Anthropic and Gemini protocols are not supported; a gateway must expose one of the two supported API formats.

API keys saved through the interface are encrypted with AES-256-GCM using a key derived from `JWT_SECRET`; they are never returned to the browser. Keep that secret stable and secure alongside database backups. After rotating `JWT_SECRET`, re-enter the provider key in Settings. Leave the key field blank to retain it, or explicitly remove/replace it. Changing the base URL clears the old key rather than sending it to a different provider. Use HTTPS for remote providers; HTTP is intended for trusted local servers. Redirects are not followed. Saved settings, including an explicitly disabled configuration, override environment settings.

Copilot can search leads, companies, contacts, and tasks; summarize supported CRM data and analytics; and prepare drafts. It can propose creating or updating leads, companies, contacts, or tasks, and adding a note. Each proposal shows the exact change and requires its own confirmation. Confirmation records the change through the existing CRM service. Copilot cannot delete records, make bulk changes, send email, change users or permissions, or run background actions. Reads and proposals follow the signed-in user's current CRM permissions.

Conversations, messages, saved record references, run status, proposals, and confirmation results are stored in the app's PostgreSQL database. Deleting a conversation deletes its Copilot history and proposals, but does not undo CRM changes already confirmed. Provider requests set `store: false`; providers must support that parameter, but their own data-handling terms still apply. The configured provider receives the permitted history and tool results needed to answer the request. The API key stays on the server.

Limits are enforced by the API: 8,000 characters per message, 120 characters per chat title, one active run per chat, two per user, and 20 new runs per user in ten minutes. Each run allows up to six provider calls, 12 tool calls, 90 seconds, 20 history messages, and 60,000 serialized context characters. Searches return up to 20 records per page and three pages per selection. A proposal expires after 15 minutes. The API also limits each user to two live event streams per process; polling remains the fallback when streaming is unavailable.

The browser can reconnect to an accepted run after a refresh without sending the message again. Stopping a response cancels that run. A graceful API shutdown marks its locally running requests as failed so they can be retried as a new message. Provider, network, access, conflict, rate-limit, and disabled states are reported in the chat; a CRM write is complete only when its proposal status is `executed`.

## Development checks

```bash
pnpm nx run-many -t lint test build
pnpm nx run web-e2e:e2e
pnpm nx run api-e2e:e2e
```

If a local Angular build aborts inside the native LMDB cache without compiler diagnostics, run `CI=true pnpm nx run web:build:production` to disable Angular's persistent cache. This keeps compilation and bundle budget checks enabled.

Copilot browser tests mock API responses. API E2E uses the local API and database, so only run it with the intended development database and configured test records.

## Versions and releases

Tandelo uses one version for the API and web app. `package.json` is the source of truth, and Swagger reads that version too. Published versions are listed on the Releases page; commits on `main` after the latest release tag are unreleased. Version and changelog updates are managed by [Release Please](https://github.com/googleapis/release-please-action) in the CI workflow.

1. Use Conventional Commits: `feat:` for features, `fix:` for fixes, and `!` for breaking changes.
2. After successful CI on `main`, the release job creates or updates a release PR containing the next version and `CHANGELOG.md` entry. While the beta policy is active, releases use a `-beta.N` suffix with an incrementing prerelease number.
3. Review the release notes, upgrade requirements, and checks. If GitHub holds a bot-created PR's workflow runs for approval, select **Approve workflows to run**. CI can also be run manually from **Actions → CI → Run workflow**, selecting the release PR branch.
4. Merge the release PR when ready. After CI passes on `main`, the release job creates its `v…` tag and GitHub prerelease. Ordinary feature pushes do not publish a new release on their own.

The workflow uses the repository's `GITHUB_TOKEN`, with write permissions limited to the release job. GitHub's **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests** must be enabled. The job creates PRs; it does not approve or merge them. Stable releases require a deliberate change to the prerelease policy in `release-please-config.json` and review of the proposed version. This workflow does not publish npm packages, Docker images, or deploy an application.

## Updating an existing installation

Read the target release notes before updating. Back up PostgreSQL and `.env`, including the existing `JWT_SECRET`; saved Copilot keys depend on that secret. Stop the app, then run:

```bash
git fetch --tags origin
git checkout vX.Y.Z
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm nx run-many -t build -p api web
```

Replace `vX.Y.Z` with the actual target tag, then restart the API and web server using your installation's startup process. Current development code requires Node.js 26 and pnpm 12; upgrading from the initial beta also requires the Copilot migrations through `0006`. Run migrations once for the installation. Do not rerun user/access-control seed commands as an upgrade step: they can reset role assignments. Rolling code back does not roll the database back; restore a compatible backup if the release requires it.

For containerized production deployments on Docker and HomeLab infrastructure, refer to the [HomeLab Deployment Guide](HOMELAB_DEPLOY.md).

## Project structure

```text
├── apps/
│   ├── web/          - Angular frontend
│   ├── web-e2e/      - Playwright browser tests
│   ├── api/          - NestJS API and Drizzle migrations
│   └── api-e2e/      - API end-to-end tests
├── assets/           - project branding
├── .github/          - CI, Dependabot, and contribution templates
├── nx.json           - Nx workspace config
├── package.json      - workspace scripts and dependencies
└── pnpm-lock.yaml    - dependency lockfile
```

## Status and roadmap

The MVP covers leads, companies, contacts, pipelines, lead-linked tasks, access control, user and group administration, pipeline analytics, and optional Copilot assistance. Integrations, a plugin SDK, historical analytics, automation, and production deployment options are future work.

## Contributing

Contributions are welcome. Open an issue or propose a change to the CRM workflow, API, or documentation. Please review the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## License

Tandelo is licensed under the [MIT License](LICENSE).
