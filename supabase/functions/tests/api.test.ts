import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { A, B, ORIGIN, identities, ids, setup } from './helpers.ts';

let t: Awaited<ReturnType<typeof setup>>;
before(async () => { t = await setup(); });
after(async () => { await t.stop(); });

const customerGets = ['/me', '/me/points', '/me/referral', '/services', '/services/s1', '/vehicles', '/bookings', '/bookings/handoff/latest', '/bookings/jobA', '/payments', '/rewards', '/protection', '/shop/products', '/gallery', '/reviews'];

describe('authentication boundary', () => {
  test('every customer route rejects missing and unknown tokens', async () => {
    for (const path of customerGets) {
      assert.equal((await t.call('GET', path)).status, 401, path);
      assert.equal((await t.call('GET', path, { token: 'forged' })).status, 401, path);
    }
    for (const [m, p] of [['POST', '/vehicles'], ['PATCH', '/me'], ['DELETE', '/me'], ['PUT', '/me/push-token'], ['POST', '/rewards/aaaa1111-0000-4000-8000-000000000001/redeem'], ['POST', '/bookings/jobA/cancel'], ['POST', '/bookings/jobA/review']]) {
      assert.equal((await t.call(m, p, { body: {} })).status, 401, `${m} ${p}`);
    }
  });
  test('an admin-only identity without a customer profile is not a customer', async () => {
    const r = await t.call('GET', '/me', { token: 'tokAdmin' });
    assert.equal(r.status, 401); assert.equal(r.json.error.code, 'PROFILE_INCOMPLETE');
  });
  test('a deleted customer is rejected even with a still-valid token', async () => {
    assert.equal((await t.call('GET', '/me', { token: 'tokDeleted' })).status, 401);
  });
  test('unknown routes 404, wrong verbs 405, errors keep the {error:{code,message}} shape', async () => {
    const nf = await t.call('GET', '/nope', { token: 'tokA' });
    assert.equal(nf.status, 404); assert.equal(typeof nf.json.error.message, 'string');
    assert.equal((await t.call('PUT', '/vehicles', { token: 'tokA' })).status, 405);
  });
});

describe('customer data is scoped to the caller', () => {
  test('/me and vehicles', async () => {
    const me = await t.call('GET', '/me', { token: 'tokA' });
    assert.equal(me.json.name, 'Alice'); assert.equal(me.json.points, 500);
    assert.equal('urableCustomerId' in me.json, false); assert.equal('password_hash' in me.json, false);
    const v = await t.call('GET', '/vehicles', { token: 'tokA' });
    assert.deepEqual(v.json.map((x: { id: string }) => x.id), ['vA']);
    assert.equal(v.json[0].color, 'Blue');
  });
  test("A cannot edit or delete B's vehicle by guessing its id", async () => {
    const body = { make: 'X', model: 'Y', year: 2020, color: 'Red' };
    assert.equal((await t.call('PATCH', '/vehicles/vB', { token: 'tokA', body })).status, 404);
    assert.equal((await t.call('DELETE', '/vehicles/vB', { token: 'tokA' })).status, 404);
    assert.equal(t.urable.calls.some((c) => c.endsWith(':vB')), false);
  });
  test('vehicle create is bound to the caller’s Urable customer, ignoring body ids', async () => {
    const r = await t.call('POST', '/vehicles', { token: 'tokA', body: { make: 'Honda', model: 'Fit', year: 2021, color: 'Gray', customerId: 'uB' } });
    assert.equal(r.status, 201); assert.ok(t.urable.calls.includes('createVehicle:uA'));
  });
  test('vehicle delete is blocked while it has an active booking', async () => {
    t.urable.jobs.push({ id: 'jobAFuture', customerRef: 'uA', itemRefs: ['vA'], status: 'scheduled' });
    const r = await t.call('DELETE', '/vehicles/vA', { token: 'tokA' });
    assert.equal(r.status, 409); assert.equal(r.json.error.code, 'VEHICLE_HAS_BOOKING');
    t.urable.jobs = t.urable.jobs.filter((j) => j.id !== 'jobAFuture');
  });
  test('bookings list excludes foreign jobs even if Urable returns them', async () => {
    const r = await t.call('GET', '/bookings', { token: 'tokA' });
    assert.deepEqual(r.json.map((b: { id: string }) => b.id), ['jobA']);
  });
  test("A cannot read, cancel or review B's booking", async () => {
    assert.equal((await t.call('GET', '/bookings/jobB', { token: 'tokA' })).status, 404);
    assert.equal((await t.call('POST', '/bookings/jobB/cancel', { token: 'tokA' })).status, 404);
    assert.equal((await t.call('POST', '/bookings/jobB/review', { token: 'tokA', body: { rating: 5 } })).status, 404);
    assert.equal((await t.call('GET', '/bookings/missing', { token: 'tokA' })).status, 404);
    assert.equal(t.urable.calls.includes('cancelJob:jobB'), false);
  });
  test('owner can cancel an open booking but not a completed one', async () => {
    assert.equal((await t.call('POST', '/bookings/jobB/cancel', { token: 'tokB' })).status, 200);
    assert.ok(t.urable.calls.includes('cancelJob:jobB'));
    assert.equal((await t.call('POST', '/bookings/jobA/cancel', { token: 'tokA' })).json.error.code, 'CANCEL_NOT_ALLOWED');
  });
  test('payments only include the caller’s', async () => {
    assert.deepEqual((await t.call('GET', '/payments', { token: 'tokA' })).json.map((p: { id: string }) => p.id), ['p1']);
  });
  test('reviews: completed own job once, sanitized; incomplete rejected', async () => {
    const ok = await t.call('POST', '/bookings/jobA/review', { token: 'tokA', body: { rating: 5, body: 'Great <b>job</b>' } });
    assert.equal(ok.status, 201);
    assert.equal((await t.call('POST', '/bookings/jobA/review', { token: 'tokA', body: { rating: 4 } })).json.error.code, 'REVIEW_EXISTS');
    assert.equal((await t.call('POST', '/bookings/jobB/review', { token: 'tokB', body: { rating: 4 } })).json.error.code, 'REVIEW_NOT_ALLOWED');
    assert.equal((await t.call('POST', '/bookings/jobA/review', { token: 'tokA', body: { rating: 9 } })).json.error.code, 'VALIDATION_FAILED');
    const list = await t.call('GET', '/reviews', { token: 'tokB' });
    assert.equal(list.json[0].body, 'Great job'); assert.equal(list.json[0].customerName, 'Alice');
  });
  test('rewards: summary, redemption, insufficient points, unknown reward', async () => {
    const s = await t.call('GET', '/rewards', { token: 'tokA' });
    assert.equal(s.json.points, 500); assert.equal(s.json.rewards.length, 1); assert.equal(s.json.referralCode, 'AAAAAA');
    const R = 'aaaa1111-0000-4000-8000-000000000001';
    const r1 = await t.call('POST', `/rewards/${R}/redeem`, { token: 'tokA' });
    assert.equal(r1.status, 200); assert.equal(r1.json.rewardName, 'Free wash');
    assert.equal((await t.call('GET', '/me/points', { token: 'tokA' })).json.points, 300);
    assert.equal((await t.call('POST', `/rewards/${R}/redeem`, { token: 'tokA' })).status, 200);
    const short = await t.call('POST', `/rewards/${R}/redeem`, { token: 'tokA' });
    assert.deepEqual([short.status, short.json.error.code], [409, 'INSUFFICIENT_POINTS']);
    assert.equal((await t.call('POST', '/rewards/aaaa1111-0000-4000-8000-0000000000ff/redeem', { token: 'tokA' })).status, 404);
    assert.equal((await t.call('GET', '/me/points', { token: 'tokA' })).json.points, 100);
  });
  test('protection returns only the caller’s vehicles', async () => {
    assert.equal((await t.call('GET', '/protection?vehicleId=vB', { token: 'tokA' })).json.length, 0);
  });
});

describe('profile', () => {
  test('PATCH /me updates allowed fields and ignores protected ones', async () => {
    const r = await t.call('PATCH', '/me', { token: 'tokB', body: { name: 'Robert', notificationPromos: true, urableCustomerId: 'uA', referralCode: 'HACK', authUserId: ids.authA, points: 9e9 } });
    assert.equal(r.status, 200); assert.equal(r.json.name, 'Robert');
    const [row] = await t.sql`SELECT urable_customer_id, referral_code, auth_user_id FROM users WHERE id = ${B}`;
    assert.deepEqual([row.urable_customer_id, row.referral_code, row.auth_user_id], ['uB', 'BBBBBB', ids.authB]);
  });
  test('push token is bound to the verified caller', async () => {
    const token = 'ExponentPushToken[abcdefghijklmnopqrstuv]';
    assert.equal((await t.call('PUT', '/me/push-token', { token: 'tokB', body: { token, platform: 'ios', userId: A } })).status, 200);
    const [row] = await t.sql`SELECT user_id FROM push_tokens WHERE token = ${token}`;
    assert.equal(row.user_id, B);
  });
});

describe('POST /me/complete (signup recovery)', () => {
  const newAuth = '00000000-0000-4000-8000-0000000000e1';
  const tok = 'tokNew';
  before(async () => {
    await t.sql`INSERT INTO auth.users (id, email) VALUES (${newAuth}, 'fresh@t.test')`;
    identities[tok] = { id: newAuth, email: 'Fresh@T.test', emailConfirmed: false, appMetadata: {}, userMetadata: { name: 'Fresh Person', phone: '5559999', referralCode: 'aaaaaa' } };
  });
  test('bad referral does not touch Urable', async () => {
    identities[tok].userMetadata.referralCode = 'ZZZZZZ';
    const r = await t.call('POST', '/me/complete', { token: tok, body: {} });
    assert.equal(r.json.error.code, 'REFERRAL_INVALID'); assert.equal(t.urable.createdCustomers, 0);
    identities[tok].userMetadata.referralCode = 'aaaaaa';
  });
  test('a failed Urable call can be retried; one Urable customer ends up created, none duplicated', async () => {
    t.urable.failCreateOnce = true;
    assert.equal((await t.call('POST', '/me/complete', { token: tok, body: {} })).status, 500);
    const first = await t.call('POST', '/me/complete', { token: tok, body: {} });
    assert.equal(first.status, 201); assert.equal(first.json.email, 'fresh@t.test');
    const again = await t.call('POST', '/me/complete', { token: tok, body: {} });
    assert.equal(again.status, 200); assert.equal(again.json.id, first.json.id);
    assert.equal(t.urable.createdCustomers, 1);
    assert.equal((await t.sql`SELECT 1 FROM referrals WHERE referee_id = ${first.json.id} AND referrer_id = ${A}`).length, 1);
  });
  test('Urable id is kept in server-only metadata so a DB failure retry reuses it', async () => {
    const other = '00000000-0000-4000-8000-0000000000e2';
    await t.sql`INSERT INTO auth.users (id, email) VALUES (${other}, 'dup@t.test')`;
    identities.tokRetry = { id: other, email: 'dup@t.test', emailConfirmed: true, appMetadata: { urable_customer_id: 'uPrev' }, userMetadata: { name: 'Dup Retry', phone: '5558888' } };
    const before = t.urable.createdCustomers;
    assert.equal((await t.call('POST', '/me/complete', { token: 'tokRetry', body: {} })).status, 201);
    assert.equal(t.urable.createdCustomers, before);
    assert.equal((await t.sql`SELECT urable_customer_id u FROM users WHERE auth_user_id = ${other}`)[0].u, 'uPrev');
  });
  test('an email already used by a legacy (unlinked) account is never auto-linked', async () => {
    await t.sql`INSERT INTO users (urable_customer_id,name,email,phone,referral_code,password_hash) VALUES ('uLeg','Legacy','old@t.test','1','OLDOLD','h')`;
    const a = '00000000-0000-4000-8000-0000000000e3';
    await t.sql`INSERT INTO auth.users (id, email) VALUES (${a}, 'old@t.test')`;
    identities.tokLegacy = { id: a, email: 'old@t.test', emailConfirmed: true, appMetadata: {}, userMetadata: { name: 'Imposter', phone: '5557777' } };
    const r = await t.call('POST', '/me/complete', { token: 'tokLegacy', body: {} });
    assert.equal(r.status, 409); assert.equal(r.json.error.code, 'ACCOUNT_NEEDS_MIGRATION');
    assert.equal((await t.sql`SELECT auth_user_id FROM users WHERE email = 'old@t.test'`)[0].auth_user_id, null);
  });
  test('account deletion anonymizes, removes the Auth identity and cuts the session immediately', async () => {
    const r = await t.call('DELETE', '/me', { token: tok });
    assert.equal(r.status, 200); assert.ok(t.authCalls.includes('delete:' + newAuth));
    assert.equal((await t.call('GET', '/me', { token: tok })).status, 401);
  });
});

describe('admin boundary', () => {
  const adminGets = ['/admin/me', '/admin/dashboard', '/admin/customers?q=al', '/admin/promos', '/admin/rewards', '/admin/redemptions', '/admin/referrals', '/admin/reviews', '/admin/gallery', '/admin/protection', '/admin/shop-products', '/admin/settings', '/admin/push'];
  test('no token / customer token / unknown token are all rejected', async () => {
    for (const p of adminGets) {
      for (const token of [undefined, 'tokA', 'forged']) assert.equal((await t.call('GET', p, { token })).status, 401, `${p} ${token}`);
    }
    assert.equal((await t.call('POST', '/admin/promos', { token: 'tokA', body: {} })).status, 401);
    assert.equal((await t.call('PUT', '/admin/settings', { token: 'tokA', body: { shop_phone: '1' } })).status, 401);
  });
  test('active admin can read everything', async () => {
    for (const p of adminGets) assert.equal((await t.call('GET', p, { token: 'tokAdmin' })).status, 200, p);
  });
  test('deactivating an admin blocks the very next call even with a valid JWT', async () => {
    await t.sql`UPDATE admins SET active = false`;
    assert.equal((await t.call('GET', '/admin/dashboard', { token: 'tokAdmin' })).status, 401);
    await t.sql`UPDATE admins SET active = true`;
    assert.equal((await t.call('GET', '/admin/dashboard', { token: 'tokAdmin' })).status, 200);
  });
  test('mutations validate, write and audit', async () => {
    const bad = await t.call('POST', '/admin/promos', { token: 'tokAdmin', body: { code: 'x', kind: 'percent', value: -1 } });
    assert.equal(bad.json.error.code, 'VALIDATION_FAILED');
    const ok = await t.call('POST', '/admin/promos', { token: 'tokAdmin', body: { code: 'save10', kind: 'percent', value: 10 } });
    assert.equal(ok.status, 201);
    const upd = await t.call('PATCH', `/admin/promos/${ok.json.id}`, { token: 'tokAdmin', body: { code: 'SAVE10', kind: 'fixed', value: 5 } });
    assert.equal(upd.status, 200);
    assert.equal((await t.call('PATCH', '/admin/promos/00000000-0000-4000-8000-0000000000aa', { token: 'tokAdmin', body: { code: 'SAVE11', kind: 'fixed', value: 5 } })).status, 404);
    assert.equal((await t.call('PUT', '/admin/settings', { token: 'tokAdmin', body: { shop_phone: '555-1', bogus: 1 } })).status, 400);
    assert.equal((await t.call('PUT', '/admin/settings', { token: 'tokAdmin', body: { shop_phone: '555-1', points_per_usd: 2 } })).status, 200);
    assert.equal((await t.call('GET', '/admin/settings', { token: 'tokAdmin' })).json.shop_phone, '555-1');
    assert.equal((await t.call('PUT', '/admin/settings', { token: 'tokAdmin', body: { promo_banner_text: '10% off ceramic this week' } })).status, 200);
    assert.equal((await t.call('GET', '/admin/settings', { token: 'tokAdmin' })).json.promo_banner_text, '10% off ceramic this week');
    // a cleared numeric field reverts to the default instead of being stored as 0
    assert.equal((await t.call('PUT', '/admin/settings', { token: 'tokAdmin', body: { points_per_usd: '', cancel_window_hours: '' } })).status, 200);
    const after = (await t.call('GET', '/admin/settings', { token: 'tokAdmin' })).json;
    assert.ok(!('points_per_usd' in after) && !('cancel_window_hours' in after), JSON.stringify(after));
    const audit = await t.sql`SELECT action, entity FROM admin_audit ORDER BY created_at`;
    assert.equal(audit.length, 5); assert.ok(audit.some((a) => a.entity === 'promo' && a.action === 'create'));
  });
  test('customer search escapes wildcard characters', async () => {
    assert.equal((await t.call('GET', '/admin/customers?q=%25%25', { token: 'tokAdmin' })).json.length, 0);
    assert.equal((await t.call('GET', '/admin/customers?q=ali', { token: 'tokAdmin' })).json.length, 1);
  });
  test('warranty must match a completed Urable job for that customer and vehicle', async () => {
    const base = { urableCustomerId: 'uA', urableVehicleId: 'vA', urableJobId: 'jobA', appliedOn: '2026-01-01' };
    assert.equal((await t.call('POST', '/admin/protection', { token: 'tokAdmin', body: { ...base, urableCustomerId: 'uB' } })).status, 400);
    assert.equal((await t.call('POST', '/admin/protection', { token: 'tokAdmin', body: { ...base, urableJobId: 'jobB', urableCustomerId: 'uB', urableVehicleId: 'vB' } })).status, 400);
    assert.equal((await t.call('POST', '/admin/protection', { token: 'tokAdmin', body: base })).status, 201);
  });
  test('gallery upload accepts real images by content, rejects spoofed files', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const good = new FormData(); good.set('file', new File([png], 'x.txt', { type: 'text/plain' }));
    const r = await t.call('POST', '/admin/uploads/gallery', { token: 'tokAdmin', body: good });
    assert.equal(r.status, 201); assert.match(r.json.url, /\.png$/);
    const evil = new FormData(); evil.set('file', new File(['<script>alert(1)</script>'], 'x.png', { type: 'image/png' }));
    assert.equal((await t.call('POST', '/admin/uploads/gallery', { token: 'tokAdmin', body: evil })).status, 400);
    assert.equal((await t.call('POST', '/admin/uploads/gallery', { token: 'tokA', body: good })).status, 401);
  });
  test('CORS only echoes the approved admin origin', async () => {
    const ok = await t.call('OPTIONS', '/admin/dashboard', { headers: { origin: ORIGIN } });
    assert.equal(ok.status, 204); assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
    const bad = await t.call('GET', '/admin/dashboard', { token: 'tokAdmin', headers: { origin: 'https://evil.test' } });
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
  });
  test('promo push: opt-in only and at most one per user per day', async () => {
    await t.sql`UPDATE users SET notification_promos = true WHERE id = ${B}`;
    await t.sql`DELETE FROM push_tokens`; await t.sql`INSERT INTO push_tokens (token,user_id,platform) VALUES ('ExponentPushToken[BBBBBBBBBBBBBBBBBBBB]', ${B}, 'ios')`;
    const body = { title: 'Spring sale', body: 'Ten percent off washes' };
    const first = await t.call('POST', '/admin/push', { token: 'tokAdmin', body });
    assert.deepEqual([first.status, first.json.sent], [202, 1]);
    const second = await t.call('POST', '/admin/push', { token: 'tokAdmin', body });
    assert.equal(second.json.sent, 0);
    assert.equal((await t.call('POST', '/admin/push', { token: 'tokAdmin', body: { ...body, deepLink: 'https://evil.test' } })).status, 400);
  });
});
