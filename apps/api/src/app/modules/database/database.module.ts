import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { Env } from '../../env.schema';

export const DATABASE_CONNECTION = Symbol('DATABASE_CONNECTION');

export type Database = NodePgDatabase;

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<Env, true>): Database => {
        const pool = new Pool({
          connectionString: configService.get('DATABASE_URL', { infer: true }),
        });
        return drizzle(pool);
      },
    },
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}
