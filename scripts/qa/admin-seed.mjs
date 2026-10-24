// Seeds (or removes) one TEST customer with a completed unpaid Urable job, a review and a reward redemption,
// so the admin UI can be exercised end to end. Usage: node ... admin-seed.mjs seed|cleanup <state.json>
// Env: SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY URABLE_API_KEY. Never pays anything.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
const { SUPABASE_URL: U, SUPABASE_PUBLISHABLE_KEY: K, SUPABASE_SERVICE_ROLE_KEY: S, URABLE_API_KEY: UK } = process.env;
const [mode, stateFile] = process.argv.slice(2);
const API = `${U}/functions/v1/soflo-api`, URABLE = 'https://app.urable.com/api/v1';
const admin = createClient(U, S, { auth: { persistSession: false } });
const anon = createClient(U, K, { auth: { persistSession: false } });
const urable = async (m, p, b) => (await fetch(URABLE + p, { method: m, headers: { authorization: 'Bearer ' + UK, 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })).json();
const call = async (t, m, p, b) => { const r = await fetch(API + p, { method: m, headers: { apikey: K, authorization: 'Bearer ' + t, ...(b ? { 'content-type': 'application/json' } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, json: await r.json().catch(() => null) }; };

if (mode === 'seed') {
  const email = `adminqa.${Date.now()}@example.com`, password = 'Test-Pass-' + Math.random().toString(36).slice(2, 10) + 'Aa1!';
  const { data: au } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: 'TEST Admin QA Customer', phone: '+13055550177' } });
  const { data: sess } = await anon.auth.signInWithPassword({ email, password }); const tok = sess.session.access_token;
  const me = await call(tok, 'POST', '/me/complete', {});
  const { data: u } = await admin.from('users').select('id, urable_customer_id').eq('id', me.json.id).single();
  const veh = await call(tok, 'POST', '/vehicles', { make: 'TEST', model: 'Coupe', year: 2022, color: 'Black' });
  const services = (await call(tok, 'GET', '/services')).json; const svc = services.filter((s) => s.priceCents > 0 && /ceramic|coating|tint|film/i.test(s.name + s.category)).sort((a, b) => a.priceCents - b.priceCents)[0] ?? services.filter((s) => s.priceCents > 0)[0];
  const start = Date.now() + 500 * 86400000;
  const job = await urable('POST', '/jobs', { customerId: u.urable_customer_id, industry: 'vehicleCare', itemIds: [veh.json.id], lineItems: [{ productServiceId: svc.id, quantity: 1 }], type: 'shop', status: 'scheduled', start, end: start + 3600000, notes: 'TEST - please ignore (automated QA)' });
  const jobId = job.data.id;
  const done = await urable('PATCH', '/jobs/' + jobId, { status: 'completed', completedAt: Date.now() });
  await admin.from('reviews').insert({ user_id: u.id, urable_job_id: jobId, rating: 5, body: 'TEST review for admin moderation' });
  const { data: rw } = await admin.from('rewards').insert({ name: 'TEST Admin QA Reward', points_cost: 5, active: true }).select('id').single();
  await admin.from('points_ledger').insert({ user_id: u.id, delta: 10, reason: 'admin_adjust', source_key: 'adminqa-' + Date.now() });
  const rd = await call(tok, 'POST', `/rewards/${rw.id}/redeem`);
  writeFileSync(stateFile, JSON.stringify({ authId: au.user.id, userId: u.id, urableCustomerId: u.urable_customer_id, vehicleId: veh.json.id, jobId, rewardId: rw.id, email, service: svc.name, jobStatus: done?.data?.status, redemption: rd.status }));
  console.log(JSON.stringify({ email, name: 'TEST Admin QA Customer', jobId, vehicleId: veh.json.id, service: svc.name, jobStatus: done?.data?.status, redemption: rd.status }));
} else if (mode === 'cleanup') {
  const s = JSON.parse(readFileSync(stateFile, 'utf8'));
  await urable('PATCH', '/jobs/' + s.jobId, { status: 'canceled', canceledAt: Date.now() }).catch(() => {});
  await admin.from('warranties').delete().eq('urable_customer_id', s.urableCustomerId);
  for (const t of ['booking_handoffs', 'job_sync', 'points_ledger', 'reward_redemptions', 'reviews', 'push_tokens']) await admin.from(t).delete().eq('user_id', s.userId);
  await admin.from('referrals').delete().or(`referrer_id.eq.${s.userId},referee_id.eq.${s.userId}`);
  await admin.from('users').delete().eq('id', s.userId);
  await admin.from('rewards').delete().eq('id', s.rewardId);
  await admin.auth.admin.deleteUser(s.authId).catch(() => {});
  console.log('cleaned');
}
