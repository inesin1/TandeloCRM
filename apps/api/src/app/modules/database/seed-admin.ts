import 'dotenv/config';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { roles, userRoles } from '../access-control/access-control.entity';
import { users } from '../users/user.entity';
import { seedAccessControl } from './seed-access-control';

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

  try {
    await seedAccessControl(db);
    const passwordHash = await argon2.hash(password);

    await db.transaction(async (tx) => {
      const [adminRole] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.name, 'Admin'));
      if (!adminRole) {
        throw new Error('Admin role is missing after access control seeding');
      }
      const [user] = await tx
        .insert(users)
        .values({ email, name, passwordHash, isActive: true })
        .onConflictDoUpdate({
          target: users.email,
          set: { name, passwordHash, isActive: true },
        })
        .returning({ id: users.id });

      await tx.delete(userRoles).where(eq(userRoles.userId, user.id));
      await tx
        .insert(userRoles)
        .values({ userId: user.id, roleId: adminRole.id });
    });

    console.log(`Admin user ready: ${email}`);
  } finally {
    await pool.end();
  }
}

seedAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
