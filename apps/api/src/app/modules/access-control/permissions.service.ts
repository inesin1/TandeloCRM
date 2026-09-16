import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_CONNECTION, Database } from '../database/database.module';
import { permissions } from './access-control.entity';

@Injectable()
export class PermissionsService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  findAll() {
    return this.db.select().from(permissions);
  }
}
