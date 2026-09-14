# Tandelo ![Tandelo logo](assets/tandelo-logo.svg)

<div align="center">
  <img alt="Self-hosted CRM" src="https://img.shields.io/badge/Self--hosted-CRM-1f9d55?style=flat-square&logo=server&logoColor=white" />
  <img alt="Modular by design" src="https://img.shields.io/badge/Modular-by%20design-0ea5e9?style=flat-square&logo=package&logoColor=white" />
  <img alt="Integrations first" src="https://img.shields.io/badge/Integrations-first-8b5cf6?style=flat-square&logo=plugged-in&logoColor=white" />
</div>

The self-hosted CRM built for modular growth.

Tandelo gives sales teams a clean system for leads, companies, contacts, tasks, and pipeline visibility without locking them into a rigid platform or a brittle custom stack.

The idea is simple: connect external services, internal tools, and custom business logic without patching the app itself.

---

## Why you should choose Tandelo

| Feature                     | Why it matters                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------- |
| 🧭 Pipeline clarity         | Keep deals moving with a visible, structured workflow.                                 |
| 📦 Modular architecture     | Add features and integrations without turning the core into a fragile monolith.        |
| 🔌 Integration-first design | Connect CRMs, APIs, and internal tools without editing source code.                    |
| 🤖 AI support               | Get setup help and day-to-day guidance without adding overhead.                        |
| 🏠 Self-hosted              | Keep the system on your own infrastructure with full control over deployment and data. |

## Built for integrations

Tandelo is built for real-world business systems, not just a fixed CRM feature set.

- connect third-party services without modifying the core product
- build integrations in the JavaScript stack that fits your team
- keep your own backend logic separate when the workflow needs it
- add adapters and automations without forking the platform
- evolve the system as your stack grows and changes

The plugin SDK and module boundaries are the foundation here. They let teams extend the product without creating hidden dependencies or fragile patches in the core.

---

## Core workflow

- pipeline management with kanban and list views
- lead, company, and contact records in one system
- tasks connected to deals and people
- analytics and reporting across the pipeline
- user and team management inside the app

---

## Modular architecture

```text
+----------------------+      +----------------------+
| External Services    |      | Internal Workflows   |
| Slack, email, ERP   | ---> | custom automation    |
| marketing tools     |      | scripts / APIs       |
+----------------------+      +----------------------+
             \                     /
              \                   /
               v                 v
            +-------------------------------+
            |      Tandelo integration      |
            |      layer / plugin SDK       |
            +-------------------------------+
                           v
            +-------------------------------+
            |        Core CRM module        |
            | leads, contacts, pipeline     |
            +-------------------------------+
```

This architecture keeps the platform stable while making integrations an explicit extension point instead of a source-code surgery project.

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

```bash
# install dependencies
pnpm install

# start the web app
pnpm nx run web:serve

# start the API
pnpm nx run api:serve

# build the project
pnpm nx run-many -t build

# run lint and tests
pnpm nx run-many -t lint test

# run e2e tests
pnpm nx run web-e2e:e2e

# inspect the Nx graph
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
├── libs/
│   ├── plugin-sdk/   - extension point for integrations
│   └── shared/       - shared utilities
├── packages/
│   ├── shared/models/ - shared models
│   └── api/products/  - API-facing libraries
├── nx.json           - Nx workspace config
├── package.json      - workspace dependencies
├── pnpm-lock.yaml    - lockfile
├── README.md         - project overview
└── tsconfig.base.json
```

---

## Status

Tandelo is in active development. The project is already structured around a modular foundation, with integrations and custom workflows as a first-class concern.

---

## Roadmap

- richer workflow and reporting features
- stronger integration adapters for external services
- better automation around tasks and lifecycle events
- more extension hooks for custom business logic
- support for more flexible deployment patterns and backend choices

---

## Contributing

Contributions are welcome. If you want to improve the product, extend the SDK, or build a custom integration flow, open an issue or propose a change in the repository.

---

## License

This project is licensed under the MIT license.
