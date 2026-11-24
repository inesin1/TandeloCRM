# Changelog

Release notes for Tandelo. The API and web app share one version from `package.json`.
Release Please adds entries when preparing a release PR. Changes on `main` after the latest tag are not released yet.

## [0.3.0](https://github.com/inesin1/TandeloCRM/compare/v0.2.0...v0.3.0) (2026-11-24)


### Features

* publish interactive Tandelo demo ([4e8bd61](https://github.com/inesin1/TandeloCRM/commit/4e8bd613f493b5432fe509101f29a36ed026ef7b))


### Bug Fixes

* **ci:** deploy the uploaded Pages artifact ([3872115](https://github.com/inesin1/TandeloCRM/commit/3872115a48226c9b751cfdc1f4a216e9ed7684c5))

## [0.2.0](https://github.com/inesin1/TandeloCRM/compare/v0.1.0-beta.2...v0.2.0) (2026-11-24)

### Features

- Configure pipelines and stages in Settings. Won and lost stages are excluded from open lead totals and attention filters.
- Set a workspace currency for deal amounts and reporting. Existing numeric amounts are preserved.
- Import leads, contacts, and companies from CSV with preview and row-level feedback.
- Open Copilot from a fixed tab on the right edge of any signed-in page.
- Install Tandelo on a VPS with Docker Compose and persistent PostgreSQL. The deployment guide covers backup and recovery.

### Upgrade

Back up PostgreSQL, then run `pnpm db:migrate` before starting the new version. Migration `0007` creates a default pipeline only when no pipeline exists. Existing stages initially have the Open outcome. Review them in **Settings → Pipelines** and mark the applicable stages as Won or Lost. See the [deployment guide](https://github.com/inesin1/TandeloCRM/blob/v0.2.0/HOMELAB_DEPLOY.md).

## [0.1.0-beta.2](https://github.com/inesin1/TandeloCRM/compare/v0.1.0-beta.1...v0.1.0-beta.2) (2026-10-24)


### Features

* add CRM Copilot with confirmed actions and access checks ([92f0e6f](https://github.com/inesin1/TandeloCRM/commit/92f0e6f1e55cc7a405f15a856b0a5cd747619820))
* configure Copilot providers from admin settings ([c9e4a02](https://github.com/inesin1/TandeloCRM/commit/c9e4a02194d9a626ebca166ca8050404ec1320ad))


### Continuous Integration

* automate beta releases and document upgrades ([47eb459](https://github.com/inesin1/TandeloCRM/commit/47eb459433c90f45fd0af434ed536edee2c09798))

## [0.1.0-beta.1](https://github.com/inesin1/TandeloCRM/releases/tag/v0.1.0-beta.1) (2026-10-03)

### Features

- Initial CRM beta with leads, pipelines, companies, contacts, lead-linked tasks, custom fields, and analytics.
- JWT authentication, resource permissions, and user and group administration.

### Maintenance

- Updated vulnerable dependencies.
