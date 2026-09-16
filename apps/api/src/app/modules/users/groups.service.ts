import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import { groups } from './user.entity';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';

@Injectable()
export class GroupsService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async create(dto: CreateGroupDto) {
    const [group] = await this.db.insert(groups).values(dto).returning();
    return group;
  }

  findAll() {
    return this.db.select().from(groups);
  }

  async findOne(id: string) {
    const [group] = await this.db
      .select()
      .from(groups)
      .where(eq(groups.id, Number(id)));
    if (!group) {
      throw new NotFoundException(`Group ${id} not found`);
    }
    return group;
  }

  async update(id: string, dto: UpdateGroupDto) {
    const groupId = Number(id);
    const [group] = Object.keys(dto).length
      ? await this.db
          .update(groups)
          .set(dto)
          .where(eq(groups.id, groupId))
          .returning()
      : await this.db.select().from(groups).where(eq(groups.id, groupId));

    if (!group) {
      throw new NotFoundException(`Group ${id} not found`);
    }
    return group;
  }

  async remove(id: string) {
    const result = await this.db
      .delete(groups)
      .where(eq(groups.id, Number(id)));
    if (!result.rowCount) {
      throw new NotFoundException(`Group ${id} not found`);
    }
    return { deleted: true };
  }
}
