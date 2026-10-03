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

## Features

- View leads in board and list layouts across pipelines.
- Link leads to companies and contacts.
- Create and complete tasks attached to leads, with optional assignees.
- Manage users and groups with Admin and Member access levels.
- Enforce permissions in the API and authenticate users with JWT.
- Review lead counts and total value by pipeline stage.
- Define custom fields for CRM records.

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

You need Node.js 22, pnpm 10, and Docker with Compose. This setup runs the web app and API locally with PostgreSQL in Docker; it is intended for development.

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

## Development checks

```bash
pnpm nx run-many -t lint test build
pnpm nx run web-e2e:e2e
pnpm nx run api-e2e:e2e
```

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

The MVP covers leads, companies, contacts, pipelines, lead-linked tasks, access control, user and group administration, and pipeline analytics. Integrations, a plugin SDK, AI assistance, historical analytics, automation, and production deployment options are future work.

## Contributing

Contributions are welcome. Open an issue or propose a change to the CRM workflow, API, or documentation. Please review the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## License

Tandelo is licensed under the [MIT License](LICENSE).
