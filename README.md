# Tandelo

Tandelo is a self-hosted CRM built around the deals pipeline: a kanban board for leads, contacts and companies in one place, tasks that keep deals from going cold, and an AI copilot for setup and lead management questions.

You run it on your own infrastructure: a NestJS API and a PostgreSQL database you control, under the MIT license. No vendor lock-in, no forced cloud plan.

## Built to be extended

Tandelo is an Nx monorepo split into apps, features and libraries with enforced module boundaries, not a single tangled codebase. The `plugin-sdk` library is the extension point: build an integration or a custom feature against that SDK instead of patching core source, and it survives upgrades.

## Features

- **Deals pipeline**: kanban board and list view, with stage colors, filters and saved views
- **Contacts & companies**: linked records for the people and businesses you sell to
- **Tasks**: follow-ups tied to leads so nothing slips
- **Analytics**: pipeline overview with period filters
- **AI copilot**: a side panel that answers setup and lead-management questions
- **Settings**: team and user management

## Tech stack

- Angular 22 + PrimeNG on the frontend
- NestJS + Drizzle ORM + PostgreSQL on the backend
- Nx monorepo, Vitest for unit tests, Playwright for e2e

## Getting started

```bash
# Install dependencies
pnpm install

# Serve the web app (Angular)
pnpm nx run web:serve

# Serve the API (NestJS)
pnpm nx run api:serve

# Build everything
pnpm nx run-many -t build

# Lint and test everything
pnpm nx run-many -t lint test

# Run e2e tests
pnpm nx run web-e2e:e2e

# Visualize the project graph
pnpm nx graph
```

## Project structure

```
├── apps/
│   ├── web/         - Angular frontend (deals, contacts, companies, tasks, analytics, copilot)
│   ├── web-e2e/      - Playwright e2e tests for the web app
│   ├── api/          - NestJS backend
│   └── api-e2e/      - e2e tests for the API
├── libs/
│   ├── plugin-sdk/   - extension point for integrations and custom features
│   └── shared/       - shared utilities
├── packages/
│   ├── shared/models/  - shared data models
│   └── api/products/   - API service libraries
└── nx.json           - Nx configuration
```

## Status

Early-stage and under active development. Expect rough edges.
