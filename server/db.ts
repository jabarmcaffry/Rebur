import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Ensure the PostgreSQL database is provisioned in Replit.",
  );
}

const connectionString = process.env.DATABASE_URL;

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

export const pool = new Pool({
  connectionString,
  ssl: sslConfig,
});

export const db = drizzle({ client: pool, schema });
