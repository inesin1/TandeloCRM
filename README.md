# Tandelo

The self-hosted CRM built for modular growth.

Tandelo is a CRM for teams that want a clean sales workflow without being locked into a single stack or a rigid vendor model. It brings leads, companies, contacts, tasks, and pipeline visibility into one place while keeping the core system open to extension.

The main idea is simple: you should be able to connect external services, custom tooling, and internal workflows without touching the core source. If a team needs a custom integration, an internal API, or a different frontend or backend stack, it should fit in without a rewrite.

## Why Tandelo

Most CRMs are hard to customize because the product itself becomes the integration layer. Tandelo is built around modularity from the start:

- clear pipeline and sales workflow management
- connected records for leads, contacts, and companies
- task tracking tied to the deal lifecycle
- reporting and analytics for pipeline health
- AI assistance for setup and operational questions
- extension points for external systems and custom logic

You can run the project on your own infrastructure, keep your own backend if needed, and connect any service that matters to your business. No forced platform lock-in, no need to patch the core app just to add a new integration.

## Built to integrate

Tandelo is designed for real-world business systems.

- connect third-party services without modifying the core CRM
- build integrations in any JavaScript ecosystem you prefer
- keep your own backend logic separate when the workflow needs it
- add business-specific adapters and automations without forking the product
- evolve the platform as your stack changes over time

The plugin SDK and module boundaries are the foundation here. They let teams add capabilities without turning the core into a fragile, over-customized monolith.

## Core features

- pipeline management with kanban and list views
- lead, company, and contact records in one place
- tasks connected to deals and people
- analytics and reporting across the pipeline
- AI copilot for setup and operational guidance
- user and team management inside the app

## Tech stack

- Angular 22 + PrimeNG for the frontend
- NestJS for backend services
- Drizzle ORM + PostgreSQL for the data layer
- Nx for monorepo orchestration
- Vitest for unit tests
- Playwright for end-to-end testing

## Modular architecture

Tandelo is organized as a monorepo with clear boundaries between apps, features, and libraries. That makes it simpler to extend without creating hidden dependencies between modules.

The goal is not just to separate code, but to separate concerns:

- core CRM logic stays stable
- integrations live in dedicated extension points
- custom business flows can be added without touching the platform core
- teams can adopt the parts they need without replacing everything else

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

## Status

Tandelo is in active development. The project is already structured around a modular product foundation, with flexibility for integrations and custom workflows as a first-class concern.

## Roadmap

Planned work includes:

- richer workflow and reporting features
- stronger integration adapters for external services
- better automation around tasks and lifecycle events
- more extension hooks for custom business logic
- support for more flexible deployment and backend patterns

## Contributing

Contributions are welcome. If you want to improve the product, extend the SDK, or build a custom integration flow, start by opening an issue or proposing a change in the repository.

## License

This project is licensed under the MIT license.
