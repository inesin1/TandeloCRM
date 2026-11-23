import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import { roles } from './access-control.entity';
import { SYSTEM_ROLE_NAMES } from './permissions.constants';

@Injectable()
export class RolesService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  findAll() {
    return this.db
      .select()
      .from(roles)
      .where(inArray(roles.name, [...SYSTEM_ROLE_NAMES]));
  }

  async findOne(id: string) {
    const [role] = await this.db
      .select()
      .from(roles)
      .where(
        and(
          eq(roles.id, Number(id)),
          inArray(roles.name, [...SYSTEM_ROLE_NAMES]),
        ),
      );
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }
    return role;
  }
}
