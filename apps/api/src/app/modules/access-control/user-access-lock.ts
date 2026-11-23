import { sql } from 'drizzle-orm';
import type { DatabaseTransaction } from '../database/database.module';

/** Serializes permission-sensitive writes with user access changes. */
export function lockUserAccess(tx: DatabaseTransaction) {
  return tx.execute(sql`select pg_advisory_xact_lock(740921)`);
}
