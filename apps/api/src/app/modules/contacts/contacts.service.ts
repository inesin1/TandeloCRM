import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, ilike } from 'drizzle-orm';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
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

  async create(dto: CreateContactDto) {
    await this.customFieldsService.validate(
      'contact',
      dto.customFields === undefined ? {} : dto.customFields,
    );
    const [contact] = await this.db.insert(contacts).values(dto).returning();
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

  async findOne(id: string) {
    const [contact] = await this.db
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

  async addNote(id: string, body: string, authorId: number) {
    const contact = await this.findOne(id);
    const [note] = await this.db
      .insert(recordNotes)
      .values({ contactId: contact.id, body: body.trim(), authorId })
      .returning();
    return note;
  }

  async update(id: string, dto: UpdateContactDto) {
    if (dto.customFields !== undefined) {
      await this.customFieldsService.validate('contact', dto.customFields);
    }
    const contactId = Number(id);
    const [contact] = Object.keys(dto).length
      ? await this.db
          .update(contacts)
          .set(dto)
          .where(eq(contacts.id, contactId))
          .returning()
      : await this.db.select().from(contacts).where(eq(contacts.id, contactId));

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
