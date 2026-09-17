import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { leads } from '../leads/lead.entity';
import { users } from '../users/user.entity';

async function seedLeads() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  try {
    const [existingLead] = await db
      .select({ id: leads.id })
      .from(leads)
      .limit(1);
    if (existingLead) {
      console.log('Leads already exist, skipping seed');
      return;
    }

    const existingUsers = await db
      .select({ id: users.id, email: users.email })
      .from(users);
    const userIdsByEmail = new Map(
      existingUsers.map((user) => [user.email, user.id]),
    );
    const adminId = userIdsByEmail.get(process.env.ADMIN_EMAIL ?? '') ?? null;
    const andreyId = userIdsByEmail.get('andrey@tandelo.dev') ?? adminId;
    const elenaId = userIdsByEmail.get('elena@tandelo.dev') ?? adminId;
    const mikhailId = userIdsByEmail.get('mikhail@tandelo.dev') ?? adminId;

    const seeded = await db
      .insert(leads)
      .values([
        {
          name: 'CRM for sales team',
          price: 480_000,
          status: 'new',
          ownerId: andreyId,
          companyName: 'Forma',
          contactName: 'Igor Smirnov',
          createdAt: new Date('2026-08-28T09:12'),
          updatedAt: new Date('2026-09-07T18:40'),
        },
        {
          name: 'Request automation',
          price: 240_000,
          status: 'new',
          ownerId: elenaId,
          companyName: 'Altyn Qurylys',
          contactName: 'Aigerim Serikova',
          createdAt: new Date('2026-08-30T11:05'),
          updatedAt: new Date('2026-09-06T10:15'),
        },
        {
          name: 'Unified customer base',
          price: 650_000,
          status: 'qualification',
          ownerId: mikhailId,
          companyName: 'Orbit',
          contactName: 'Aidos Bekturov',
          createdAt: new Date('2026-08-21T14:30'),
          updatedAt: new Date('2026-09-08T09:00'),
        },
        {
          name: 'Telephony integration',
          price: 180_000,
          status: 'qualification',
          ownerId: andreyId,
          companyName: 'Growth Point',
          contactName: 'Denis Volkov',
          createdAt: new Date('2026-08-25T16:45'),
          updatedAt: new Date('2026-09-05T12:20'),
        },
        {
          name: 'Rollout for 3 teams',
          price: 960_000,
          status: 'proposal',
          ownerId: elenaId,
          companyName: 'Zhetysu Studio',
          contactName: 'Dana Nurlanova',
          createdAt: new Date('2026-08-12T10:00'),
          updatedAt: new Date('2026-09-04T17:05'),
        },
        {
          name: 'Customer portal',
          price: 420_000,
          status: 'proposal',
          ownerId: mikhailId,
          companyName: 'Layer',
          contactName: 'Sergey Gavrilov',
          createdAt: new Date('2026-08-18T13:25'),
          updatedAt: new Date('2026-09-08T11:40'),
        },
        {
          name: 'Annual support',
          price: 720_000,
          status: 'negotiation',
          ownerId: andreyId,
          companyName: 'Atlas Logistics',
          contactName: 'Nurlan Amanov',
          createdAt: new Date('2026-07-30T08:50'),
          updatedAt: new Date('2026-09-07T15:10'),
        },
        {
          name: 'Team expansion',
          price: 190_000,
          status: 'new',
          ownerId: elenaId,
          companyName: 'Bureau',
          contactName: 'Zhanar Kaliyeva',
          createdAt: new Date('2026-08-05T12:15'),
          updatedAt: new Date('2026-09-03T19:30'),
        },
      ])
      .returning({ id: leads.id });

    console.log(`Seeded ${seeded.length} leads`);
  } finally {
    await pool.end();
  }
}

seedLeads().catch((err) => {
  console.error(err);
  process.exit(1);
});
