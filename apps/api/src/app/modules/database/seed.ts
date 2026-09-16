import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { permissions } from '../access-control/access-control.entity';
import { PERMISSION_KEYS } from '../access-control/permissions.catalog';

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  await db
    .insert(permissions)
    .values(PERMISSION_KEYS.map((key) => ({ key })))
    .onConflictDoNothing();

  await pool.end();
  console.log(`Seeded ${PERMISSION_KEYS.length} permissions`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
