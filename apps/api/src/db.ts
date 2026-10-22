import pg from 'pg';
import { readFileSync } from 'node:fs';

let pool: pg.Pool | undefined;
export function db(): pg.Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const caPath = process.env.DATABASE_CA_CERT_PATH;
  pool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    ssl: process.env.DATABASE_URL.includes('localhost')
      ? false
      : { rejectUnauthorized: true, ...(caPath ? { ca: readFileSync(caPath, 'utf8') } : {}) },
  });
  return pool;
}
export async function closeDb() { await pool?.end(); pool = undefined; }
