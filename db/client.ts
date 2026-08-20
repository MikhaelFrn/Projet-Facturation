import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

// True once the company hands over the Supabase connection string — the
// single switch that lets feature repositories fall back to mock data until
// then. See features/invoicing/repository.ts.
export const isDatabaseConfigured = Boolean(connectionString);

let database: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!isDatabaseConfigured) {
    throw new Error(
      "Database is not configured. Set DATABASE_URL in .env.local (Supabase " +
        "connection string), or call code paths that check isDatabaseConfigured first."
    );
  }

  if (!database) {
    // prepare: false — required when connecting through Supabase's transaction
    // pooler (pgbouncer), which doesn't support prepared statements.
    const client = postgres(connectionString!, { prepare: false });
    database = drizzle(client, { schema });
  }

  return database;
}