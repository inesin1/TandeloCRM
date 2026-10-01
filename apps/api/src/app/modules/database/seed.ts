import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { seedAccessControl } from './seed-access-control';
import { PERMISSION_KEYS } from '../access-control/permissions.catalog';
import { companies } from '../companies/company.entity';
import { contacts } from '../contacts/contact.entity';
import { customFieldDefinitions } from '../custom-fields/custom-field.entity';
import { leadContacts, leads } from '../leads/lead.entity';
import { pipelines, statuses } from '../pipelines/pipeline.entity';
import { tasks } from '../tasks/task.entity';
import { users } from '../users/user.entity';

function requiredId(
  records: { id: number; name: string }[],
  name: string,
): number {
  const record = records.find((item) => item.name === name);
  if (!record) {
    throw new Error(`Seeded record ${name} was not returned`);
  }
  return record.id;
}

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  try {
    await seedAccessControl(db);

    const result = await db.transaction(async (tx) => {
      const [existingLead] = await tx
        .select({ id: leads.id })
        .from(leads)
        .limit(1);
      if (existingLead) {
        return null;
      }

      const existingUsers = await tx
        .select({ id: users.id, email: users.email })
        .from(users);
      const userIdsByEmail = new Map(
        existingUsers.map((user) => [user.email, user.id]),
      );
      const ownerId = (email: string) => userIdsByEmail.get(email) ?? null;

      const pipelineRecords = await tx
        .insert(pipelines)
        .values([
          { name: 'Pipeline 1', sortOrder: 10 },
          { name: 'Pipeline 2', sortOrder: 20 },
        ])
        .returning({ id: pipelines.id, name: pipelines.name });
      const pipeline1Id = requiredId(pipelineRecords, 'Pipeline 1');
      const pipeline2Id = requiredId(pipelineRecords, 'Pipeline 2');

      const statusRecords = await tx
        .insert(statuses)
        .values([
          {
            pipelineId: pipeline1Id,
            name: 'New',
            color: '#3b82f6',
            sortOrder: 10,
          },
          {
            pipelineId: pipeline1Id,
            name: 'Qualification',
            color: '#6366f1',
            sortOrder: 20,
          },
          {
            pipelineId: pipeline1Id,
            name: 'Proposal',
            color: '#f59e0b',
            sortOrder: 30,
          },
          {
            pipelineId: pipeline1Id,
            name: 'Negotiation',
            color: '#10b981',
            sortOrder: 40,
          },
          {
            pipelineId: pipeline2Id,
            name: 'Incoming',
            color: '#0ea5e9',
            sortOrder: 10,
          },
          {
            pipelineId: pipeline2Id,
            name: 'In progress',
            color: '#8b5cf6',
            sortOrder: 20,
          },
          {
            pipelineId: pipeline2Id,
            name: 'Done',
            color: '#10b981',
            sortOrder: 30,
          },
        ])
        .returning({ id: statuses.id, name: statuses.name });

      await tx.insert(customFieldDefinitions).values([
        {
          entityType: 'lead',
          key: 'priority',
          label: 'Priority',
          type: 'select',
          options: ['low', 'medium', 'high'],
          sortOrder: 10,
        },
        {
          entityType: 'company',
          key: 'segment',
          label: 'Segment',
          type: 'select',
          options: ['small', 'medium', 'enterprise'],
          sortOrder: 10,
        },
      ]);

      const companyRecords = await tx
        .insert(companies)
        .values([
          {
            name: 'Velum Kite',
            industry: 'Retail',
            address: 'Almaty, Central district, building 1',
            email: 'hello@example.com',
            phone: '+7 727 000-00-01',
            ownerId: ownerId('andrey@example.com'),
            customFields: { segment: 'medium' },
          },
          {
            name: 'Qora Nimbus',
            industry: 'Construction',
            address: 'Astana, Northern district, building 2',
            email: 'office@example.org',
            phone: '+7 717 000-00-02',
            ownerId: ownerId('elena@example.org'),
            customFields: { segment: 'enterprise' },
          },
          {
            name: 'Mirahedron',
            industry: 'Software',
            address: 'Almaty, Central district, building 3',
            email: 'team@example.net',
            phone: '+7 727 000-00-03',
            ownerId: ownerId('mikhail@example.net'),
            customFields: { segment: 'small' },
          },
          {
            name: 'Copper Finch',
            industry: 'Consulting',
            address: 'Astana, Northern district, building 4',
            email: 'info@example.com',
            phone: '+7 717 000-00-04',
            ownerId: ownerId('andrey@example.com'),
          },
          {
            name: 'Sable Metric',
            industry: 'Design',
            address: 'Shymkent, Central district, building 5',
            email: 'studio@example.org',
            phone: '+7 725 000-00-05',
            ownerId: ownerId('elena@example.org'),
          },
          {
            name: 'Juniper Relay',
            industry: 'Software',
            address: 'Karaganda, Central district, building 6',
            email: 'contact@example.net',
            phone: '+7 721 000-00-06',
            ownerId: ownerId('mikhail@example.net'),
          },
          {
            name: 'Lumen Orchard',
            industry: 'Logistics',
            address: 'Aktobe, Central district, building 7',
            email: 'office@example.com',
            phone: '+7 713 000-00-07',
            ownerId: ownerId('andrey@example.com'),
          },
          {
            name: 'Cinder Vale',
            industry: 'Recruiting',
            address: 'Almaty, Central district, building 8',
            email: 'jobs@example.org',
            phone: '+7 727 000-00-08',
            ownerId: ownerId('elena@example.org'),
          },
        ])
        .returning({ id: companies.id, name: companies.name });
      const companyId = (name: string) => requiredId(companyRecords, name);

      const contactRecords = await tx
        .insert(contacts)
        .values([
          {
            name: 'Igor Smirnov',
            position: 'Head of Sales',
            companyId: companyId('Velum Kite'),
            email: 'i.smirnov@example.com',
            phone: '+7 701 000-00-01',
            ownerId: ownerId('andrey@example.com'),
          },
          {
            name: 'Aigerim Serikova',
            position: 'CEO',
            companyId: companyId('Qora Nimbus'),
            email: 'a.serikova@example.org',
            phone: '+7 705 000-00-02',
            ownerId: ownerId('elena@example.org'),
          },
          {
            name: 'Aidos Bekturov',
            position: 'CTO',
            companyId: companyId('Mirahedron'),
            email: 'a.bekturov@example.net',
            phone: '+7 747 000-00-03',
            ownerId: ownerId('mikhail@example.net'),
          },
          {
            name: 'Anna Letova',
            position: 'Product Owner',
            companyId: companyId('Mirahedron'),
            email: 'a.letova@example.com',
            phone: '+7 747 000-00-04',
            ownerId: ownerId('mikhail@example.net'),
          },
          {
            name: 'Denis Volkov',
            position: 'IT Director',
            companyId: companyId('Copper Finch'),
            email: 'd.volkov@example.org',
            phone: '+7 777 000-00-05',
            ownerId: ownerId('andrey@example.com'),
          },
          {
            name: 'Dana Nurlanova',
            position: 'Operations Lead',
            companyId: companyId('Sable Metric'),
            email: 'd.nurlanova@example.net',
            phone: '+7 708 000-00-06',
            ownerId: ownerId('elena@example.org'),
          },
          {
            name: 'Sergey Gavrilov',
            position: 'Founder',
            companyId: companyId('Juniper Relay'),
            email: 's.gavrilov@example.com',
            phone: '+7 702 000-00-07',
            ownerId: ownerId('mikhail@example.net'),
          },
          {
            name: 'Nurlan Amanov',
            position: 'Support Manager',
            companyId: companyId('Lumen Orchard'),
            email: 'n.amanov@example.org',
            phone: '+7 776 000-00-08',
            ownerId: ownerId('andrey@example.com'),
          },
          {
            name: 'Zhanar Kaliyeva',
            position: 'HR Lead',
            companyId: companyId('Cinder Vale'),
            email: 'z.kaliyeva@example.net',
            phone: '+7 707 000-00-09',
            ownerId: ownerId('elena@example.org'),
          },
          {
            name: 'Lidia Kraynova',
            position: 'Recruiter',
            companyId: companyId('Cinder Vale'),
            email: 'l.kraynova@example.com',
            phone: '+7 707 000-00-10',
            ownerId: ownerId('elena@example.org'),
          },
        ])
        .returning({ id: contacts.id, name: contacts.name });
      const contactId = (name: string) => requiredId(contactRecords, name);

      const leadRecords = await tx
        .insert(leads)
        .values([
          {
            name: 'CRM for sales team',
            price: 480_000,
            source: 'Website',
            pipelineId: pipeline1Id,
            statusId: requiredId(statusRecords, 'New'),
            companyId: companyId('Velum Kite'),
            ownerId: ownerId('andrey@example.com'),
            customFields: { priority: 'high' },
            createdAt: new Date('2026-08-28T09:12:00.000Z'),
            updatedAt: new Date('2026-09-07T18:40:00.000Z'),
          },
          {
            name: 'Request automation',
            price: 240_000,
            source: 'Referral',
            pipelineId: pipeline1Id,
            statusId: requiredId(statusRecords, 'New'),
            companyId: companyId('Qora Nimbus'),
            ownerId: ownerId('elena@example.org'),
            customFields: { priority: 'medium' },
            createdAt: new Date('2026-08-30T11:05:00.000Z'),
            updatedAt: new Date('2026-09-06T10:15:00.000Z'),
          },
          {
            name: 'Unified customer base',
            price: 650_000,
            source: 'Conference',
            pipelineId: pipeline1Id,
            statusId: requiredId(statusRecords, 'Qualification'),
            companyId: companyId('Mirahedron'),
            ownerId: ownerId('mikhail@example.net'),
            customFields: { priority: 'high' },
            createdAt: new Date('2026-08-21T14:30:00.000Z'),
            updatedAt: new Date('2026-09-08T09:00:00.000Z'),
          },
          {
            name: 'Telephony integration',
            price: 180_000,
            source: 'Website',
            pipelineId: pipeline1Id,
            statusId: requiredId(statusRecords, 'Qualification'),
            companyId: companyId('Copper Finch'),
            ownerId: ownerId('andrey@example.com'),
            customFields: { priority: 'low' },
            createdAt: new Date('2026-08-25T16:45:00.000Z'),
            updatedAt: new Date('2026-09-05T12:20:00.000Z'),
          },
          {
            name: 'Rollout for 3 teams',
            price: 960_000,
            source: 'Partner',
            pipelineId: pipeline1Id,
            statusId: requiredId(statusRecords, 'Proposal'),
            companyId: companyId('Sable Metric'),
            ownerId: ownerId('elena@example.org'),
            customFields: { priority: 'high' },
            createdAt: new Date('2026-08-12T10:00:00.000Z'),
            updatedAt: new Date('2026-09-04T17:05:00.000Z'),
          },
          {
            name: 'Customer portal',
            price: 420_000,
            source: 'Outbound',
            pipelineId: pipeline1Id,
            statusId: requiredId(statusRecords, 'Proposal'),
            companyId: companyId('Juniper Relay'),
            ownerId: ownerId('mikhail@example.net'),
            customFields: { priority: 'medium' },
            createdAt: new Date('2026-08-18T13:25:00.000Z'),
            updatedAt: new Date('2026-09-08T11:40:00.000Z'),
          },
          {
            name: 'Annual support',
            price: 720_000,
            source: 'Existing customer',
            pipelineId: pipeline1Id,
            statusId: requiredId(statusRecords, 'Negotiation'),
            companyId: companyId('Lumen Orchard'),
            ownerId: ownerId('andrey@example.com'),
            customFields: { priority: 'high' },
            createdAt: new Date('2026-07-30T08:50:00.000Z'),
            updatedAt: new Date('2026-09-07T15:10:00.000Z'),
          },
          {
            name: 'Team expansion',
            price: 190_000,
            source: 'Referral',
            pipelineId: pipeline2Id,
            statusId: requiredId(statusRecords, 'Incoming'),
            companyId: companyId('Cinder Vale'),
            ownerId: ownerId('elena@example.org'),
            customFields: { priority: 'medium' },
            createdAt: new Date('2026-08-05T12:15:00.000Z'),
            updatedAt: new Date('2026-09-03T19:30:00.000Z'),
          },
        ])
        .returning({ id: leads.id, name: leads.name });
      const leadId = (name: string) => requiredId(leadRecords, name);

      await tx.insert(leadContacts).values([
        {
          leadId: leadId('CRM for sales team'),
          contactId: contactId('Igor Smirnov'),
        },
        {
          leadId: leadId('Request automation'),
          contactId: contactId('Aigerim Serikova'),
        },
        {
          leadId: leadId('Unified customer base'),
          contactId: contactId('Aidos Bekturov'),
        },
        {
          leadId: leadId('Unified customer base'),
          contactId: contactId('Anna Letova'),
        },
        {
          leadId: leadId('Telephony integration'),
          contactId: contactId('Denis Volkov'),
        },
        {
          leadId: leadId('Rollout for 3 teams'),
          contactId: contactId('Dana Nurlanova'),
        },
        {
          leadId: leadId('Customer portal'),
          contactId: contactId('Sergey Gavrilov'),
        },
        {
          leadId: leadId('Annual support'),
          contactId: contactId('Nurlan Amanov'),
        },
        {
          leadId: leadId('Team expansion'),
          contactId: contactId('Zhanar Kaliyeva'),
        },
        {
          leadId: leadId('Team expansion'),
          contactId: contactId('Lidia Kraynova'),
        },
      ]);

      await tx.insert(tasks).values([
        {
          leadId: leadId('CRM for sales team'),
          type: 'call',
          text: 'First call',
          dueAt: new Date('2026-09-19T14:00:00.000Z'),
          assigneeId: ownerId('andrey@example.com'),
        },
        {
          leadId: leadId('CRM for sales team'),
          type: 'email',
          text: 'Send follow-up',
          dueAt: new Date('2026-09-10T10:00:00.000Z'),
          isCompleted: true,
          assigneeId: ownerId('andrey@example.com'),
        },
        {
          leadId: leadId('Request automation'),
          type: 'document',
          text: 'Send proposal',
          dueAt: new Date('2026-09-20T11:00:00.000Z'),
          assigneeId: ownerId('elena@example.org'),
        },
        {
          leadId: leadId('Unified customer base'),
          type: 'document',
          text: 'Send proposal',
          dueAt: new Date('2026-09-19T17:30:00.000Z'),
          assigneeId: ownerId('mikhail@example.net'),
        },
        {
          leadId: leadId('Telephony integration'),
          type: 'call',
          text: 'First call',
          dueAt: new Date('2026-09-21T09:30:00.000Z'),
          assigneeId: ownerId('andrey@example.com'),
        },
        {
          leadId: leadId('Rollout for 3 teams'),
          type: 'meeting',
          text: 'Demo for the team',
          dueAt: new Date('2026-09-22T12:00:00.000Z'),
          assigneeId: ownerId('elena@example.org'),
        },
        {
          leadId: leadId('Customer portal'),
          type: 'document',
          text: 'Discuss contract',
          dueAt: new Date('2026-09-23T12:00:00.000Z'),
          assigneeId: ownerId('mikhail@example.net'),
        },
        {
          leadId: leadId('Annual support'),
          type: 'meeting',
          text: 'Discuss contract',
          dueAt: new Date('2026-09-24T10:00:00.000Z'),
          assigneeId: ownerId('andrey@example.com'),
        },
      ]);

      return {
        pipelines: pipelineRecords.length,
        statuses: statusRecords.length,
        companies: companyRecords.length,
        contacts: contactRecords.length,
        leads: leadRecords.length,
        tasks: 8,
      };
    });

    console.log(`Seeded ${PERMISSION_KEYS.length} permissions`);
    console.log(
      result
        ? `Seeded CRM domain: ${JSON.stringify(result)}`
        : 'CRM domain already contains leads, skipping demo data',
    );
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
