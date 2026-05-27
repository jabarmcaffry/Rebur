import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Add your Neon (or other PostgreSQL) connection string in the Render dashboard under Environment Variables.",
  );
}

const connectionString = process.env.DATABASE_URL;

// Render.com internal PostgreSQL URLs don't include sslmode but external ones do.
// We detect SSL requirement by checking if the URL already specifies it, otherwise
// default to requiring SSL only in production.
const sslConfig = (() => {
  if (connectionString.includes('sslmode=disable')) return false;
  if (connectionString.includes('sslmode=require') || connectionString.includes('sslmode=prefer')) {
    return { rejectUnauthorized: false };
  }
  if (process.env.NODE_ENV === 'production') {
    return { rejectUnauthorized: false };
  }
  return false;
})();

export const pool = new Pool({
  connectionString,
  ssl: sslConfig,
});

export const db = drizzle({ client: pool, schema });
