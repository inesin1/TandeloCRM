import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, getTableColumns, ilike, inArray } from 'drizzle-orm';
import { companies } from '../companies/company.entity';
import { contacts } from '../contacts/contact.entity';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import { statuses } from '../pipelines/pipeline.entity';
import { users } from '../users/user.entity';
import { leadActivities } from './lead-activity.entity';
import { leadContacts, leads } from './lead.entity';
import { CreateLeadDto } from './dto/create-lead.dto';
import { FindLeadsDto } from './dto/find-leads.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

@Injectable()
export class LeadsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly customFieldsService: CustomFieldsService,
  ) {}

  async create(dto: CreateLeadDto) {
    const { contactIds, ...values } = dto;
    await this.customFieldsService.validate(
      'lead',
      dto.customFields === undefined ? {} : dto.customFields,
    );
    return this.db.transaction(async (tx) => {
      const [lead] = await tx.insert(leads).values(values).returning();
      if (contactIds?.length) {
        await tx
          .insert(leadContacts)
          .values(
            contactIds.map((contactId) => ({ leadId: lead.id, contactId })),
          );
      }
      await tx.insert(leadActivities).values({
        leadId: lead.id,
        kind: 'created',
        body: 'Lead created',
      });
      return this.getLead(String(lead.id), tx);
    });
  }

  async findAll(filters: FindLeadsDto = {}) {
    const records = await this.selectLeads(this.db).where(
      and(
        filters.ownerId !== undefined
          ? eq(leads.ownerId, filters.ownerId)
          : undefined,
        filters.pipelineId !== undefined
          ? eq(leads.pipelineId, filters.pipelineId)
          : undefined,
        filters.statusId !== undefined
          ? eq(leads.statusId, filters.statusId)
          : undefined,
        filters.search !== undefined
          ? ilike(leads.name, `%${filters.search}%`)
          : undefined,
      ),
    );
    return this.withContacts(records, this.db);
  }

  findOne(id: string) {
    return this.getLead(id, this.db);
  }

  async findActivity(id: string) {
    await this.getLead(id, this.db);
    return this.db
      .select({
        id: leadActivities.id,
        kind: leadActivities.kind,
        body: leadActivities.body,
        createdAt: leadActivities.createdAt,
        author: { id: users.id, name: users.name },
      })
      .from(leadActivities)
      .leftJoin(users, eq(leadActivities.authorId, users.id))
      .where(eq(leadActivities.leadId, Number(id)))
      .orderBy(asc(leadActivities.createdAt), asc(leadActivities.id));
  }

  async addNote(id: string, body: string, authorId: number) {
    await this.getLead(id, this.db);
    const [note] = await this.db
      .insert(leadActivities)
      .values({
        leadId: Number(id),
        kind: 'note',
        body: body.trim(),
        authorId,
      })
      .returning({ id: leadActivities.id });
    const [result] = await this.db
      .select({
        id: leadActivities.id,
        kind: leadActivities.kind,
        body: leadActivities.body,
        createdAt: leadActivities.createdAt,
        author: { id: users.id, name: users.name },
      })
      .from(leadActivities)
      .leftJoin(users, eq(leadActivities.authorId, users.id))
      .where(eq(leadActivities.id, note.id));
    return result;
  }

  async update(id: string, dto: UpdateLeadDto) {
    if (dto.customFields !== undefined) {
      await this.customFieldsService.validate('lead', dto.customFields);
    }
    if (!Object.values(dto).some((value) => value !== undefined)) {
      return this.findOne(id);
    }
    const { contactIds, ...values } = dto;
    const leadId = Number(id);
    return this.db.transaction(async (tx) => {
      const previous = await this.getLead(id, tx);
      const [lead] = await tx
        .update(leads)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(leads.id, leadId))
        .returning();
      if (!lead) {
        throw new NotFoundException(`Lead ${id} not found`);
      }
      if (contactIds !== undefined) {
        await tx.delete(leadContacts).where(eq(leadContacts.leadId, leadId));
        if (contactIds.length) {
          await tx
            .insert(leadContacts)
            .values(contactIds.map((contactId) => ({ leadId, contactId })));
        }
      }
      const updated = await this.getLead(id, tx);
      const changed = [
        ['name', 'Name'],
        ['price', 'Price'],
        ['source', 'Source'],
        ['pipelineId', 'Pipeline'],
        ['statusId', 'Status'],
        ['ownerId', 'Responsible'],
      ] as const;
      const fields: string[] = changed
        .filter(([key]) => previous[key] !== updated[key])
        .map(([, label]) => label);
      if (previous.company?.id !== updated.company?.id) fields.push('Company');
      if (
        previous.contacts.map((contact) => contact.id).join(',') !==
        updated.contacts.map((contact) => contact.id).join(',')
      ) {
        fields.push('Contacts');
      }
      if (
        JSON.stringify(previous.customFields) !==
        JSON.stringify(updated.customFields)
      ) {
        fields.push('Custom fields');
      }
      if (fields.length) {
        await tx.insert(leadActivities).values({
          leadId,
          kind: 'updated',
          body: `Updated: ${fields.join(', ')}`,
        });
      }
      return updated;
    });
  }

  async remove(id: string) {
    const result = await this.db.delete(leads).where(eq(leads.id, Number(id)));
    if (!result.rowCount) {
      throw new NotFoundException(`Lead ${id} not found`);
    }
    return { deleted: true };
  }

  private selectLeads(db: Database) {
    return db
      .select({
        ...getTableColumns(leads),
        status: { id: statuses.id, name: statuses.name, color: statuses.color },
        company: { id: companies.id, name: companies.name },
        owner: { id: users.id, name: users.name, email: users.email },
      })
      .from(leads)
      .innerJoin(
        statuses,
        and(
          eq(leads.statusId, statuses.id),
          eq(leads.pipelineId, statuses.pipelineId),
        ),
      )
      .leftJoin(companies, eq(leads.companyId, companies.id))
      .leftJoin(users, eq(leads.ownerId, users.id));
  }

  private async getLead(id: string, db: Database) {
    const [lead] = await this.selectLeads(db).where(eq(leads.id, Number(id)));
    if (!lead) {
      throw new NotFoundException(`Lead ${id} not found`);
    }
    const [result] = await this.withContacts([lead], db);
    return result;
  }

  private async withContacts<T extends typeof leads.$inferSelect>(
    records: T[],
    db: Database,
  ) {
    const byLead = new Map<number, (typeof contacts.$inferSelect)[]>();
    if (records.length) {
      const links = await db
        .select({
          leadId: leadContacts.leadId,
          contact: getTableColumns(contacts),
        })
        .from(leadContacts)
        .innerJoin(contacts, eq(leadContacts.contactId, contacts.id))
        .where(
          inArray(
            leadContacts.leadId,
            records.map((lead) => lead.id),
          ),
        )
        .orderBy(asc(contacts.id));
      for (const { leadId, contact } of links) {
        const group = byLead.get(leadId) ?? [];
        group.push(contact);
        byLead.set(leadId, group);
      }
    }
    return records.map((lead) => ({
      ...lead,
      contacts: byLead.get(lead.id) ?? [],
    }));
  }
}
