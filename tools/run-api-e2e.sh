#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
database_password=$(openssl rand -hex 24)
export API_E2E_ADMIN_PASSWORD
API_E2E_ADMIN_PASSWORD=$(openssl rand -hex 24)
export API_E2E_ADMIN_EMAIL=admin@example.test

if [[ ${GITHUB_ACTIONS:-} == true ]]; then
  printf '::add-mask::%s\n' "$database_password" "$API_E2E_ADMIN_PASSWORD"
fi

container=$(POSTGRES_PASSWORD="$database_password" docker run --detach --rm \
  --publish '127.0.0.1::5432' \
  --env POSTGRES_USER=tandelo --env POSTGRES_DB=tandelo_e2e \
  --env POSTGRES_PASSWORD postgres:17-alpine)
trap 'docker stop "$container" >/dev/null' EXIT

for ((attempt = 1; attempt <= 30; attempt++)); do
  if docker exec "$container" pg_isready -q -h 127.0.0.1 -U tandelo -d tandelo_e2e; then
    break
  fi
  if ((attempt == 30)); then
    printf 'Test PostgreSQL did not become ready\n' >&2
    exit 1
  fi
  sleep 1
done

address=$(docker port "$container" 5432/tcp)
export API_E2E_DATABASE_URL="postgresql://tandelo:${database_password}@${address}/tandelo_e2e"

DATABASE_URL="$API_E2E_DATABASE_URL" pnpm db:migrate
DATABASE_URL="$API_E2E_DATABASE_URL" ADMIN_EMAIL="$API_E2E_ADMIN_EMAIL" \
  ADMIN_PASSWORD="$API_E2E_ADMIN_PASSWORD" pnpm db:seed-admin
pnpm nx run api-e2e:e2e
