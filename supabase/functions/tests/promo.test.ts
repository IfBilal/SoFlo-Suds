import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { setup, ids } from './helpers.ts';
import { discountFor } from '../_shared/promo.ts';

let t: Awaited<ReturnType<typeof setup>>;
before(async () => {
  t = await setup();
  t.urable.jobs.push(
    { id: 'pj1', customerRef: 'uA', itemRefs: ['vA'], status: 'scheduled', paymentStatus: 'unpaid', start: 1_900_000_000_000, invoice: { subtotal: 20000, total: 20000, items: { a: [{ productServiceId: 's1', quantity: 1 }] } } },
    { id: 'pj2', customerRef: 'uA', itemRefs: ['vA'], status: 'scheduled', paymentStatus: 'unpaid', start: 1_900_100_000_000, invoice: { subtotal: 20000, total: 20000, items: { a: [{ productServiceId: 's1', quantity: 1 }] } } },
    { id: 'pj3', customerRef: 'uA', itemRefs: ['vA'], status: 'scheduled', paymentStatus: 'paid', start: 1_900_200_000_000, invoice: { subtotal: 20000, total: 20000, items: { a: [{ productServiceId: 's1', quantity: 1 }] } } },
  );
  await t.sql`INSERT INTO promo_codes (code, kind, value, min_order_usd, max_uses_per_user, max_total_uses) VALUES
    ('TEN', 'percent', 10, 0, 1, NULL), ('FIVE', 'fixed', 5, 0, 5, NULL), ('BIG', 'percent', 50, 500, 1, NULL),
    ('ONCE', 'percent', 5, 0, 5, 1), ('FIRST', 'percent', 5, 0, 5, NULL), ('OFF', 'percent', 5, 0, 5, NULL)`;
  await t.sql`UPDATE promo_codes SET active = false WHERE code = 'OFF'`;
  await t.sql`UPDATE promo_codes SET first_booking_only = true WHERE code = 'FIRST'`;
});
after(async () => { await t.stop(); });

const apply = (token: string, job: string, code: string) => t.call('POST', `/bookings/${job}/promo`, { token, body: { code } });
const uses = (job: string) => t.sql`SELECT status FROM promo_uses WHERE urable_job_id = ${job} ORDER BY created_at`;

describe('cancellation window', () => {
  test('inside 24 h the app says call the shop; outside it cancels', async () => {
    t.urable.jobs.push({ id: 'soonJob', customerRef: 'uA', itemRefs: ['vA'], status: 'scheduled', paymentStatus: 'unpaid', start: Date.now() + 6 * 3_600_000, invoice: { subtotal: 1000, items: {} } });
    const blocked = await t.call('POST', '/bookings/soonJob/cancel', { token: 'tokA' });
    assert.equal(blocked.status, 409); assert.equal(blocked.json.error.code, 'CANCEL_NOT_ALLOWED'); assert.match(blocked.json.error.message, /call the shop at 555/i);
    assert.ok(!t.urable.calls.includes('cancelJob:soonJob'));
    await t.sql`INSERT INTO settings (key, value) VALUES ('cancel_window_hours', '2') ON CONFLICT (key) DO UPDATE SET value = '2'`;
    assert.equal((await t.call('POST', '/bookings/soonJob/cancel', { token: 'tokA' })).status, 200);
    await t.sql`DELETE FROM settings WHERE key = 'cancel_window_hours'`;
  });
});

describe('discount math', () => {
  test('percent rounds to cents, fixed is dollars, both capped at the subtotal', () => {
    assert.equal(discountFor('percent', 10, 17499), 1750);
    assert.equal(discountFor('fixed', 5, 20000), 500);
    assert.equal(discountFor('fixed', 500, 20000), 20000);
    assert.equal(discountFor('percent', 100, 999), 999);
  });
});

describe('POST /bookings/:id/promo', () => {
  test('requires sign-in and never lets one customer touch another\'s booking', async () => {
    assert.equal((await t.call('POST', '/bookings/pj1/promo', { body: { code: 'TEN' } })).status, 401);
    assert.equal((await apply('tokB', 'pj1', 'TEN')).status, 404);
    assert.equal((await uses('pj1')).length, 0);
  });
  test('applies a percent code once: reserves, tells Urable, returns the new total', async () => {
    const r = await apply('tokA', 'pj1', 'ten');
    assert.equal(r.status, 200); assert.equal(r.json.discountCents, 2000); assert.equal(r.json.totalCents, 18000);
    assert.ok(t.urable.calls.includes('discount:pj1:pct:10'));
    assert.deepEqual((await uses('pj1')).map((x) => x.status), ['reserved']);
  });
  test('a booking cannot take a second code', async () => {
    const r = await apply('tokA', 'pj1', 'FIVE');
    assert.equal(r.status, 400); assert.equal(r.json.error.code, 'PROMO_ALREADY_USED');
  });
  test('per-user limit, unknown, inactive, minimum order and total limit map to their codes', async () => {
    assert.equal((await apply('tokA', 'pj2', 'TEN')).json.error.code, 'PROMO_ALREADY_USED');
    assert.equal((await apply('tokA', 'pj2', 'NOPE')).json.error.code, 'PROMO_INVALID');
    assert.equal((await apply('tokA', 'pj2', 'OFF')).json.error.code, 'PROMO_INVALID');
    assert.equal((await apply('tokA', 'pj2', 'BIG')).json.error.code, 'PROMO_MIN_ORDER');
    assert.equal((await apply('tokA', 'pj2', 'FIRST')).json.error.code, 'PROMO_FIRST_BOOKING_ONLY');
    assert.equal((await apply('tokA', 'pj2', 'ONCE')).status, 200);
    t.urable.jobs.push({ id: 'pjB', customerRef: 'uB', itemRefs: ['vB'], status: 'scheduled', paymentStatus: 'unpaid', invoice: { subtotal: 10000, items: { a: [{ productServiceId: 's1' }] } } });
    assert.equal((await apply('tokB', 'pjB', 'ONCE')).json.error.code, 'PROMO_LIMIT_REACHED');
  });
  test('a paid booking cannot take a code', async () => {
    const r = await apply('tokA', 'pj3', 'FIVE');
    assert.equal(r.status, 409); assert.equal(r.json.error.code, 'PROMO_NOT_APPLICABLE');
  });
  test('if Urable refuses, the reservation is released and the code stays usable', async () => {
    await t.sql`DELETE FROM promo_uses WHERE urable_job_id = 'pj2'`;
    t.urable.failDiscount = true;
    const bad = await apply('tokA', 'pj2', 'FIVE');
    assert.equal(bad.status, 500);
    assert.deepEqual((await uses('pj2')).map((x) => x.status), ['released']);
    t.urable.failDiscount = false;
    assert.equal((await apply('tokA', 'pj2', 'FIVE')).status, 200);
  });
  test('cancelling a booking releases its reservation', async () => {
    assert.equal((await t.call('POST', '/bookings/pj1/cancel', { token: 'tokA' })).status, 200);
    assert.deepEqual((await uses('pj1')).map((x) => x.status), ['released']);
  });
  test('the 11th bad attempt in an hour is rate limited', async () => {
    await t.sql`DELETE FROM promo_attempts`;
    for (let i = 0; i < 10; i++) assert.equal((await apply('tokA', 'pj2', 'BAD' + i)).json.error.code, i < 10 ? 'PROMO_INVALID' : '');
    const r = await apply('tokA', 'pj2', 'TEN');
    assert.equal(r.status, 429); assert.equal(r.json.error.code, 'PROMO_RATE_LIMITED');
  });
});
void ids;
