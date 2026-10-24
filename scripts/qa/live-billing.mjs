// Live check of the points and referral rules (handbook 4.5 / 4.6) on the real database, with throw-away TEST users that
// never touch Urable. Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and the Management API token (SUPABASE_PAT).
import { createClient } from '@supabase/supabase-js';
const { SUPABASE_URL: U, SUPABASE_SERVICE_ROLE_KEY: S, SUPABASE_PAT: PAT } = process.env;
const ref = new URL(U).hostname.split('.')[0];
const sql = async (query) => { const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: 'Bearer ' + PAT, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) }); const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j)); return j; };
const admin = createClient(U, S, { auth: { persistSession: false } });
const tag = Date.now().toString(36); const results = []; const authIds = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  — ' + detail : '')); };

async function mk(label, { referrer, device, phone }) {
  const email = `qa-billing-${tag}-${label}@example.com`;
  const { data } = await admin.auth.admin.createUser({ email, password: 'Test-Pass-' + tag + 'Aa1!', email_confirm: true }); authIds.push(data.user.id);
  const [{ id }] = await sql(`SELECT soflo_private.complete_profile('${data.user.id}', '${email}', 'TEST Billing ${label}', '${phone}', 'qa-live-${tag}-${label}', ${referrer ? `'${referrer.code}'` : 'NULL'}) AS id`);
  if (device) await sql(`UPDATE users SET device_id = '${device}' WHERE id = '${id}'`);
  const [{ referral_code }] = await sql(`SELECT referral_code FROM users WHERE id = '${id}'`);
  return { id, code: referral_code };
}
const job = (u, id, status, pay, cents, fp = null) => sql(`SELECT soflo_private.record_job('${u}', '${id}', 'v1', '${status}', '${pay}', now(), ${cents}${fp ? `, '${fp}'` : ''}) AS r`).then((x) => x[0].r);
const bal = async (u) => (await sql(`SELECT COALESCE(sum(delta),0)::int AS b FROM points_ledger WHERE user_id = '${u}'`))[0].b;
const ref_ = async (u) => (await sql(`SELECT status, reject_reason FROM referrals WHERE referee_id = '${u}'`))[0];

try {
  // --- device ---
  const a = await mk('a', { phone: '+19995551001', device: `install-${tag}-1` });
  const b = await mk('b', { referrer: a, phone: '+19995551002', device: `install-${tag}-1` });
  await job(b.id, `qa-${tag}-d1`, 'completed', 'paid', 10000);
  check('referral from the same device is rejected', (await ref_(b.id))?.reject_reason === 'duplicate_device', JSON.stringify(await ref_(b.id)));
  check('...and the referrer gets no bonus', (await bal(a.id)) === 0);
  // --- card ---
  const c = await mk('c', { phone: '+19995551003', device: `install-${tag}-3` });
  const d = await mk('d', { referrer: c, phone: '+19995551004', device: `install-${tag}-4` });
  await job(c.id, `qa-${tag}-c1`, 'completed', 'paid', 10000, `fp-${tag}`);
  await job(d.id, `qa-${tag}-c2`, 'completed', 'paid', 10000, `fp-${tag}`);
  check('referral paid with the same card is rejected', (await ref_(d.id))?.reject_reason === 'duplicate_payment', JSON.stringify(await ref_(d.id)));
  // --- clean referral rewarded ---
  const e = await mk('e', { phone: '+19995551005', device: `install-${tag}-5` });
  const f = await mk('f', { referrer: e, phone: '+19995551006', device: `install-${tag}-6` });
  await job(f.id, `qa-${tag}-e1`, 'completed', 'paid', 10000, `fp-${tag}-f`);
  check('a genuine referral is rewarded for both', (await ref_(f.id))?.status === 'rewarded' && (await bal(e.id)) === 250 && (await bal(f.id)) === 350, `referrer ${await bal(e.id)}, referee ${await bal(f.id)}`);
  // --- reversal ---
  const earned = await job(a.id, `qa-${tag}-r1`, 'completed', 'paid', 20000);
  check('a paid job credits points once', earned.credited === 200 && (await job(a.id, `qa-${tag}-r1`, 'completed', 'paid', 20000)).credited === 0);
  const before = await bal(a.id);
  check('a refund reverses them once', (await job(a.id, `qa-${tag}-r1`, 'completed', 'partiallyRefunded', 20000)).reversed === 200 && (await bal(a.id)) === before - 200 && (await job(a.id, `qa-${tag}-r1`, 'completed', 'refunded', 20000)).reversed === 200 && (await bal(a.id)) === before - 200);
  await job(a.id, `qa-${tag}-r2`, 'completed', 'paid', 5000);
  check('a cancellation after an award reverses it', (await job(a.id, `qa-${tag}-r2`, 'canceled', 'paid', 5000)).reversed === 50);
  // --- device id header at signup, through the real API ---
  const pub = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY; const email = `qa-billing-${tag}-api@example.com`;
  const { data: au } = await admin.auth.admin.createUser({ email, password: 'Test-Pass-' + tag + 'Aa1!', email_confirm: true, user_metadata: { name: 'TEST Billing API', phone: '+19995551099' } }); authIds.push(au.user.id);
  const anon = createClient(U, pub, { auth: { persistSession: false } }); const { data: sess } = await anon.auth.signInWithPassword({ email, password: 'Test-Pass-' + tag + 'Aa1!' });
  const r = await fetch(`${U}/functions/v1/soflo-api/me/complete`, { method: 'POST', headers: { apikey: pub, authorization: 'Bearer ' + sess.session.access_token, 'content-type': 'application/json', 'x-device-id': `install-api-${tag}` }, body: '{}' });
  const [stored] = await sql(`SELECT device_id FROM users WHERE auth_user_id = '${au.user.id}'`);
  check('the signup API stores the app install id', r.status === 201 && stored?.device_id === `install-api-${tag}`, `status ${r.status}`);
} finally {
  if (authIds.length) await sql(`UPDATE users SET referred_by = NULL WHERE auth_user_id IN (${authIds.map((i) => `'${i}'`).join(',')})`).catch(() => {});
  for (const id of authIds) {
    await sql(`DO $$ DECLARE u uuid; BEGIN SELECT id INTO u FROM users WHERE auth_user_id = '${id}'; IF u IS NOT NULL THEN
      DELETE FROM points_ledger WHERE user_id = u; DELETE FROM job_sync WHERE user_id = u; DELETE FROM referrals WHERE referrer_id = u OR referee_id = u;
      DELETE FROM push_tokens WHERE user_id = u; UPDATE users SET referred_by = NULL WHERE referred_by = u; DELETE FROM users WHERE id = u; END IF; END $$`).catch((e) => console.log('cleanup:', e.message.slice(0, 120)));
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
