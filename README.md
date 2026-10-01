<div align="center" style="display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:12px;">
  <img src="assets/tandelo-logo.svg" alt="Tandelo logo" width="64" height="64" />
  <h1 style="margin:0; font-size:2.4em; line-height:1.1; display:inline-block;">Tandelo</h1>
</div>

<div align="center">
  <img alt="Self-hosted CRM" src="https://img.shields.io/badge/Self--hosted-CRM-1f9d55?style=flat-square&logo=server&logoColor=white" />
  <img alt="Modular codebase" src="https://img.shields.io/badge/Modular-codebase-0ea5e9?style=flat-square&logo=package&logoColor=white" />
  <img alt="MVP in development" src="https://img.shields.io/badge/MVP-in%20development-f59e0b?style=flat-square" />
</div>

The self-hosted CRM for sales workflows.

Tandelo brings leads, companies, contacts, pipelines, and lead-linked tasks into one app. The frontend uses Angular, the API uses NestJS, and PostgreSQL stores the data.

The code is organized into domain modules. A public plugin SDK and external integrations are planned, but are not available yet.

---

## Current features

- Leads can be viewed in board and list layouts across pipelines.
- Lead records can be linked to companies and contacts.
- Tasks are attached to leads, can have an optional assignee, and can be created and completed from the task list.
- Users have one of two fixed roles, Admin or Member. Admins manage users and groups.
- Pipeline analytics show lead counts and total value by stage.
- The API and web app can run on infrastructure you control.

---

## Architecture

```text
Browser
  |
  v
Angular web app
  |
  v
NestJS API
  ├── Authentication and access control
  ├── Leads and pipelines
  ├── Companies and contacts
  ├── Tasks, custom fields, and analytics
  ├── Users and groups
  |
  v
PostgreSQL
```

The API separates CRM features into NestJS modules. Integration adapters and extension hooks are future work.

---

## Tech stack

<div align="left">

<img alt="Angular" src="https://img.shields.io/badge/Angular-DD0031?style=flat-square&logo=angular&logoColor=white" />
<img alt="PrimeNG" src="https://img.shields.io/badge/PrimeNG-8B5CF6?style=flat-square&logo=prime&logoColor=white" />
<img alt="NestJS" src="https://img.shields.io/badge/NestJS-E0234E?style=flat-square&logo=nestjs&logoColor=white" />
<img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
<img alt="Nx" src="https://img.shields.io/badge/Nx-143055?style=flat-square&logo=nx&logoColor=white" />
<img alt="Vitest" src="https://img.shields.io/badge/Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white" />
<img alt="Playwright" src="https://img.shields.io/badge/Playwright-45ba4b?style=flat-square&logo=playwright&logoColor=white" />

</div>

- Angular 22 + PrimeNG for the frontend
- NestJS for backend services
- Drizzle ORM + PostgreSQL for the data layer
- Nx for monorepo orchestration
- Vitest for unit tests
- Playwright for end-to-end testing

---

## Quick start

This setup runs the web app and API locally and uses Docker Compose for PostgreSQL. It is intended for development.

```bash
cp .env.example .env
openssl rand -hex 32
```

Copy the generated value into `JWT_SECRET` in `.env`; it must be at least 32 characters long. Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and optionally `ADMIN_NAME` before creating the first user.

```bash
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed # optional demo data
pnpm db:seed-admin
```

Start the API and web app in separate terminals:

```bash
pnpm nx run web:serve
```

```bash
pnpm nx run api:serve
```

```bash
pnpm nx run-many -t build
pnpm nx run-many -t lint test
pnpm nx run web-e2e:e2e
pnpm nx run api-e2e:e2e
pnpm nx graph
```

---

## Project structure

```text
├── apps/
│   ├── web/          - Angular frontend
│   ├── web-e2e/      - Playwright e2e tests
│   ├── api/          - NestJS backend
│   └── api-e2e/      - API e2e coverage
├── nx.json           - Nx workspace config
├── package.json      - workspace dependencies
├── pnpm-lock.yaml    - lockfile
├── README.md         - project overview
└── tsconfig.base.json
```

---

## Status

Tandelo is in active development. The MVP covers leads, companies, contacts, pipelines, lead-linked tasks, fixed-role access control, user and group administration, and pipeline analytics. Integrations, the plugin SDK, and AI are not part of the current MVP.

---

## Roadmap

- Integration SDK, adapters, and connections to external services
- AI assistant
- Historical analytics, conversion reports, and data export
- Task and lifecycle automation
- Custom roles and team-based access rules
- Production deployment options beyond the local PostgreSQL setup

---

## Contributing

Contributions are welcome. Open an issue or propose a change to the CRM workflow, API, or documentation. The integration SDK is planned and is not available yet.

---

## License

This project is licensed under the MIT license.
