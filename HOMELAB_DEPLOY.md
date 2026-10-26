# HomeLab Deployment Guide for Tandelo

This document details the production deployment procedure for Tandelo to the HomeLab environment (WSL2 Ubuntu Docker Engine, shared `homelab` network, shared PostgreSQL, Infisical secrets, and Caddy reverse proxy).

---

## 1. Architecture & Baseline Identities

| Property | Value | Notes |
| --- | --- | --- |
| **Application Slug** | `tandelo` | Docker Compose project prefix |
| **API Container** | `tandelo-api` | NestJS runtime, internal port `3000` (private to `homelab` network) |
| **Web Container** | `tandelo-web` | Nginx unprivileged serving Angular SPA on port `8080`, reverse-proxying `/api` |
| **Tooling Container** | `tandelo-tooling` | Profile `tools` container containing workspace dependencies for migrations & admin seed |
| **Host Loopback Port** | `127.0.0.1:3103` (`${APP_HOST_PORT:-3103}`) | Unused host port published on loopback only |
| **Target Hostname** | `http://tandelo.home.arpa` | Reverse-proxied by host `homelab-caddy` |
| **Docker Network** | `homelab` (external bridge) | Connects API to shared PostgreSQL |
| **Shared PostgreSQL** | Docker DNS `homelab-postgres:5432` | Container port 5432 on `homelab` network |
| **pgvector requirement**| Not required | Standard PostgreSQL 17/18 is supported |
| **GitHub Runner Labels**| `[self-hosted, Linux, X64, homelab]` | Add project-specific label only if explicitly registered |

---

## 2. Configuration & Secrets

### A. GitHub Actions Repository Variables
Set these under **Settings → Secrets and variables → Actions → Variables**:

- `HOMELAB_INFISICAL_IDENTITY_ID`: Machine identity UUID authorized to read secrets in Infisical.
- `HOMELAB_INFISICAL_PROJECT_SLUG`: The Infisical project slug for Tandelo.

### B. Infisical Secrets (`prod` Environment)
Configure the following keys in Infisical under project environment `prod`:

| Variable | Description / Example Format | Mandatory |
| --- | --- | --- |
| `NODE_ENV` | `production` | Yes |
| `DATABASE_URL` | `postgresql://tandelo_user:<password>@homelab-postgres:5432/tandelo` | Yes |
| `JWT_SECRET` | 64-character random hex string (`openssl rand -hex 32`) | Yes (min 32 chars) |
| `APP_HOST_PORT` | `3103` | No (defaults to 3103) |
| `COPILOT_ENABLED` | `false` (or `true`) | No (default `false`) |
| `COPILOT_API_FORMAT` | `responses` or `chat-completions` | Only if Copilot enabled |
| `COPILOT_BASE_URL` | `https://api.openai.com/v1` | Only if Copilot enabled |
| `COPILOT_API_KEY` | Provider API key | Only if Copilot enabled |
| `COPILOT_MODEL` | Provider model name | Only if Copilot enabled |

> [!IMPORTANT]
> **JWT_SECRET Stability**:
> `JWT_SECRET` is used both to sign JWT session tokens and as the encryption key for provider credentials saved through the Copilot UI (AES-256-GCM). Keep `JWT_SECRET` consistent across deployments and backups. Rotating it requires administrators to re-enter provider credentials in Settings.

---

## 3. Infrastructure Prerequisites (Owner Setup)

### A. Shared PostgreSQL Database & Role
Create a dedicated non-superuser database role and database for Tandelo:

```bash
docker exec -i homelab-postgres psql -U postgres <<'EOF'
CREATE ROLE tandelo_user WITH LOGIN PASSWORD '<secure_password>';
CREATE DATABASE tandelo OWNER tandelo_user;
\c tandelo
GRANT ALL ON SCHEMA public TO tandelo_user;
EOF
```

### B. Infisical OIDC Machine Identity
Ensure the machine identity:
1. Has an OIDC subject restriction matching repo branch `repo:<owner>/tandelo:ref:refs/heads/deploy-home`.
2. Has permission to read secrets in the Tandelo project under environment `prod`.
3. Audience matches `infisical-home`.

### C. Host Caddy Configuration
Edit `/opt/homelab/caddy/Caddyfile` on the host:

```caddyfile
http://tandelo.home.arpa {
    reverse_proxy 127.0.0.1:3103
}
```

Reload Caddy:
```bash
docker exec homelab-caddy caddy reload --config /etc/caddy/Caddyfile
```

Add to client/laptop `hosts` file (or local DNS server):
```text
<GAMING_PC_LAN_IP> tandelo.home.arpa
```

---

## 4. First-Time Clean Installation Sequence

Follow this sequence for the initial deployment:

### Step 1: Deploy application containers
Trigger the GitHub Actions workflow by pushing to `deploy-home` (or run manually):

```bash
git checkout deploy-home
git merge main
git push origin deploy-home
```

Or execute manually on the runner/host:
```bash
APP_ENV_FILE=/path/to/.home.env docker compose -p tandelo -f compose.deploy.yml up -d --build --remove-orphans --wait
```

### Step 2: Apply database migrations explicitly
Migrations must be run deliberately via the tooling target:

```bash
APP_ENV_FILE=/path/to/.home.env docker compose -p tandelo -f compose.deploy.yml run --rm tooling pnpm db:migrate
```

### Step 3: Bootstrap the initial Admin user
Seed the initial administrator and default roles/permissions:

```bash
APP_ENV_FILE=/path/to/.home.env docker compose -p tandelo -f compose.deploy.yml run --rm \
  -e ADMIN_EMAIL="admin@example.com" \
  -e ADMIN_PASSWORD="<initial_password>" \
  -e ADMIN_NAME="Tandelo Admin" \
  tooling pnpm db:seed-admin
```

### Step 4: Verify installation
1. **Liveness check**:
   ```bash
   curl -f http://127.0.0.1:3103/api/health
   # Expected: {"status":"ok"}
   ```
2. **Readiness check**:
   ```bash
   curl -f http://127.0.0.1:3103/api/health/ready
   # Expected: {"status":"ok","database":"connected"}
   ```
3. **Web SPA**: Navigate to `http://tandelo.home.arpa` in your browser, log in with the bootstrapped admin credentials, and verify CRM navigation.

---

## 5. Routine Update Sequence

To upgrade an existing installation without downtime or data loss:

> [!CAUTION]
> **Access-Control Seeds Must Never Rerun on Updates**:
> Routine updates must NEVER rerun `db:seed` or `db:seed-admin`. Doing so resets user role assignments. Run ONLY `db:migrate`.

1. **Create pre-update database backup** (see section 6).
2. **Deploy code update**: Push new commit to `deploy-home` branch. CI will build the updated images and restart containers with `--wait`.
3. **Run pending migrations**:
   ```bash
   APP_ENV_FILE=/path/to/.home.env docker compose -p tandelo -f compose.deploy.yml run --rm tooling pnpm db:migrate
   ```
4. **Verify health**:
   ```bash
   curl -f http://127.0.0.1:3103/api/health
   curl -f http://127.0.0.1:3103/api/health/ready
   ```

---

## 6. Backup and Recovery Procedures

### A. Stop Writes / Preparation
Before performing a production backup, ensure no active transactions or background imports are running.

### B. Database Backup Command
Execute a compressed PostgreSQL dump using the shared database container:

```bash
BACKUP_FILE="/tmp/tandelo_backup_$(date +%Y%m%d_%H%M%S).dump"
docker exec -t homelab-postgres pg_dump -U tandelo_user -d tandelo -F c -b -v -f "$BACKUP_FILE"
```

Save both `$BACKUP_FILE` and the active `JWT_SECRET` securely in your backup vault.

### C. Restore Verification / Rehearsal Procedure
**Never restore directly over a running production database during verification.** Always restore to a temporary, disposable test database:

```bash
TEST_DB="tandelo_restore_test_$(date +%s)"

# 1. Create disposable database
docker exec -i homelab-postgres psql -U postgres -c "CREATE DATABASE $TEST_DB OWNER tandelo_user;"

# 2. Restore into test database
docker exec -i homelab-postgres pg_restore -U tandelo_user -d "$TEST_DB" -v "$BACKUP_FILE"

# 3. Verify record counts and integrity
docker exec -i homelab-postgres psql -U tandelo_user -d "$TEST_DB" -c "SELECT count(*) FROM users; SELECT count(*) FROM leads;"

# 4. Cleanup disposable test database
docker exec -i homelab-postgres psql -U postgres -c "DROP DATABASE $TEST_DB;"
```

---

## 7. Rollback Procedures

### Application / Code Rollback
If a newly deployed container fails health checks or introduces a regression:
1. Re-deploy the previous Git commit on the `deploy-home` branch:
   ```bash
   git checkout deploy-home
   git reset --hard <previous_commit_hash>
   git push --force origin deploy-home
   ```
2. If migrations did not include backwards-incompatible schema changes, the old container will continue operating normally.

### Database Rollback
If a schema migration altered data incompatibly:
1. Stop the application containers:
   ```bash
   docker compose -p tandelo -f compose.deploy.yml stop
   ```
2. Restore the pre-update database backup into the production database:
   ```bash
   docker exec -i homelab-postgres dropdb -U postgres tandelo
   docker exec -i homelab-postgres createdb -U postgres -O tandelo_user tandelo
   docker exec -i homelab-postgres pg_restore -U tandelo_user -d tandelo -v "$BACKUP_FILE"
   ```
3. Start application containers:
   ```bash
   docker compose -p tandelo -f compose.deploy.yml start
   ```

---

## 8. HomeLab Control Integration

When HomeLab Control activates **Game Mode** or **Stop**:
- Application containers (`tandelo-api`, `tandelo-web`) and GitHub runners receive SIGTERM and shut down gracefully.
- Volumes and shared PostgreSQL state persist without data loss.
- When HomeLab Control runs **Start**, the containers restart automatically according to `restart: unless-stopped`.

---

## 9. Outstanding Prerequisites for Phase 2 & 3

The following items are pending Phase 2 infrastructure verification:
- [ ] Confirm unused host port `3103` on HomeLab host.
- [ ] Verify GitHub Actions self-hosted runner registration and labels (`homelab`).
- [ ] Provision `tandelo` database and `tandelo_user` on shared `homelab-postgres`.
- [ ] Configure `HOMELAB_INFISICAL_IDENTITY_ID` and `HOMELAB_INFISICAL_PROJECT_SLUG` in GitHub repository variables.
- [ ] Add `prod` secrets to Infisical project.
- [ ] Add Caddy route `tandelo.home.arpa` to `/opt/homelab/caddy/Caddyfile` and reload Caddy.
- [ ] Phase 3: Execute clean install rehearsal, migration test, and backup restore rehearsal.
