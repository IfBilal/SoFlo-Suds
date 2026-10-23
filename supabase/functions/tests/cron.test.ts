import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { A, B, setup } from './helpers.ts';
import { handle } from '../cron-worker/index.ts';
import { syncJobsBatch, sendRemindersOnce, sendReviewPromptsOnce } from '../_shared/sync.ts';
import { processReceipts, sendPushToUser } from '../_shared/push.ts';

let t: Awaited<ReturnType<typeof setup>>;
before(async () => {
  t = await setup();
  await t.sql`DELETE FROM points_ledger`; await t.sql`DELETE FROM job_sync`; await t.sql`UPDATE settings SET value = '2'::jsonb WHERE key = 'points_per_usd'`;
  await t.sql`DELETE FROM push_tokens`;
  await t.sql`INSERT INTO push_tokens (token,user_id,platform) VALUES ('ExponentPushToken[AAAAAAAAAAAAAAAAAAAA]', ${A}, 'ios'), ('ExponentPushToken[BBBBBBBBBBBBBBBBBBBB]', ${B}, 'android')`;
});
after(async () => { await t.stop(); });
const bal = async (u: string) => (await t.sql`SELECT COALESCE(sum(delta),0)::int b FROM points_ledger WHERE user_id = ${u}`)[0].b as number;
const SECRET = 'x'.repeat(32);
const cron = (headers: Record<string, string> = {}, method = 'POST') => handle(new Request('https://x.test/cron-worker', { method, headers }), t.deps, SECRET);

describe('scheduler authentication', () => {
  test('rejects no secret, wrong secret, a customer JWT, and short server secrets', async () => {
    assert.equal((await cron()).status, 401);
    assert.equal((await cron({ 'x-cron-secret': 'nope' })).status, 401);
    assert.equal((await cron({ authorization: 'Bearer tokA' })).status, 401);
    assert.equal((await handle(new Request('https://x.test', { method: 'POST', headers: { 'x-cron-secret': 'short' } }), t.deps, 'short')).status, 401);
    assert.equal((await handle(new Request('https://x.test', { method: 'POST' }), t.deps, '')).status, 401);
    assert.equal((await cron({ 'x-cron-secret': SECRET }, 'GET')).status, 405);
  });
});

describe('sync', () => {
  test('first run credits paid completion without confirming an unpaid booking', async () => {
    const res = await cron({ 'x-cron-secret': SECRET });
    const body = await res.json();
    assert.equal(res.status, 200); assert.ok(body.sync.users >= 2);
    assert.equal(await bal(A), 200);            // $100.00 paid x 2 points/USD
    assert.equal(await bal(B), 0);              // scheduled, unpaid
    const confirmed = t.pushed.flat().filter((m) => m.title === 'Booking confirmed');
    assert.equal(confirmed.length, 0);          // B's scheduled job has not been paid
  });
  test('replays are idempotent: no duplicate credits or pushes', async () => {
    const pushes = t.pushed.length;
    for (let i = 0; i < 3; i++) await syncJobsBatch(t.deps);
    assert.equal(await bal(A), 200); assert.equal(t.pushed.length, pushes);
    assert.equal((await t.sql`SELECT count(*)::int c FROM points_ledger WHERE reason = 'job_completed'`)[0].c, 1);
  });
  test('a scheduled job receives confirmation once when Urable later reports paid', async () => {
    t.urable.jobs.find((j) => j.id === 'jobB')!.paymentStatus = 'paid';
    await syncJobsBatch(t.deps); await syncJobsBatch(t.deps);
    assert.equal(t.pushed.flat().filter((m) => m.title === 'Booking confirmed').length, 1);
    assert.equal(await bal(B), 0); // payment alone does not earn completion points
  });
  test('a status change notifies exactly once', async () => {
    t.urable.jobs.find((j) => j.id === 'jobB')!.status = 'in progress';
    await syncJobsBatch(t.deps); await syncJobsBatch(t.deps);
    assert.equal(t.pushed.flat().filter((m) => m.title === 'Service update').length, 1);
  });
  test('a failing Urable customer does not block others and the run reports it', async () => {
    t.urable.failFor.add('uA');
    t.urable.jobs.find((j) => j.id === 'jobB')!.status = 'completed';
    t.urable.jobs.find((j) => j.id === 'jobB')!.paymentStatus = 'paid';
    (t.urable.jobs.find((j) => j.id === 'jobB')!).invoice = { amountPaid: 5000 };
    const stats = await syncJobsBatch(t.deps);
    assert.ok(stats.failed >= 1); assert.equal(await bal(B), 100);
    t.urable.failFor.clear();
  });
  test('bounded batches resume from the cursor and wrap around', async () => {
    await t.sql`UPDATE sync_state SET cursor = NULL, lease_until = NULL WHERE name = 'jobs'`;
    const seen: boolean[] = [];
    let ticks = 0;
    const clock = () => ticks++ * 1000;           // fake clock: each check burns a second
    for (let i = 0; i < 6; i++) { const s = await syncJobsBatch(t.deps, { budgetMs: 2500, batchSize: 1, now: clock }); seen.push(s.wrapped); }
    assert.ok(seen.some(Boolean), 'cursor wrapped past the last customer');
    const [state] = await t.sql`SELECT lease_until, last_stats FROM sync_state WHERE name = 'jobs'`;
    assert.equal(state.lease_until, null); assert.ok(state.last_stats);
  });
  test('an overlapping run is skipped while the lease is held', async () => {
    await t.sql`UPDATE sync_state SET lease_until = now() + interval '5 minutes' WHERE name = 'jobs'`;
    assert.equal((await syncJobsBatch(t.deps)).skipped, true);
    await t.sql`UPDATE sync_state SET lease_until = NULL WHERE name = 'jobs'`;
  });
});

describe('push + reminders', () => {
  test('promo-off users get no promo; opted-out appointment users get no service push', async () => {
    assert.equal(await sendPushToUser(t.deps, A, 'promo:t1', { title: 'x', body: 'y' }, 'promo'), 'skipped');
    await t.sql`UPDATE users SET notification_appointments = false WHERE id = ${A}`;
    assert.equal(await sendPushToUser(t.deps, A, 'evt:1', { title: 'x', body: 'y' }, 'service'), 'skipped');
    await t.sql`UPDATE users SET notification_appointments = true WHERE id = ${A}`;
  });
  test('a failed send releases the claim so a retry can send; success never repeats', async () => {
    t.state.pushFails = true;
    assert.equal(await sendPushToUser(t.deps, A, 'evt:retry', { title: 'x', body: 'y' }, 'service'), 'failed');
    t.state.pushFails = false;
    assert.equal(await sendPushToUser(t.deps, A, 'evt:retry', { title: 'x', body: 'y' }, 'service'), 'sent');
    assert.equal(await sendPushToUser(t.deps, A, 'evt:retry', { title: 'x', body: 'y' }, 'service'), 'skipped');
  });
  test('reminders go out once for appointments ~24h away', async () => {
    await t.sql`INSERT INTO job_sync (user_id, urable_job_id, urable_vehicle_id, last_status, scheduled_at) VALUES (${A}, 'jobSoon', 'vA', 'scheduled', now() + interval '24 hours')`;
    await t.sql`INSERT INTO settings (key, value) VALUES ('reminder_hour_local', '0') ON CONFLICT (key) DO UPDATE SET value = '0'`;
    assert.equal((await sendRemindersOnce(t.deps)).sent, 1);
    assert.equal((await sendRemindersOnce(t.deps)).sent, 0);
  });
  test('reminders wait for the shop reminder hour and skip same-day or two-day-out visits', async () => {
    await t.sql`INSERT INTO job_sync (user_id, urable_job_id, urable_vehicle_id, last_status, scheduled_at) VALUES
      (${A}, 'jobWait', 'vA', 'scheduled', now() + interval '24 hours'), (${A}, 'jobToday', 'vA', 'scheduled', now() + interval '1 hour'), (${A}, 'jobFar', 'vA', 'scheduled', now() + interval '50 hours')`;
    await t.sql`UPDATE settings SET value = '24' WHERE key = 'reminder_hour_local'`;           // hour never reached
    assert.equal((await sendRemindersOnce(t.deps)).sent, 0);
    await t.sql`UPDATE settings SET value = '0' WHERE key = 'reminder_hour_local'`;
    await t.sql`UPDATE job_sync SET scheduled_at = now() + interval '1 hour' WHERE urable_job_id = 'jobWait'`; // not tomorrow
    assert.equal((await sendRemindersOnce(t.deps)).sent, 0);
  });
  test('a review prompt goes out once, 2 hours after completion, and not if already reviewed', async () => {
    await t.sql`INSERT INTO job_sync (user_id, urable_job_id, urable_vehicle_id, last_status, completed_at) VALUES
      (${A}, 'rv1', 'vA', 'completed', now() - interval '3 hours'), (${A}, 'rv2', 'vA', 'completed', now() - interval '30 minutes'), (${A}, 'rv3', 'vA', 'completed', now() - interval '3 hours')`;
    await t.sql`INSERT INTO reviews (user_id, urable_job_id, rating) VALUES (${A}, 'rv3', 5)`;
    const before = t.pushed.flat().length;
    assert.equal((await sendReviewPromptsOnce(t.deps)).sent, 1);
    assert.equal((await sendReviewPromptsOnce(t.deps)).sent, 0);
    const msgs = t.pushed.flat().slice(before);
    assert.equal(msgs.length, 1); assert.equal(msgs[0].data?.deepLink, '/review/rv1');
  });
  test('receipts remove tokens Expo reports as unregistered', async () => {
    await t.sql`DELETE FROM push_tickets`;
    await t.sql`INSERT INTO push_tickets (ticket_id, token, created_at) VALUES ('r1', 'ExponentPushToken[BBBBBBBBBBBBBBBBBBBB]', now() - interval '5 minutes'), ('r2', 'ExponentPushToken[AAAAAAAAAAAAAAAAAAAA]', now() - interval '5 minutes')`;
    const r = await processReceipts(t.deps, () => Promise.resolve({ r1: { status: 'error', details: { error: 'DeviceNotRegistered' } } }));
    assert.deepEqual(r, { checked: 2, removed: 1 });
    assert.equal((await t.sql`SELECT 1 FROM push_tokens WHERE token = 'ExponentPushToken[BBBBBBBBBBBBBBBBBBBB]'`).length, 0);
    assert.equal((await t.sql`SELECT ticket_id FROM push_tickets`)[0].ticket_id, 'r2'); // not ready yet: kept
  });
});
