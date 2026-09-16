import 'dotenv/config';
import * as argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { users } from '../users/user.entity';

async function seedAdmin() {
  const databaseUrl = process.env.DATABASE_URL;
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? 'Admin';

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  const passwordHash = await argon2.hash(password);

  await db
    .insert(users)
    .values({ email, name, passwordHash })
    .onConflictDoNothing({ target: users.email });

  await pool.end();
  console.log(`Admin user ready: ${email}`);
}

seedAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
