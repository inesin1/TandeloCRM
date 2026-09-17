import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, ilike } from 'drizzle-orm';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import { companies } from './company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly customFieldsService: CustomFieldsService,
  ) {}

  async create(dto: CreateCompanyDto) {
    await this.customFieldsService.validate(
      'company',
      dto.customFields === undefined ? {} : dto.customFields,
    );
    const [company] = await this.db.insert(companies).values(dto).returning();
    return company;
  }

  findAll(filters: { ownerId?: number; search?: string } = {}) {
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

  async findOne(id: string) {
    const [company] = await this.db
      .select()
      .from(companies)
      .where(eq(companies.id, Number(id)));
    if (!company) {
      throw new NotFoundException(`Company ${id} not found`);
    }
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto) {
    if (dto.customFields !== undefined) {
      await this.customFieldsService.validate('company', dto.customFields);
    }
    const companyId = Number(id);
    const [company] = Object.keys(dto).length
      ? await this.db
          .update(companies)
          .set(dto)
          .where(eq(companies.id, companyId))
          .returning()
      : await this.db
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
