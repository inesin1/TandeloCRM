import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, lt } from 'drizzle-orm';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { DATABASE_CONNECTION, Database, DatabaseExecutor } from '../database/database.module';
import { leadActivities } from '../leads/lead-activity.entity';
import { leadContacts, leads } from '../leads/lead.entity';
import { statuses } from '../pipelines/pipeline.entity';
import { recordNotes } from '../record-notes/record-note.entity';
import { users } from '../users/user.entity';
import { contacts } from './contact.entity';
import { CreateContactDto } from './dto/create-contact.dto';
import { FindContactsDto } from './dto/find-contacts.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Injectable()
export class ContactsService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly customFieldsService: CustomFieldsService,
  ) {}

  findCopilotPage(search: string, ownerId: number | null, cursorId: number | null, limit: number) {
    return this.db
      .select({ id: contacts.id, name: contacts.name, position: contacts.position, companyId: contacts.companyId })
      .from(contacts)
      .where(and(ilike(contacts.name, `%${search}%`), ownerId ? eq(contacts.ownerId, ownerId) : undefined, cursorId ? lt(contacts.id, cursorId) : undefined))
      .orderBy(desc(contacts.id))
      .limit(limit);
  }

  findCopilotRecord(id: number) {
    return this.db
      .select({ id: contacts.id, name: contacts.name, position: contacts.position, companyId: contacts.companyId, email: contacts.email, phone: contacts.phone, ownerId: contacts.ownerId, customFields: contacts.customFields, createdAt: contacts.createdAt, updatedAt: contacts.updatedAt })
      .from(contacts)
      .where(eq(contacts.id, id))
      .limit(1);
  }

  findCopilotMutationRecord(id: number, executor: DatabaseExecutor = this.db, forUpdate = false) {
    const query = executor
      .select({ id: contacts.id, name: contacts.name, position: contacts.position, companyId: contacts.companyId, email: contacts.email, phone: contacts.phone, ownerId: contacts.ownerId, customFields: contacts.customFields, createdAt: contacts.createdAt, updatedAt: contacts.updatedAt })
      .from(contacts)
      .where(eq(contacts.id, id));
    return (forUpdate ? query.for('update') : query).limit(1);
  }

  findCopilotLink(id: number, executor: DatabaseExecutor = this.db) {
    return executor
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(eq(contacts.id, id))
      .limit(1);
  }

  findCopilotActivity(id: number, cursorId: number | null, limit: number) {
    return this.db
      .select({ id: recordNotes.id, body: recordNotes.body, createdAt: recordNotes.createdAt, authorId: recordNotes.authorId })
      .from(recordNotes)
      .where(and(eq(recordNotes.contactId, id), cursorId ? lt(recordNotes.id, cursorId) : undefined))
      .orderBy(desc(recordNotes.id))
      .limit(limit);
  }

  async create(dto: CreateContactDto, executor: DatabaseExecutor = this.db) {
    await this.customFieldsService.validate(
      'contact',
      dto.customFields === undefined ? {} : dto.customFields,
      executor,
    );
    const [contact] = await executor.insert(contacts).values(dto).returning();
    return contact;
  }

  findAll(filters: FindContactsDto = {}) {
    return this.db
      .select()
      .from(contacts)
      .where(
        and(
          filters.ownerId !== undefined
            ? eq(contacts.ownerId, filters.ownerId)
            : undefined,
          filters.companyId !== undefined
            ? eq(contacts.companyId, filters.companyId)
            : undefined,
          filters.search !== undefined
            ? ilike(contacts.name, `%${filters.search}%`)
            : undefined,
        ),
      );
  }

  async findOne(id: string, executor: DatabaseExecutor = this.db) {
    const [contact] = await executor
      .select()
      .from(contacts)
      .where(eq(contacts.id, Number(id)));
    if (!contact) {
      throw new NotFoundException(`Contact ${id} not found`);
    }
    return contact;
  }

  async findLeads(id: string) {
    const contact = await this.findOne(id);
    return this.db
      .select({
        id: leads.id,
        name: leads.name,
        price: leads.price,
        status: { id: statuses.id, name: statuses.name, color: statuses.color },
      })
      .from(leadContacts)
      .innerJoin(leads, eq(leadContacts.leadId, leads.id))
      .innerJoin(statuses, eq(leads.statusId, statuses.id))
      .where(eq(leadContacts.contactId, contact.id));
  }

  async findActivity(id: string) {
    const contact = await this.findOne(id);
    const [notes, linked, linkedLeads] = await Promise.all([
      this.db
        .select({
          id: recordNotes.id,
          body: recordNotes.body,
          createdAt: recordNotes.createdAt,
          author: { id: users.id, name: users.name },
        })
        .from(recordNotes)
        .leftJoin(users, eq(recordNotes.authorId, users.id))
        .where(eq(recordNotes.contactId, contact.id)),
      this.db
        .select({
          id: leadActivities.id,
          body: leadActivities.body,
          kind: leadActivities.kind,
          createdAt: leadActivities.createdAt,
          lead: { id: leads.id, name: leads.name },
          author: { id: users.id, name: users.name },
        })
        .from(leadActivities)
        .innerJoin(leads, eq(leadActivities.leadId, leads.id))
        .innerJoin(leadContacts, eq(leadContacts.leadId, leads.id))
        .leftJoin(users, eq(leadActivities.authorId, users.id))
        .where(eq(leadContacts.contactId, contact.id)),
      this.db
        .select({ id: leads.id, name: leads.name, createdAt: leads.createdAt })
        .from(leadContacts)
        .innerJoin(leads, eq(leadContacts.leadId, leads.id))
        .where(eq(leadContacts.contactId, contact.id)),
    ]);
    return [
      {
        id: 'created',
        kind: 'created',
        body: 'Contact created',
        createdAt: contact.createdAt,
        lead: null,
        author: null,
      },
      ...(contact.updatedAt.getTime() - contact.createdAt.getTime() > 1000
        ? [
            {
              id: 'updated',
              kind: 'updated',
              body: 'Contact updated',
              createdAt: contact.updatedAt,
              lead: null,
              author: null,
            },
          ]
        : []),
      ...notes.map((note) => ({
        ...note,
        id: `note-${note.id}`,
        kind: 'note',
        lead: null,
      })),
      ...linked.map((entry) => ({
        ...entry,
        id: `lead-${entry.id}`,
        kind: entry.kind,
      })),
      ...linkedLeads
        .filter(
          (lead) =>
            !linked.some(
              (entry) => entry.lead.id === lead.id && entry.kind === 'created',
            ),
        )
        .map((lead) => ({
          id: `lead-created-${lead.id}`,
          kind: 'created',
          body: 'Lead created',
          createdAt: lead.createdAt,
          lead: { id: lead.id, name: lead.name },
          author: null,
        })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async addNote(id: string, body: string, authorId: number, executor: DatabaseExecutor = this.db) {
    const contact = await this.findOne(id, executor);
    const [note] = await executor
      .insert(recordNotes)
      .values({ contactId: contact.id, body: body.trim(), authorId })
      .returning();
    return note;
  }

  async update(id: string, dto: UpdateContactDto, executor: DatabaseExecutor = this.db) {
    if (dto.customFields !== undefined) {
      await this.customFieldsService.validate('contact', dto.customFields, executor);
    }
    const contactId = Number(id);
    const [contact] = Object.keys(dto).length
      ? await executor
          .update(contacts)
          .set(dto)
          .where(eq(contacts.id, contactId))
          .returning()
      : await executor.select().from(contacts).where(eq(contacts.id, contactId));

    if (!contact) {
      throw new NotFoundException(`Contact ${id} not found`);
    }
    return contact;
  }

  async remove(id: string) {
    const result = await this.db
      .delete(contacts)
      .where(eq(contacts.id, Number(id)));
    if (!result.rowCount) {
      throw new NotFoundException(`Contact ${id} not found`);
    }
    return { deleted: true };
  }
}
