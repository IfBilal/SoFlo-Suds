import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { A, B, as, denied, freshDb, ids, seed } from './harness.ts';

const ALL_TABLES = ['users', 'admins', 'job_sync', 'booking_handoffs', 'settings', 'promo_codes', 'promo_uses', 'points_ledger', 'rewards', 'reward_redemptions', 'referrals', 'reviews', 'gallery', 'warranties', 'shop_products', 'push_tokens', 'notification_log', 'admin_audit', 'sync_state', 'booking_products', 'next_booking_products'];

let db: PGlite;
before(async () => { db = await freshDb(); await seed(db); });

describe('migration replay', () => {
  test('RLS is enabled on every application table', async () => {
    const rows = await db.query<{ relname: string }>(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity`);
    assert.deepEqual(rows.rows, []);
  });
  test('auth_user_id is unique on users and admins', async () => {
    await assert.rejects(db.query(`INSERT INTO users (auth_user_id,urable_customer_id,name,email,phone,referral_code) VALUES ('${ids.authA}','uX','X','x@t.test','1','XXXXXX')`), /unique|duplicate/i);
    await assert.rejects(db.query(`INSERT INTO admins (auth_user_id,email) VALUES ('${ids.authAdmin}','y@t.test')`), /unique|duplicate/i);
  });
});

describe('anon', () => {
  for (const table of ALL_TABLES) {
    test(`cannot read ${table}`, async () => { assert.ok(await denied(as(db, 'anon', null, `SELECT * FROM ${table}`))); });
  }
  test('cannot write', async () => {
    assert.ok(await denied(as(db, 'anon', null, `INSERT INTO settings (key,value) VALUES ('x','1')`)));
  });
  test('may read only the safe shop config and sees no private settings', async () => {
    const [row] = await as<{ shop_config: Record<string, unknown> }>(db, 'anon', null, 'SELECT public.shop_config() AS shop_config');
    assert.equal(row.shop_config.shop_phone, '555');
    assert.equal('secret_internal' in row.shop_config, false);
    assert.equal('points_per_usd' in row.shop_config, false);
  });
  test('cannot call private functions', async () => {
    assert.ok(await denied(as(db, 'anon', null, `SELECT soflo_private.current_user_id()`)));
  });
});

describe('customer A', () => {
  test('reads own profile columns only', async () => {
    const rows = await as(db, 'authenticated', ids.authA, 'SELECT id,name,email FROM users');
    assert.deepEqual(rows.map((r) => (r as { name: string }).name), ['Alice']);
  });
  test('cannot select protected user columns', async () => {
    for (const col of ['urable_customer_id', 'auth_user_id', 'referred_by', 'deleted_at']) {
      assert.ok(await denied(as(db, 'authenticated', ids.authA, `SELECT ${col} FROM users`)), col);
    }
  });
  test('cannot update profile, ledger, or anything directly', async () => {
    assert.ok(await denied(as(db, 'authenticated', ids.authA, `UPDATE users SET name='Hacked' WHERE id='${A}'`)));
    assert.ok(await denied(as(db, 'authenticated', ids.authA, `INSERT INTO points_ledger (user_id,delta,reason,source_key) VALUES ('${A}',9999,'x','y')`)));
    assert.ok(await denied(as(db, 'authenticated', ids.authA, `UPDATE push_tokens SET user_id='${A}'`)));
  });
  test('sees only own points', async () => {
    const rows = await as<{ delta: number }>(db, 'authenticated', ids.authA, 'SELECT delta FROM points_ledger');
    assert.deepEqual(rows.map((r) => r.delta), [500]);
  });
  test('sees active rewards and published gallery/products only', async () => {
    assert.deepEqual((await as<{ name: string }>(db, 'authenticated', ids.authA, 'SELECT name FROM rewards')).map((r) => r.name), ['Free wash']);
    assert.deepEqual((await as<{ title: string }>(db, 'authenticated', ids.authA, 'SELECT title FROM gallery')).map((r) => r.title), ['Pub']);
    assert.deepEqual((await as<{ name: string }>(db, 'authenticated', ids.authA, 'SELECT name FROM shop_products')).map((r) => r.name), ['Soap']);
  });
  test('cannot read tables with no grant (job_sync, push_tokens, settings, admins)', async () => {
    for (const t of ['job_sync', 'push_tokens', 'settings', 'admins', 'notification_log', 'admin_audit', 'booking_handoffs', 'promo_uses', 'referrals', 'booking_products', 'next_booking_products']) {
      assert.ok(await denied(as(db, 'authenticated', ids.authA, `SELECT * FROM ${t}`)), t);
    }
  });
});

describe('customer B cannot see A', () => {
  test('profile, points, redemptions', async () => {
    assert.deepEqual((await as<{ name: string }>(db, 'authenticated', ids.authB, 'SELECT name FROM users')).map((r) => r.name), ['Bob']);
    assert.deepEqual((await as<{ delta: number }>(db, 'authenticated', ids.authB, 'SELECT delta FROM points_ledger')).map((r) => r.delta), [300]);
    assert.equal((await as(db, 'authenticated', ids.authB, `SELECT * FROM points_ledger WHERE user_id='${A}'`)).length, 0);
  });
});

describe('deleted customer, stranger and admin identity', () => {
  test('deleted customer sees nothing', async () => {
    assert.equal((await as(db, 'authenticated', ids.authDeleted, 'SELECT id FROM users')).length, 0);
    assert.equal((await as(db, 'authenticated', ids.authDeleted, 'SELECT * FROM points_ledger')).length, 0);
  });
  test('authenticated user with no app profile sees nothing personal', async () => {
    assert.equal((await as(db, 'authenticated', ids.authStranger, 'SELECT id FROM users')).length, 0);
    assert.equal((await as(db, 'authenticated', ids.authStranger, 'SELECT * FROM points_ledger')).length, 0);
  });
  test('an admin Auth identity gains no extra table access through RLS', async () => {
    assert.ok(await denied(as(db, 'authenticated', ids.authAdmin, 'SELECT * FROM admins')));
    assert.ok(await denied(as(db, 'authenticated', ids.authAdmin, 'SELECT * FROM admin_audit')));
    assert.equal((await as(db, 'authenticated', ids.authAdmin, 'SELECT * FROM points_ledger')).length, 0);
  });
});

describe('service role', () => {
  test('bypasses RLS and reads everything', async () => {
    assert.equal((await as(db, 'service_role', null, 'SELECT id FROM users')).length, 3);
  });
});
