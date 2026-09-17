import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, ilike } from 'drizzle-orm';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import { contacts } from './contact.entity';
import { CreateContactDto } from './dto/create-contact.dto';
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

  findAll(
    filters: { ownerId?: number; companyId?: number; search?: string } = {},
  ) {
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
