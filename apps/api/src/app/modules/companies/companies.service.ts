import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, lt } from 'drizzle-orm';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { DATABASE_CONNECTION, Database, DatabaseExecutor } from '../database/database.module';
import { leadActivities } from '../leads/lead-activity.entity';
import { leads } from '../leads/lead.entity';
import { statuses } from '../pipelines/pipeline.entity';
import { recordNotes } from '../record-notes/record-note.entity';
import { users } from '../users/user.entity';
import { companies } from './company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { FindCompaniesDto } from './dto/find-companies.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly customFieldsService: CustomFieldsService,
  ) {}

  findCopilotPage(search: string, ownerId: number | null, cursorId: number | null, limit: number) {
    return this.db
      .select({ id: companies.id, name: companies.name, industry: companies.industry })
      .from(companies)
      .where(and(ilike(companies.name, `%${search}%`), ownerId ? eq(companies.ownerId, ownerId) : undefined, cursorId ? lt(companies.id, cursorId) : undefined))
      .orderBy(desc(companies.id))
      .limit(limit);
  }

  findCopilotRecord(id: number) {
    return this.db
      .select({ id: companies.id, name: companies.name, industry: companies.industry, address: companies.address, email: companies.email, phone: companies.phone, ownerId: companies.ownerId, customFields: companies.customFields, createdAt: companies.createdAt, updatedAt: companies.updatedAt })
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);
  }

  findCopilotMutationRecord(id: number, executor: DatabaseExecutor = this.db, forUpdate = false) {
    const query = executor
      .select({ id: companies.id, name: companies.name, industry: companies.industry, address: companies.address, email: companies.email, phone: companies.phone, ownerId: companies.ownerId, customFields: companies.customFields, createdAt: companies.createdAt, updatedAt: companies.updatedAt })
      .from(companies)
      .where(eq(companies.id, id));
    return (forUpdate ? query.for('update') : query).limit(1);
  }

  findCopilotActivity(id: number, cursorId: number | null, limit: number) {
    return this.db
      .select({ id: recordNotes.id, body: recordNotes.body, createdAt: recordNotes.createdAt, authorId: recordNotes.authorId })
      .from(recordNotes)
      .where(and(eq(recordNotes.companyId, id), cursorId ? lt(recordNotes.id, cursorId) : undefined))
      .orderBy(desc(recordNotes.id))
      .limit(limit);
  }

  findCopilotLinkedRecord(id: number, executor: DatabaseExecutor = this.db) {
    return executor
      .select({ id: companies.id, name: companies.name, industry: companies.industry })
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);
  }

  findCopilotLink(id: number, executor: DatabaseExecutor = this.db) {
    return executor
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);
  }

  async create(dto: CreateCompanyDto, executor: DatabaseExecutor = this.db) {
    await this.customFieldsService.validate(
      'company',
      dto.customFields === undefined ? {} : dto.customFields,
      executor,
    );
    const [company] = await executor.insert(companies).values(dto).returning();
    return company;
  }

  findAll(filters: FindCompaniesDto = {}) {
    return this.db
      .select()
      .from(companies)
      .where(
        and(
          filters.ownerId !== undefined
            ? eq(companies.ownerId, filters.ownerId)
            : undefined,
          filters.search !== undefined
            ? ilike(companies.name, `%${filters.search}%`)
            : undefined,
        ),
      );
  }

  async findOne(id: string, executor: DatabaseExecutor = this.db) {
    const [company] = await executor
      .select()
      .from(companies)
      .where(eq(companies.id, Number(id)));
    if (!company) {
      throw new NotFoundException(`Company ${id} not found`);
    }
    return company;
  }

  async findLeads(id: string) {
    const company = await this.findOne(id);
    return this.db
      .select({
        id: leads.id,
        name: leads.name,
        price: leads.price,
        status: { id: statuses.id, name: statuses.name, color: statuses.color },
      })
      .from(leads)
      .innerJoin(statuses, eq(leads.statusId, statuses.id))
      .where(eq(leads.companyId, company.id));
  }

  async findActivity(id: string) {
    const company = await this.findOne(id);
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
        .where(eq(recordNotes.companyId, company.id)),
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
        .leftJoin(users, eq(leadActivities.authorId, users.id))
        .where(eq(leads.companyId, company.id)),
      this.db
        .select({ id: leads.id, name: leads.name, createdAt: leads.createdAt })
        .from(leads)
        .where(eq(leads.companyId, company.id)),
    ]);
    return [
      {
        id: 'created',
        kind: 'created',
        body: 'Company created',
        createdAt: company.createdAt,
        lead: null,
        author: null,
      },
      ...(company.updatedAt.getTime() - company.createdAt.getTime() > 1000
        ? [
            {
              id: 'updated',
              kind: 'updated',
              body: 'Company updated',
              createdAt: company.updatedAt,
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
    const company = await this.findOne(id, executor);
    const [note] = await executor
      .insert(recordNotes)
      .values({ companyId: company.id, body: body.trim(), authorId })
      .returning();
    return note;
  }

  async update(id: string, dto: UpdateCompanyDto, executor: DatabaseExecutor = this.db) {
    if (dto.customFields !== undefined) {
      await this.customFieldsService.validate('company', dto.customFields, executor);
    }
    const companyId = Number(id);
    const [company] = Object.keys(dto).length
      ? await executor
          .update(companies)
          .set(dto)
          .where(eq(companies.id, companyId))
          .returning()
      : await executor
          .select()
          .from(companies)
          .where(eq(companies.id, companyId));

    if (!company) {
      throw new NotFoundException(`Company ${id} not found`);
    }
    return company;
  }

  async remove(id: string) {
    const result = await this.db
      .delete(companies)
      .where(eq(companies.id, Number(id)));
    if (!result.rowCount) {
      throw new NotFoundException(`Company ${id} not found`);
    }
    return { deleted: true };
  }
}
