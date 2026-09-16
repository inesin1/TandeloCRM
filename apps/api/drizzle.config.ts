/// <reference types="node" />
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './apps/api/src/app/modules/**/*.entity.ts',
  out: './apps/api/drizzle',
  dbCredentials: {
    url: databaseUrl,
  },
});
