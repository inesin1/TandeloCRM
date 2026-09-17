import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, ilike } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import { leads } from './lead.entity';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';

@Injectable()
export class LeadsService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async create(dto: CreateLeadDto) {
    const [lead] = await this.db.insert(leads).values(dto).returning();
    return lead;
  }

  findAll(
    filters: { ownerId?: number; status?: string; search?: string } = {},
  ) {
    return this.db
      .select()
      .from(leads)
      .where(
        and(
          filters.ownerId !== undefined
            ? eq(leads.ownerId, filters.ownerId)
            : undefined,
          filters.status !== undefined
            ? eq(leads.status, filters.status)
            : undefined,
          filters.search !== undefined
            ? ilike(leads.name, `%${filters.search}%`)
            : undefined,
        ),
      );
  }

  async findOne(id: string) {
    const [lead] = await this.db
      .select()
      .from(leads)
      .where(eq(leads.id, Number(id)));
    if (!lead) {
      throw new NotFoundException(`Lead ${id} not found`);
    }
    return lead;
  }

  async update(id: string, dto: UpdateLeadDto) {
    const leadId = Number(id);
    const [lead] = Object.keys(dto).length
      ? await this.db
          .update(leads)
          .set(dto)
          .where(eq(leads.id, leadId))
          .returning()
      : await this.db.select().from(leads).where(eq(leads.id, leadId));

    if (!lead) {
      throw new NotFoundException(`Lead ${id} not found`);
    }
    return lead;
  }

  async remove(id: string) {
    const result = await this.db.delete(leads).where(eq(leads.id, Number(id)));
    if (!result.rowCount) {
      throw new NotFoundException(`Lead ${id} not found`);
    }
    return { deleted: true };
  }
}
