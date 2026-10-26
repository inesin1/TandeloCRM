import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import {
  DATABASE_CONNECTION,
  Database,
} from './modules/database/database.module';

@Controller()
export class AppController {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database,
  ) {}

  @Get('health')
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('health/ready')
  async getReadiness(): Promise<{ status: 'ok'; database: 'connected' }> {
    try {
      await this.db.execute(sql`SELECT 1`);
      return { status: 'ok', database: 'connected' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'disconnected',
      });
    }
  }
}
