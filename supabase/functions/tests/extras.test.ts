import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { setup } from './helpers.ts';

let t: Awaited<ReturnType<typeof setup>>;
const job = (id: string, over: Record<string, unknown> = {}) => ({ id, customerRef: 'uA', itemRefs: ['vA'], status: 'scheduled', paymentStatus: 'unpaid', start: Date.now() + 10 * 86_400_000, invoice: { subtotal: 20000, total: 20000, items: { a: [{ productServiceId: 's1', quantity: 1 }] } }, ...over });
let userA = '', userB = '', rewardId = '', productId = '', linkedProductId = '';

before(async () => {
  t = await setup();
  t.urable.jobs.push(job('xj1') as never, job('xj2') as never, job('xj3', { paymentStatus: 'paid' }) as never, job('xjB', { customerRef: 'uB', itemRefs: ['vB'] }) as never);
  userA = (await t.sql`SELECT id FROM users WHERE urable_customer_id = 'uA'`)[0].id as string;
  userB = (await t.sql`SELECT id FROM users WHERE urable_customer_id = 'uB'`)[0].id as string;
  rewardId = (await t.sql`INSERT INTO rewards (name, points_cost) VALUES ('Free interior refresh', 100) RETURNING id`)[0].id as string;
  productId = (await t.sql`INSERT INTO shop_products (name, price_cents) VALUES ('Spray wax', 1999) RETURNING id`)[0].id as string;
  linkedProductId = (await t.sql`INSERT INTO shop_products (name, price_cents, urable_product_id) VALUES ('Towel', 1500, 'uTowel') RETURNING id`)[0].id as string;
  await t.sql`INSERT INTO points_ledger (user_id, delta, reason, source_key) VALUES (${userA}, 500, 'job_completed', 'seed')`;
});
after(async () => { await t.stop(); });

const redeem = async () => (await t.call('POST', `/rewards/${rewardId}/redeem`, { token: 'tokA' })).json.id as string;
const attach = (token: string, jobId: string, redemptionId: string) => t.call('POST', `/bookings/${jobId}/reward`, { token, body: { redemptionId } });

describe('reward on a booking', () => {
  test('attaches an available redemption, tells the shop through the job notes', async () => {
    const rid = await redeem();
    const r = await attach('tokA', 'xj1', rid);
    assert.equal(r.status, 200); assert.equal(r.json.name, 'Free interior refresh'); assert.match(r.json.code, /^[A-Z0-9]{16}$/);
    assert.ok(t.urable.calls.includes('note:xj1:SOFLO REWARD ' + r.json.code));
    const d = await t.call('GET', '/bookings/xj1', { token: 'tokA' });
    assert.equal(d.json.reward.code, r.json.code);
    const list = await t.call('GET', '/rewards', { token: 'tokA' });
    assert.equal(list.json.redemptions.find((x: { id: string }) => x.id === rid).appliedJobId, 'xj1');
  });
  test('a reward cannot be used twice, and a booking takes only one', async () => {
    const used = (await t.sql`SELECT id FROM reward_redemptions WHERE applied_job_id = 'xj1'`)[0].id as string;
    assert.equal((await attach('tokA', 'xj2', used)).json.error.code, 'REDEMPTION_ALREADY_ATTACHED');
    const second = await redeem();
    assert.equal((await attach('tokA', 'xj1', second)).json.error.code, 'BOOKING_HAS_REWARD');
    assert.equal((await attach('tokA', 'xj2', second)).status, 200);
  });
  test("another customer's redemption or booking is invisible", async () => {
    const mine = await redeem();
    assert.equal((await attach('tokB', 'xjB', mine)).status, 404);
    assert.equal((await attach('tokA', 'xjB', mine)).status, 404);
    assert.equal((await attach('tokA', 'xj3', mine)).json.error.code, 'REWARD_NOT_APPLICABLE'); // paid booking
    assert.equal((await t.call('POST', '/bookings/xj1/reward', { body: { redemptionId: mine } })).status, 401);
  });
  test('a used or cancelled redemption is refused', async () => {
    const rid = await redeem();
    await t.sql`UPDATE reward_redemptions SET status = 'used' WHERE id = ${rid}`;
    assert.equal((await attach('tokA', 'xj3x', rid)).status, 404); // unknown booking
    t.urable.jobs.push(job('xj4') as never);
    assert.equal((await attach('tokA', 'xj4', rid)).json.error.code, 'REDEMPTION_NOT_AVAILABLE');
  });
  test('if Urable cannot record the note the claim is undone', async () => {
    const rid = await redeem(); t.urable.jobs.push(job('xj5') as never); t.urable.failNote = true;
    assert.equal((await attach('tokA', 'xj5', rid)).status, 500);
    t.urable.failNote = false;
    assert.equal((await t.sql`SELECT applied_job_id FROM reward_redemptions WHERE id = ${rid}`)[0].applied_job_id, null);
    assert.equal((await attach('tokA', 'xj5', rid)).status, 200);
  });
  test('cancelling the booking frees the reward for another visit', async () => {
    assert.equal((await t.call('POST', '/bookings/xj5/cancel', { token: 'tokA' })).status, 200);
    assert.equal((await t.sql`SELECT count(*)::int AS n FROM reward_redemptions WHERE applied_job_id = 'xj5'`)[0].n, 0);
    const free = (await t.sql`SELECT id FROM reward_redemptions WHERE user_id = ${userA} AND applied_job_id IS NULL AND status = 'available' LIMIT 1`)[0].id as string;
    t.urable.jobs.push(job('xj6') as never);
    assert.equal((await attach('tokA', 'xj6', free)).status, 200);
  });
  test('the sync marking a job cancelled frees the reward too', async () => {
    const { recordJob } = await import('../_shared/sync.ts');
    const j = t.urable.jobs.find((x) => x.id === 'xj6')!; j.status = 'canceled';
    await recordJob(t.deps, userA, j);
    assert.equal((await t.sql`SELECT count(*)::int AS n FROM reward_redemptions WHERE applied_job_id = 'xj6'`)[0].n, 0);
  });
});

describe('shop products on a booking', () => {
  test('a product without a Urable id becomes a note for the shop', async () => {
    const r = await t.call('POST', '/bookings/xj2/products', { token: 'tokA', body: { productId, quantity: 2 } });
    assert.equal(r.status, 201); assert.equal(r.json.asLineItem, false);
    assert.ok(t.urable.calls.includes('note:xj2:SOFLO SHOP PRODUCT'));
    assert.match(t.urable.jobs.find((x) => x.id === 'xj2')!.notes!, /Spray wax x2 \(\$39\.98\)/);
  });
  test('a product linked to Urable becomes a real invoice line', async () => {
    const r = await t.call('POST', '/bookings/xj2/products', { token: 'tokA', body: { productId: linkedProductId } });
    assert.equal(r.status, 201); assert.equal(r.json.asLineItem, true);
    assert.ok(t.urable.calls.includes('line:xj2:uTowel:1'));
  });
  test('the booking detail lists what was added; adding twice or on a paid booking is refused', async () => {
    const d = await t.call('GET', '/bookings/xj2', { token: 'tokA' });
    assert.deepEqual(d.json.products.map((x: { name: string }) => x.name).sort(), ['Spray wax', 'Towel']);
    assert.equal((await t.call('POST', '/bookings/xj2/products', { token: 'tokA', body: { productId } })).json.error.code, 'PRODUCT_ALREADY_ADDED');
    assert.equal((await t.call('POST', '/bookings/xj3/products', { token: 'tokA', body: { productId } })).json.error.code, 'PRODUCT_NOT_APPLICABLE');
  });
  test('unknown, inactive, out-of-range and cross-customer requests fail cleanly', async () => {
    const ghost = '99999999-9999-4999-8999-999999999999';
    assert.equal((await t.call('POST', '/bookings/xj1/products', { token: 'tokA', body: { productId: ghost } })).status, 404);
    await t.sql`UPDATE shop_products SET active = false WHERE id = ${productId}`;
    assert.equal((await t.call('POST', '/bookings/xj1/products', { token: 'tokA', body: { productId } })).status, 404);
    await t.sql`UPDATE shop_products SET active = true WHERE id = ${productId}`;
    assert.equal((await t.call('POST', '/bookings/xj1/products', { token: 'tokA', body: { productId, quantity: 99 } })).status, 400);
    assert.equal((await t.call('POST', '/bookings/xjB/products', { token: 'tokA', body: { productId } })).status, 404);
    assert.equal((await t.call('POST', '/bookings/xj1/products', { body: { productId } })).status, 401);
  });
  test('a failed Urable write leaves no record, so the customer can retry', async () => {
    t.urable.jobs.push(job('xj7') as never); t.urable.failNote = true;
    assert.equal((await t.call('POST', '/bookings/xj7/products', { token: 'tokA', body: { productId } })).status, 500);
    t.urable.failNote = false;
    assert.equal((await t.sql`SELECT count(*)::int AS n FROM booking_products WHERE urable_job_id = 'xj7'`)[0].n, 0);
    assert.equal((await t.call('POST', '/bookings/xj7/products', { token: 'tokA', body: { productId } })).status, 201);
  });
});

describe('add to next booking', () => {
  test('keeps a per-customer list that can be changed and removed', async () => {
    assert.equal((await t.call('POST', '/shop/next-booking', { token: 'tokA', body: { productId, quantity: 1 } })).status, 201);
    await t.call('POST', '/shop/next-booking', { token: 'tokA', body: { productId, quantity: 3 } });
    assert.deepEqual((await t.call('GET', '/shop/next-booking', { token: 'tokA' })).json, [{ productId, quantity: 3 }]);
    assert.deepEqual((await t.call('GET', '/shop/next-booking', { token: 'tokB' })).json, []);
    assert.equal((await t.call('POST', '/shop/next-booking', { token: 'tokA', body: { productId: '99999999-9999-4999-8999-999999999999' } })).status, 404);
    assert.equal((await t.call('DELETE', `/shop/next-booking/${productId}`, { token: 'tokA' })).status, 200);
    assert.deepEqual((await t.call('GET', '/shop/next-booking', { token: 'tokA' })).json, []);
  });
  test('is applied to the booking when the handoff links it, then cleared', async () => {
    await t.call('POST', '/shop/next-booking', { token: 'tokA', body: { productId: linkedProductId, quantity: 2 } });
    const { applyNextBookingProducts } = await import('../_shared/extras.ts');
    t.urable.jobs.push(job('xj8') as never);
    assert.equal(await applyNextBookingProducts(t.deps, userA, t.urable.jobs.find((x) => x.id === 'xj8') as never), 1);
    assert.ok(t.urable.calls.includes('line:xj8:uTowel:2'));
    assert.deepEqual((await t.call('GET', '/shop/next-booking', { token: 'tokA' })).json, []);
  });
  test('a paid or finished booking never receives the list', async () => {
    await t.call('POST', '/shop/next-booking', { token: 'tokA', body: { productId } });
    const { applyNextBookingProducts } = await import('../_shared/extras.ts');
    assert.equal(await applyNextBookingProducts(t.deps, userA, t.urable.jobs.find((x) => x.id === 'xj3') as never), 0);
    assert.equal((await t.call('GET', '/shop/next-booking', { token: 'tokA' })).json.length, 1);
  });
});
void userB;
