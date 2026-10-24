// Live end-to-end test as a real customer and the owner admin. Creates one clearly named TEST customer,
// one far-future unpaid TEST job (cancelled at the end) and one TEST promo code. Never pays anything.
// Usage (secrets stay in env, never printed): SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY
//   URABLE_API_KEY ADMIN_EMAIL ADMIN_PASSWORD node scripts/qa/live-e2e.mjs
import { createClient } from '@supabase/supabase-js';
const { SUPABASE_URL: U, SUPABASE_PUBLISHABLE_KEY: K, SUPABASE_SERVICE_ROLE_KEY: S, URABLE_API_KEY: UK, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
for (const [n, v] of Object.entries({ U, K, S, UK, ADMIN_EMAIL, ADMIN_PASSWORD })) if (!v) throw new Error('Missing env ' + n);
const API = `${U}/functions/v1/soflo-api`, URABLE = 'https://app.urable.com/api/v1';
const results = []; let failed = 0;
const step = async (name, fn) => { try { const d = await fn(); results.push(['PASS', name, d ?? '']); } catch (e) { failed++; results.push(['FAIL', name, e.message]); } };
const expect = (c, m) => { if (!c) throw new Error(m); };
const call = async (token, method, path, body) => {
  const r = await fetch(API + path, { method, headers: { apikey: K, ...(token ? { authorization: 'Bearer ' + token } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* empty */ }
  return { status: r.status, json };
};
const urable = async (method, path, body) => { const r = await fetch(URABLE + path, { method, headers: { authorization: 'Bearer ' + UK, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };
const admin = createClient(U, S, { auth: { persistSession: false } });
const anon = createClient(U, K, { auth: { persistSession: false } });
const email = `e2e.${Date.now()}@example.com`, password = 'Test-Pass-' + Math.random().toString(36).slice(2, 10) + 'Aa1!';
let attemptId, dupJobId, tok, adminTok, authId, userId, jobId, promoId, vehicleId, services, rewardId, noteProductId, lineProductId;

await step('create confirmed TEST auth user (stands in for the email-link click)', async () => {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: 'TEST Markhor E2E', phone: '+13055550142' } });
  expect(!error, error?.message); authId = data.user.id;
});
await step('sign in with password', async () => { const { data, error } = await anon.auth.signInWithPassword({ email, password }); expect(!error, error?.message); tok = data.session.access_token; });
await step('wrong password is rejected', async () => { const { error } = await createClient(U, K, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password: 'nope-nope-nope' }); expect(error, 'should fail'); });
await step('/me before profile → PROFILE_INCOMPLETE', async () => { const r = await call(tok, 'GET', '/me'); expect(r.json?.error?.code === 'PROFILE_INCOMPLETE', JSON.stringify(r)); });
await step('/me/complete creates the REAL Urable customer + app profile', async () => {
  const r = await call(tok, 'POST', '/me/complete', {}); expect(r.status === 201 || r.status === 200, JSON.stringify(r)); userId = r.json.id;
  const { data } = await admin.from('users').select('urable_customer_id, referral_code').eq('id', userId).single();
  expect(data.urable_customer_id && !data.urable_customer_id.startsWith('placeholder'), 'no Urable id'); return `urable customer ${data.urable_customer_id.slice(0, 6)}…, referral ${data.referral_code}`;
});
await step('/me/complete again is idempotent (no second Urable customer)', async () => { const r = await call(tok, 'POST', '/me/complete', {}); expect(r.status === 200 && r.json.id === userId, JSON.stringify(r)); });
await step('/me', async () => { const r = await call(tok, 'GET', '/me'); expect(r.status === 200 && r.json.email === email, JSON.stringify(r)); });
await step('services come from Urable', async () => { const r = await call(tok, 'GET', '/services'); expect(r.status === 200 && Array.isArray(r.json) && r.json.length > 10, 'few services'); services = r.json; return r.json.length + ' services'; });
await step('add a vehicle (Urable)', async () => { const r = await call(tok, 'POST', '/vehicles', { make: 'TEST', model: 'Car', year: 2020, color: 'Blue' }); expect(r.status === 201 || r.status === 200, JSON.stringify(r)); vehicleId = r.json.id; });
await step('vehicle appears, edit it', async () => { let r = await call(tok, 'GET', '/vehicles'); expect(r.json.some((v) => v.id === vehicleId), 'missing'); r = await call(tok, 'PATCH', '/vehicles/' + vehicleId, { make: 'TEST', model: 'Car Two', year: 2021, color: 'Red' }); expect(r.status === 200, JSON.stringify(r)); });
await step('rewards, points, referral, gallery, protection, shop, payments, reviews all respond', async () => {
  for (const p of ['/rewards', '/me/points', '/me/referral', '/gallery', '/protection', '/shop/products', '/payments', '/reviews', '/bookings', '/bookings/handoff/latest']) { const r = await call(tok, 'GET', p); expect([200, 404].includes(r.status), p + ' → ' + r.status + JSON.stringify(r.json)); }
});
await step('notification preferences save', async () => { const r = await call(tok, 'PATCH', '/me', { notificationPromos: false }); expect(r.status === 200 && r.json.notificationPromos === false, JSON.stringify(r)); });
await step('public shop_config readable by the anon key', async () => { const { error } = await anon.rpc('shop_config'); expect(!error, error?.message); });
await step('RLS: the app key cannot read other tables', async () => { const { error } = await createClient(U, K).from('promo_codes').select('*').limit(1); expect(error, 'anon read allowed'); });
await step('customer is blocked from admin routes', async () => { expect((await call(tok, 'GET', '/admin/dashboard')).status === 401, 'not blocked'); });
await step('start a booking handoff (snapshot of existing jobs)', async () => { const r = await call(tok, 'POST', '/bookings/handoff'); expect(r.status === 201 || r.status === 200, JSON.stringify(r)); attemptId = r.json.attemptId; });

await step('ADMIN signs in and sees the dashboard', async () => { const { data, error } = await createClient(U, K, { auth: { persistSession: false } }).auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }); expect(!error, error?.message); adminTok = data.session.access_token; const r = await call(adminTok, 'GET', '/admin/dashboard'); expect(r.status === 200, JSON.stringify(r)); });
await step('ADMIN creates a TEST promo (10%)', async () => { const code = 'TESTE2E' + Math.floor(Math.random() * 1e4); const r = await call(adminTok, 'POST', '/admin/promos', { code, kind: 'percent', value: 10 }); expect(r.status === 201 || r.status === 200, JSON.stringify(r)); promoId = r.json.id; process.env.E2E_CODE = code; });
await step('ADMIN setting change reaches the public config (maintenance on then off)', async () => {
  let r = await call(adminTok, 'PUT', '/admin/settings', { maintenance_message: 'QA test' }); expect(r.status === 200, JSON.stringify(r));
  let c = await anon.rpc('shop_config'); expect(c.data.maintenance_message === 'QA test', 'not visible');
  r = await call(adminTok, 'PUT', '/admin/settings', { maintenance_message: '' }); c = await anon.rpc('shop_config'); expect(!c.data.maintenance_message, 'still on');
});

await step('create a far-future unpaid TEST job in Urable (stands in for the virtual-shop checkout)', async () => {
  const { data: u } = await admin.from('users').select('urable_customer_id').eq('id', userId).single();
  const svc = services.filter((s) => s.priceCents > 0).sort((a, b) => a.priceCents - b.priceCents)[0];
  const start = Date.now() + 400 * 86400000;
  const r = await urable('POST', '/jobs', { customerId: u.urable_customer_id, industry: 'vehicleCare', itemIds: [vehicleId], lineItems: [{ productServiceId: svc.id, quantity: 1 }], type: 'shop', status: 'scheduled', start, end: start + 3600000, notes: 'TEST - please ignore (automated QA)' });
  expect(r.status === 200 && r.json?.success, JSON.stringify(r)); jobId = r.json.data.id; return `${svc.name} $${(svc.priceCents / 100).toFixed(2)}`;
});
await step('job shows in My bookings as scheduled/unpaid', async () => { const r = await call(tok, 'GET', '/bookings'); const b = r.json.find((x) => x.id === jobId); expect(b && b.status === 'scheduled', JSON.stringify(r.json).slice(0, 300)); return `status ${b.status}, payment ${b.paymentStatus}`; });
await step('ADMIN creates TEST shop products (one note-only, one linked to a real Urable service) and a TEST reward', async () => {
  let r = await call(adminTok, 'POST', '/admin/shop-products', { name: 'TEST Spray Wax', priceCents: 1999 }); expect(r.status === 201, JSON.stringify(r)); noteProductId = r.json.id;
  const cheap = services.filter((x) => x.priceCents > 0).sort((a, b) => a.priceCents - b.priceCents)[1];
  r = await call(adminTok, 'POST', '/admin/shop-products', { name: 'TEST Linked Item', priceCents: cheap.priceCents, urableProductId: cheap.id }); expect(r.status === 201, JSON.stringify(r)); lineProductId = r.json.id;
  r = await call(adminTok, 'POST', '/admin/rewards', { name: 'TEST Free Interior Refresh', pointsCost: 5 }); expect(r.status === 201, JSON.stringify(r)); rewardId = r.json.id;
  return 'cheap linked service $' + (cheap.priceCents / 100).toFixed(2);
});
await step('Shop: customer sees the products and saves one for the NEXT booking', async () => {
  const list = await call(tok, 'GET', '/shop/products'); expect(list.json.some((x) => x.id === noteProductId), 'product missing from shop');
  let r = await call(tok, 'POST', '/shop/next-booking', { productId: noteProductId, quantity: 2 }); expect(r.status === 201, JSON.stringify(r));
  r = await call(tok, 'GET', '/shop/next-booking'); expect(r.json.length === 1 && r.json[0].quantity === 2, JSON.stringify(r.json));
});
await step('virtual-shop checkout simulated: duplicate Urable customer + job → handoff links it to the right user', async () => {
  const fresh = await call(tok, 'POST', '/bookings/handoff'); expect(fresh.status === 201, JSON.stringify(fresh)); attemptId = fresh.json.attemptId; // a new checkout starts a new attempt
  const dc = await urable('POST', '/customers', { firstName: 'TEST', lastName: 'Markhor E2E dup', emails: [{ label: 'Email', value: email }], origin: 'QA virtual shop simulation' });
  expect(dc.json?.success, JSON.stringify(dc)); const dupId = dc.json.data.id;
  const dv = await urable('POST', '/items', { customerId: dupId, industry: 'vehicleCare', type: 'automotive', name: 'TEST Dup Car' }); expect(dv.json?.success, JSON.stringify(dv));
  const svc = services.filter((x) => x.priceCents > 0).sort((a, b) => a.priceCents - b.priceCents)[0]; const start = Date.now() + 401 * 86400000;
  const dj = await urable('POST', '/jobs', { customerId: dupId, industry: 'vehicleCare', itemIds: [dv.json.data.id], lineItems: [{ productServiceId: svc.id, quantity: 1 }], type: 'shop', status: 'scheduled', start, end: start + 3600000, notes: 'TEST - please ignore (automated QA)' });
  expect(dj.json?.success, JSON.stringify(dj)); dupJobId = dj.json.data.id;
  const r = await call(tok, 'GET', '/bookings/handoff/' + attemptId); expect(r.status === 200 && r.json.state === 'matched' && r.json.booking.id === dupJobId, JSON.stringify(r.json).slice(0, 300));
  return `matched ${r.json.booking.status}/${r.json.booking.paymentStatus}`;
});
await step('the saved "next booking" product was added to the matched booking and the list cleared', async () => {
  const j = (await urable('GET', '/jobs/' + dupJobId)).json.data; expect(/SOFLO SHOP PRODUCT: TEST Spray Wax x2/.test(j.notes ?? ''), 'note missing: ' + (j.notes ?? '').slice(0, 200));
  const r = await call(tok, 'GET', '/shop/next-booking'); expect(r.json.length === 0, 'list not cleared');
  const d = await call(tok, 'GET', '/bookings/' + dupJobId); expect(d.json.products?.[0]?.name === 'TEST Spray Wax', JSON.stringify(d.json).slice(0, 300));
});
await step('another customer cannot see it', async () => { const e2 = `e2e.b.${Date.now()}@example.com`; const { data } = await admin.auth.admin.createUser({ email: e2, password, email_confirm: true, user_metadata: { name: 'TEST Other' } }); const s = await createClient(U, K, { auth: { persistSession: false } }).auth.signInWithPassword({ email: e2, password }); const r = await call(s.data.session.access_token, 'GET', '/bookings/' + jobId); expect(r.status === 401 || r.status === 404, 'status ' + r.status); await admin.auth.admin.deleteUser(data.user.id); });
await step('REAL promo applied to the Urable invoice (10% off)', async () => {
  const before = (await urable('GET', '/jobs/' + jobId)).json.data.invoice;
  const r = await call(tok, 'POST', `/bookings/${jobId}/promo`, { code: process.env.E2E_CODE }); expect(r.status === 200, JSON.stringify(r));
  const after = (await urable('GET', '/jobs/' + jobId)).json.data.invoice;
  expect(after.total < before.total, `total unchanged: ${before.total} → ${after.total}`);
  return `subtotal ${before.subtotal} → total ${after.total} (reported discount ${r.json.discountCents})`;
});
await step('a second code on the same booking is refused', async () => { const r = await call(tok, 'POST', `/bookings/${jobId}/promo`, { code: process.env.E2E_CODE }); expect(r.json?.error?.code === 'PROMO_ALREADY_USED', JSON.stringify(r)); });
await step('REAL reward: points → redeem → attach to the Urable booking (shop sees it in the job notes)', async () => {
  await admin.from('points_ledger').insert({ user_id: userId, delta: 10, reason: 'admin_adjust', source_key: 'e2e-' + Date.now() });
  const rd = await call(tok, 'POST', `/rewards/${rewardId}/redeem`); expect(rd.status === 200 || rd.status === 201, JSON.stringify(rd));
  const at = await call(tok, 'POST', `/bookings/${jobId}/reward`, { redemptionId: rd.json.id }); expect(at.status === 200, JSON.stringify(at));
  const j = (await urable('GET', '/jobs/' + jobId)).json.data; expect((j.notes ?? '').includes('SOFLO REWARD ' + rd.json.code), 'note missing: ' + (j.notes ?? '').slice(0, 200));
  const d = await call(tok, 'GET', '/bookings/' + jobId); expect(d.json.reward?.code === rd.json.code, 'detail missing reward');
  const again = await call(tok, 'POST', `/bookings/${jobId}/reward`, { redemptionId: rd.json.id }); expect(again.status === 409, 'second attach allowed: ' + again.status);
  const adm = await call(adminTok, 'GET', '/admin/redemptions'); expect(adm.json.some((x) => x.code === rd.json.code && x.appliedJobId === jobId), 'admin cannot see the booking');
});
await step('REAL product (note-only) added to the booking → job notes updated', async () => {
  const r = await call(tok, 'POST', `/bookings/${jobId}/products`, { productId: noteProductId, quantity: 1 }); expect(r.status === 201 && r.json.asLineItem === false, JSON.stringify(r));
  const j = (await urable('GET', '/jobs/' + jobId)).json.data; expect(/SOFLO SHOP PRODUCT: TEST Spray Wax x1/.test(j.notes ?? ''), 'note missing');
});
await step('REAL product linked to Urable → becomes an invoice line and keeps the promo discount', async () => {
  const before = (await urable('GET', '/jobs/' + jobId)).json.data.invoice;
  const r = await call(tok, 'POST', `/bookings/${jobId}/products`, { productId: lineProductId }); expect(r.status === 201 && r.json.asLineItem === true, JSON.stringify(r));
  const after = (await urable('GET', '/jobs/' + jobId)).json.data.invoice;
  expect(after.subtotal > before.subtotal, `subtotal not increased ${before.subtotal} → ${after.subtotal}`);
  expect((after.adjustments?.length ?? 0) >= (before.adjustments?.length ?? 0) && after.total < after.subtotal, 'discount lost: ' + JSON.stringify({ before, after }).slice(0, 300));
  return `subtotal ${before.subtotal} → ${after.subtotal}, total ${before.total} → ${after.total}`;
});
await step('cancel the booking through the app; Urable shows canceled; promo released', async () => {
  const r = await call(tok, 'POST', `/bookings/${jobId}/cancel`); expect(r.status === 200, JSON.stringify(r));
  const j = (await urable('GET', '/jobs/' + jobId)).json.data; expect(['canceled', 'cancelled'].includes(j.status), 'Urable status ' + j.status);
  const { data } = await admin.from('promo_uses').select('status').eq('urable_job_id', jobId); expect(data.every((x) => x.status === 'released'), JSON.stringify(data));
  const { data: rr } = await admin.from('reward_redemptions').select('applied_job_id').eq('user_id', userId); expect(rr.every((x) => x.applied_job_id === null), 'reward still attached after cancel');
});
await step('delete account → profile gone, token dead', async () => { const r = await call(tok, 'DELETE', '/me'); expect(r.status === 200 || r.status === 204, JSON.stringify(r)); await new Promise((x) => setTimeout(x, 1500)); const m = await call(tok, 'GET', '/me'); expect(m.status === 401, 'token still works: ' + m.status); });

// cleanup (best effort, always runs)
if (dupJobId) await urable('PATCH', '/jobs/' + dupJobId, { status: 'canceled', canceledAt: Date.now() }).catch(() => {});
if (jobId) await urable('PATCH', '/jobs/' + jobId, { status: 'canceled', canceledAt: Date.now() }).catch(() => {});
if (promoId) { await admin.from('promo_uses').delete().eq('promo_id', promoId); await admin.from('promo_codes').delete().eq('id', promoId); }
await admin.from('promo_attempts').delete().eq('user_id', userId ?? '00000000-0000-0000-0000-000000000000');
await admin.from('settings').delete().eq('key', 'maintenance_message');
if (userId) { for (const t of ['booking_handoffs', 'job_sync', 'points_ledger', 'reward_redemptions', 'booking_products', 'next_booking_products', 'reviews', 'push_tokens']) await admin.from(t).delete().eq('user_id', userId); await admin.from('referrals').delete().or(`referrer_id.eq.${userId},referee_id.eq.${userId}`); await admin.from('users').delete().eq('id', userId); }
if (rewardId) await admin.from('rewards').delete().eq('id', rewardId);
for (const id of [noteProductId, lineProductId]) if (id) await admin.from('shop_products').delete().eq('id', id);
if (authId) await admin.auth.admin.deleteUser(authId).catch(() => {});
for (const [s, n, d] of results) console.log(`${s}  ${n}${d ? '  — ' + d : ''}`);
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
