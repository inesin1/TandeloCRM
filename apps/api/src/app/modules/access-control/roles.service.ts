import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import { roles } from './access-control.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async create(dto: CreateRoleDto) {
    const [role] = await this.db.insert(roles).values(dto).returning();
    return role;
  }

  findAll() {
    return this.db.select().from(roles);
  }

  async findOne(id: string) {
    const [role] = await this.db
      .select()
      .from(roles)
      .where(eq(roles.id, Number(id)));
    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }
    return role;
  }

  async update(id: string, dto: UpdateRoleDto) {
    const roleId = Number(id);
    const [role] = Object.keys(dto).length
      ? await this.db
          .update(roles)
          .set(dto)
          .where(eq(roles.id, roleId))
          .returning()
      : await this.db.select().from(roles).where(eq(roles.id, roleId));

    if (!role) {
      throw new NotFoundException(`Role ${id} not found`);
    }
    return role;
  }

  async remove(id: string) {
    const result = await this.db.delete(roles).where(eq(roles.id, Number(id)));
    if (!result.rowCount) {
      throw new NotFoundException(`Role ${id} not found`);
    }
    return { deleted: true };
  }
}
