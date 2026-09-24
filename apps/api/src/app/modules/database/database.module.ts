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
      useFactory: async (
        configService: ConfigService<Env, true>,
      ): Promise<Database> => {
        const pool = new Pool({
          connectionString: configService.get('DATABASE_URL', { infer: true }),
        });

        try {
          await pool.query('SELECT 1');
        } catch (error) {
          await pool.end();
          throw new Error(
            'Failed to connect to PostgreSQL. Check DATABASE_URL and database availability.',
            { cause: error },
          );
        }

        return drizzle(pool);
      },
    },
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}
