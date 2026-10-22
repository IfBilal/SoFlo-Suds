import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import { A, B, as, denied, freshDb, ids, seed } from './harness.ts';

let db: PGlite;
before(async () => { db = await freshDb(); await seed(db); });
const q = <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => db.query<T>(sql, p).then((r) => r.rows);
const bal = async (u: string) => (await q<{ b: number }>(`SELECT COALESCE(sum(delta),0)::int b FROM points_ledger WHERE user_id=$1`, [u]))[0].b;

describe('function privileges', () => {
  test('client roles cannot execute any business function', async () => {
    for (const fn of ["soflo_private.redeem_reward('" + A + "','aaaa1111-0000-4000-8000-000000000001')", "soflo_private.delete_account('" + A + "')", "soflo_private.record_job('" + A + "','j','v','completed','paid',now(),1000)"]) {
      assert.ok(await denied(as(db, 'authenticated', ids.authA, `SELECT ${fn}`)), fn);
    }
  });
  test('service role can', async () => {
    await as(db, 'service_role', null, `SELECT * FROM soflo_private.claim_sync_lease('jobs', 1)`);
  });
});

describe('complete_profile', () => {
  const call = (auth: string, email: string, ref: string | null = null, urable = 'uN') =>
    q<{ id: string }>(`SELECT soflo_private.complete_profile($1,$2,'New Person','5551234',$3,$4) id`, [auth, email, urable, ref]);
  const newAuth = '00000000-0000-4000-8000-0000000000c1';
  test('creates profile + referral, and is idempotent', async () => {
    await q(`INSERT INTO auth.users (id,email) VALUES ($1,'new@t.test')`, [newAuth]);
    const [first] = await call(newAuth, 'New@T.test', 'aaaaaa');
    const [second] = await call(newAuth, 'new@t.test', 'aaaaaa');
    assert.equal(first.id, second.id);
    assert.equal((await q(`SELECT 1 FROM referrals WHERE referee_id=$1 AND referrer_id=$2 AND status='pending'`, [first.id, A])).length, 1);
    assert.equal((await q(`SELECT 1 FROM users WHERE auth_user_id=$1`, [newAuth])).length, 1);
    const [u] = await q<{ referral_code: string; email: string }>(`SELECT referral_code,email FROM users WHERE id=$1`, [first.id]);
    assert.match(u.referral_code, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(u.email, 'new@t.test');
  });
  test('rejects a bad referral code without creating a row', async () => {
    const a = '00000000-0000-4000-8000-0000000000c2';
    await q(`INSERT INTO auth.users (id,email) VALUES ($1,'r@t.test')`, [a]);
    await assert.rejects(call(a, 'r@t.test', 'ZZZZZZ'), /REFERRAL_INVALID/);
    assert.equal((await q(`SELECT 1 FROM users WHERE auth_user_id=$1`, [a])).length, 0);
  });
  test('never links a legacy account by email', async () => {
    await q(`INSERT INTO users (urable_customer_id,name,email,phone,referral_code,password_hash) VALUES ('uL','Legacy','legacy@t.test','1','LLLLLL','h')`);
    const a = '00000000-0000-4000-8000-0000000000c3';
    await q(`INSERT INTO auth.users (id,email) VALUES ($1,'legacy@t.test')`, [a]);
    await assert.rejects(call(a, 'legacy@t.test'), /ACCOUNT_NEEDS_MIGRATION/);
    await assert.rejects(call('00000000-0000-4000-8000-0000000000c4', 'a@t.test'), /EMAIL_TAKEN/);
  });
});

describe('redeem_reward', () => {
  const R = 'aaaa1111-0000-4000-8000-000000000001';
  test('debits once, issues a code, refuses when short, and hides inactive rewards', async () => {
    const [r] = await q<{ code: string; status: string; reward_name: string }>(`SELECT * FROM soflo_private.redeem_reward($1,$2)`, [A, R]);
    assert.equal(r.status, 'available'); assert.match(r.code, /^[0-9A-F]{16}$/);
    assert.equal(await bal(A), 300);
    await q(`SELECT * FROM soflo_private.redeem_reward($1,$2)`, [A, R]);
    assert.equal(await bal(A), 100);
    await assert.rejects(q(`SELECT * FROM soflo_private.redeem_reward($1,$2)`, [A, R]), /INSUFFICIENT_POINTS/);
    await assert.rejects(q(`SELECT * FROM soflo_private.redeem_reward($1,'aaaa1111-0000-4000-8000-000000000002')`, [A]), /NOT_FOUND/);
    assert.equal(await bal(A), 100);
    assert.equal((await q(`SELECT 1 FROM reward_redemptions WHERE user_id=$1`, [A])).length, 2);
  });
});

describe('record_job', () => {
  const rec = (u: string, job: string, status: string, pay: string, cents: number) =>
    q<{ r: Record<string, number | boolean | string | null> }>(`SELECT soflo_private.record_job($1,$2,'v1',$3,$4,now(),$5) r`, [u, job, status, pay, cents]).then((x) => x[0].r);
  test('new job reported once; status change reported', async () => {
    assert.equal((await rec(B, 'j1', 'scheduled', 'unpaid', 0)).isNew, true);
    const again = await rec(B, 'j1', 'scheduled', 'unpaid', 0);
    assert.equal(again.isNew, false); assert.equal(again.oldStatus, 'scheduled');
  });
  test('unpaid completion credits zero; paid completion credits exactly once', async () => {
    const start = await bal(B);
    await rec(B, 'j2', 'completed', 'unpaid', 20000);
    assert.equal(await bal(B), start);
    assert.equal((await rec(B, 'j2', 'completed', 'paid', 20050)).credited, 200);
    for (let i = 0; i < 3; i++) assert.equal((await rec(B, 'j2', 'completed', 'paid', 20050)).credited, 0);
    assert.equal(await bal(B), start + 200);
  });
  test('parallel replays never double credit', async () => {
    const start = await bal(B);
    await Promise.all([1, 2, 3, 4].map(() => rec(B, 'j3', 'completed', 'paid', 10000)));
    assert.equal(await bal(B), start + 100);
  });
  test('refund writes one compensating entry', async () => {
    const start = await bal(B);
    await rec(B, 'j2', 'completed', 'refunded', 20050);
    await rec(B, 'j2', 'completed', 'refunded', 20050);
    assert.equal(await bal(B), start - 200);
  });
  test('another user cannot hijack a job id', async () => {
    assert.equal((await rec(A, 'j1', 'completed', 'paid', 99999)).skipped, true);
    assert.equal((await q<{ user_id: string }>(`SELECT user_id FROM job_sync WHERE urable_job_id='j1'`))[0].user_id, B);
  });
  test('referee first paid job settles referral for both sides once', async () => {
    const [{ id: newUser }] = await q<{ id: string }>(`SELECT id FROM users WHERE email='new@t.test'`);
    const a0 = await bal(A), n0 = await bal(newUser);
    await rec(newUser, 'jr1', 'completed', 'paid', 10000);
    await rec(newUser, 'jr2', 'completed', 'paid', 10000);
    assert.equal(await bal(newUser), n0 + 100 + 100 + 50);
    assert.equal(await bal(A), a0 + 50);
    const [ref] = await q<{ status: string; qualifying_job_id: string }>(`SELECT status,qualifying_job_id FROM referrals WHERE referee_id=$1`, [newUser]);
    assert.deepEqual(ref, { status: 'rewarded', qualifying_job_id: 'jr1' });
  });
});

describe('delete_account and lease', () => {
  test('anonymizes, drops push tokens, returns auth id, and is not repeatable', async () => {
    const [{ x }] = await q<{ x: string }>(`SELECT soflo_private.delete_account($1) x`, [A]);
    assert.equal(x, ids.authA);
    const [u] = await q<{ name: string; email: string; password_hash: string | null; deleted_at: string | null }>(`SELECT name,email,password_hash,deleted_at FROM users WHERE id=$1`, [A]);
    assert.equal(u.name, 'Deleted customer'); assert.match(u.email, /@deleted\.invalid$/); assert.equal(u.password_hash, null); assert.ok(u.deleted_at);
    assert.equal((await q(`SELECT 1 FROM push_tokens WHERE user_id=$1`, [A])).length, 0);
    assert.equal((await q(`SELECT soflo_private.delete_account($1) x`, [A]))[0].x, null);
    assert.equal((await as(db, 'authenticated', ids.authA, 'SELECT id FROM users')).length, 0);
  });
  test('a lease cannot be held twice and resumes from the saved cursor', async () => {
    await q(`SELECT soflo_private.finish_sync_lease('jobs', NULL, '{}')`);
    const [c1] = await q<{ claimed: boolean }>(`SELECT * FROM soflo_private.claim_sync_lease('jobs', 60)`);
    const [c2] = await q<{ claimed: boolean }>(`SELECT * FROM soflo_private.claim_sync_lease('jobs', 60)`);
    assert.deepEqual([c1.claimed, c2.claimed], [true, false]);
    await q(`SELECT soflo_private.finish_sync_lease('jobs', $1, '{"checked":1}')`, [B]);
    const [c3] = await q<{ claimed: boolean; cursor: string }>(`SELECT * FROM soflo_private.claim_sync_lease('jobs', 60)`);
    assert.equal(c3.claimed, true); assert.equal(c3.cursor, B);
  });
});
