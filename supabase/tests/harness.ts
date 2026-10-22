import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const migrations = fileURLToPath(new URL('../migrations', import.meta.url));

// Minimal stand-ins for what the hosted platform provides before our migrations run.
// Default privileges mirror Supabase (new public tables are open to the client roles),
// so the tests prove our migration actually revokes them.
const platform = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT anon, authenticated, service_role TO CURRENT_USER;
CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

export async function freshDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(platform);
  for (const file of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrations, file), 'utf8'));
  }
  return db;
}

/** Run a query as a client role with a verified Auth UID, like PostgREST does. */
export async function as<T = Record<string, unknown>>(
  db: PGlite, role: 'anon' | 'authenticated' | 'service_role', sub: string | null, sql: string, params: unknown[] = [],
): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [sub ?? '']);
    await tx.exec(`SET LOCAL ROLE ${role}`);
    const result = await tx.query<T>(sql, params);
    return result.rows;
  });
}

export async function denied(promise: Promise<unknown>): Promise<boolean> {
  try { await promise; return false; } catch (e) { return /permission denied|row-level security|violates/i.test(String((e as Error).message)); }
}

export const ids = {
  authA: '00000000-0000-4000-8000-00000000000a', authB: '00000000-0000-4000-8000-00000000000b',
  authAdmin: '00000000-0000-4000-8000-0000000000ad', authDeleted: '00000000-0000-4000-8000-0000000000de',
  authStranger: '00000000-0000-4000-8000-0000000000ff',
};

/** Two customers, a deleted customer, an active and an inactive admin, plus content. */
export async function seed(db: PGlite) {
  await db.exec(`
    INSERT INTO auth.users (id,email) VALUES
      ('${ids.authA}','a@t.test'),('${ids.authB}','b@t.test'),('${ids.authAdmin}','admin@t.test'),
      ('${ids.authDeleted}','gone@t.test'),('${ids.authStranger}','nobody@t.test');
    INSERT INTO users (id,auth_user_id,urable_customer_id,name,email,phone,referral_code,password_hash) VALUES
      ('11111111-1111-4111-8111-111111111111','${ids.authA}','uA','Alice','a@t.test','5550001','AAAAAA','legacy-hash'),
      ('22222222-2222-4222-8222-222222222222','${ids.authB}','uB','Bob','b@t.test','5550002','BBBBBB',NULL);
    INSERT INTO users (id,auth_user_id,urable_customer_id,name,email,phone,referral_code,deleted_at) VALUES
      ('33333333-3333-4333-8333-333333333333','${ids.authDeleted}','uD','Deleted customer','x@deleted.invalid','','DDDDDD',now());
    INSERT INTO admins (id,auth_user_id,email,active) VALUES
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${ids.authAdmin}','admin@t.test',true);
    INSERT INTO points_ledger (user_id,delta,reason,source_key) VALUES
      ('11111111-1111-4111-8111-111111111111',500,'job_completed','jobA'),
      ('22222222-2222-4222-8222-222222222222',300,'job_completed','jobB');
    INSERT INTO rewards (id,name,points_cost,active) VALUES
      ('aaaa1111-0000-4000-8000-000000000001','Free wash',200,true),
      ('aaaa1111-0000-4000-8000-000000000002','Hidden',100,false);
    INSERT INTO gallery (title,before_path,after_path,published) VALUES ('Pub','b','a',true),('Draft','b','a',false);
    INSERT INTO shop_products (name,price_cents,active) VALUES ('Soap',1000,true),('Old',500,false);
    INSERT INTO job_sync (user_id,urable_job_id,urable_vehicle_id,last_status) VALUES ('11111111-1111-4111-8111-111111111111','jobA','vA','completed');
    INSERT INTO push_tokens (token,user_id,platform) VALUES ('tokenA-tokenA-tokenA-1','11111111-1111-4111-8111-111111111111','ios');
    INSERT INTO settings (key,value) VALUES ('shop_phone','"555"'),('points_per_usd','1'),('referral_reward_points','50') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;
    INSERT INTO settings (key,value) VALUES ('secret_internal','"nope"');
  `);
}
export const A = '11111111-1111-4111-8111-111111111111';
export const B = '22222222-2222-4222-8222-222222222222';
