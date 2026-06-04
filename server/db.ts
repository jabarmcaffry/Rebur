import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

const connectionString = process.env.DATABASE_URL;

// Allow the server to run without a database (uses MemStorage fallback)
export let pool: Pool | null = null;
export let db: ReturnType<typeof drizzle> | null = null;

if (connectionString) {
  const sslConfig = (() => {
    if (connectionString.includes('sslmode=disable')) return false;
    if (connectionString.includes('localhost') || connectionString.includes('127.0.0.1')) return false;
    if (process.env.PGHOST && !process.env.PGHOST.includes('.')) return false;
    if (connectionString.includes('sslmode=require') || connectionString.includes('sslmode=prefer')) {
      return { rejectUnauthorized: false };
    }
    if (process.env.NODE_ENV === 'production') {
      return { rejectUnauthorized: false };
    }
    return false;
  })();

  pool = new Pool({
    connectionString,
    ssl: sslConfig,
  });

  db = drizzle({ client: pool, schema });
}
