import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isISO8601 } from 'class-validator';
import { asc, eq } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import {
  customFieldDefinitions,
  CustomFieldEntityType,
  CustomFieldType,
} from './custom-field.entity';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';

@Injectable()
export class CustomFieldsService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async create(dto: CreateCustomFieldDto) {
    const options = dto.options ?? null;
    this.validateOptions(dto.key, dto.type, options);
    const [definition] = await this.db
      .insert(customFieldDefinitions)
      .values({ ...dto, options })
      .returning();
    return definition;
  }

  findAll(entityType?: CustomFieldEntityType) {
    return this.db
      .select()
      .from(customFieldDefinitions)
      .where(
        entityType === undefined
          ? undefined
          : eq(customFieldDefinitions.entityType, entityType),
      )
      .orderBy(
        asc(customFieldDefinitions.sortOrder),
        asc(customFieldDefinitions.id),
      );
  }

  async findOne(id: string) {
    const [definition] = await this.db
      .select()
      .from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.id, Number(id)));
    if (!definition) {
      throw new NotFoundException(`Custom field ${id} not found`);
    }
    return definition;
  }

  async update(id: string, dto: UpdateCustomFieldDto) {
    const existing = await this.findOne(id);
    if (!Object.keys(dto).length) {
      return existing;
    }

    const type = dto.type ?? existing.type;
    const options =
      dto.options !== undefined
        ? dto.options
        : type === 'select'
          ? existing.options
          : null;
    this.validateOptions(dto.key ?? existing.key, type, options);
    const [definition] = await this.db
      .update(customFieldDefinitions)
      .set({ ...dto, options })
      .where(eq(customFieldDefinitions.id, Number(id)))
      .returning();
    if (!definition) {
      throw new NotFoundException(`Custom field ${id} not found`);
    }
    return definition;
  }

  async remove(id: string) {
    // TODO: вычистка осиротевших ключей из customFields — Этап 3, когда появятся companies/contacts
    const result = await this.db
      .delete(customFieldDefinitions)
      .where(eq(customFieldDefinitions.id, Number(id)));
    if (!result.rowCount) {
      throw new NotFoundException(`Custom field ${id} not found`);
    }
    return { deleted: true };
  }

  async validate(
    entityType: CustomFieldEntityType,
    payload: unknown,
  ): Promise<void> {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload) ||
      (Object.getPrototypeOf(payload) !== Object.prototype &&
        Object.getPrototypeOf(payload) !== null)
    ) {
      throw new BadRequestException('customFields must be an object');
    }

    const definitions = await this.findAll(entityType);
    const byKey = new Map(
      definitions.map((definition) => [definition.key, definition]),
    );
    const values = new Map<string, unknown>(Object.entries(payload));

    for (const [key, value] of values) {
      const definition = byKey.get(key);
      if (!definition) {
        throw new BadRequestException(
          `Unknown custom field "${key}" for ${entityType}`,
        );
      }
      if (definition.isRequired && this.isEmpty(value)) {
        throw new BadRequestException(
          `Custom field "${key}" is required and must not be empty`,
        );
      }
      switch (definition.type) {
        case 'text':
          if (typeof value === 'string') continue;
          break;
        case 'number':
          if (typeof value === 'number' && Number.isFinite(value)) continue;
          break;
        case 'boolean':
          if (typeof value === 'boolean') continue;
          break;
        case 'date':
          if (
            typeof value === 'string' &&
            isISO8601(value, { strict: true, strictSeparator: true })
          )
            continue;
          break;
        case 'select':
          if (typeof value === 'string' && definition.options?.includes(value))
            continue;
          throw new BadRequestException(
            `Custom field "${key}" must be one of its options: ${definition.options?.join(', ') ?? ''}`,
          );
      }
      throw new BadRequestException(
        `Custom field "${key}" must have type ${definition.type}`,
      );
    }

    for (const definition of definitions) {
      if (definition.isRequired && !values.has(definition.key)) {
        throw new BadRequestException(
          `Custom field "${definition.key}" is required`,
        );
      }
    }
  }

  private isEmpty(value: unknown): boolean {
    return (
      value === null ||
      value === undefined ||
      (typeof value === 'string' && value.trim() === '')
    );
  }

  private validateOptions(
    key: string,
    type: CustomFieldType,
    options: string[] | null,
  ): void {
    if (type === 'select') {
      if (
        !options?.length ||
        options.some(
          (option) => typeof option !== 'string' || !option.trim(),
        ) ||
        new Set(options).size !== options.length
      ) {
        throw new BadRequestException(
          `Custom field "${key}" of type select requires non-empty, unique string options`,
        );
      }
    } else if (options !== null) {
      throw new BadRequestException(
        `Custom field "${key}" only supports options for type select`,
      );
    }
  }
}
