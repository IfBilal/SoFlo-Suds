import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { freshDb } from './harness.ts';

const read = (dir: string, name: string) => readFileSync(fileURLToPath(new URL(`../${dir}/${name}`, import.meta.url)), 'utf8');
const exists = async (db: Awaited<ReturnType<typeof freshDb>>, sql: string) => (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${sql}) x`)).rows[0].n > 0;

test('rollback drill: the latest migrations can be reversed in order and re-applied', async () => {
  const db = await freshDb(); // every migration applied
  const hasTable = (t: string) => exists(db, `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${t}'`);
  const hasColumn = (t: string, c: string) => exists(db, `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='${t}' AND column_name='${c}'`);
  const bannerKey = async () => JSON.stringify((await db.query<{ k: string }>(`SELECT pg_get_functiondef('public.shop_config'::regproc) k`)).rows[0].k).includes('promo_banner_text');

  assert.equal(await hasColumn('users', 'device_id'), true); assert.equal(await hasColumn('job_sync', 'payment_fingerprint'), true);
  assert.equal(await hasTable('refresh_sessions'), false); assert.equal(await hasColumn('users', 'password_hash'), false);
  assert.equal(await hasTable('booking_products'), true); assert.equal(await bannerKey(), true);

  await db.exec(read('rollback', '20261024000013_down.sql'));
  assert.equal(await hasColumn('users', 'device_id'), false); assert.equal(await hasColumn('job_sync', 'payment_fingerprint'), false);

  await db.exec(read('rollback', '20261024000012_down.sql'));
  assert.equal(await hasTable('refresh_sessions'), true); assert.equal(await hasTable('password_resets'), true);
  assert.equal(await hasTable('booking_idempotency'), true); assert.equal(await hasColumn('users', 'password_hash'), true);

  await db.exec(read('rollback', '20261024000011_down.sql'));
  assert.equal(await bannerKey(), false);

  await db.exec(read('rollback', '20261024000010_down.sql'));
  assert.equal(await hasTable('booking_products'), false); assert.equal(await hasColumn('reward_redemptions', 'applied_job_id'), false);

  // and forward again: the same files re-apply cleanly
  for (const f of ['20261024000010_booking_extras.sql', '20261024000011_promo_banner.sql', '20261024000012_retire_legacy_auth.sql', '20261024000013_billing_and_referral_checks.sql']) await db.exec(read('migrations', f));
  assert.equal(await hasTable('booking_products'), true); assert.equal(await bannerKey(), true); assert.equal(await hasTable('refresh_sessions'), false); assert.equal(await hasColumn('users', 'device_id'), true);
  await db.close();
});
