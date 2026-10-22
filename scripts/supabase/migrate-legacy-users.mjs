// Link legacy customers (bcrypt password in `users`) to Supabase Auth identities WITHOUT touching
// their app ids or Urable links. Passwords are never copied: each customer sets a new one through
// the normal "Forgot password" email. Dry run by default; prints counts only, never emails.
//   node scripts/supabase/migrate-legacy-users.mjs                   # dry run
//   node scripts/supabase/migrate-legacy-users.mjs --apply --limit 1 # first, one account
//   node scripts/supabase/migrate-legacy-users.mjs --apply --invite  # also email each a reset link
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
const args = process.argv.slice(2);
const apply = args.includes('--apply'), invite = args.includes('--invite');
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
if (invite && !SUPABASE_PUBLISHABLE_KEY) throw new Error('--invite also needs SUPABASE_PUBLISHABLE_KEY.');
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const mailer = invite ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } }) : null;

const { data: users, error } = await admin.from('users').select('id,email,name,phone').is('auth_user_id', null).is('deleted_at', null).order('created_at').limit(Number.isFinite(limit) ? limit : 10000);
if (error) throw new Error('Could not read users: ' + error.code);
console.log(`${users.length} legacy customer(s) without a Supabase identity.${apply ? '' : ' (dry run: nothing changed)'}`);
let linked = 0, failed = 0, invited = 0;
if (apply) for (const u of users) {
  // email_confirm: the address was already verified by the shop's old signup flow; no password is set.
  const created = await admin.auth.admin.createUser({ email: u.email, email_confirm: true, user_metadata: { name: u.name, phone: u.phone } });
  if (created.error) { failed++; continue; }
  const { error: linkError } = await admin.from('users').update({ auth_user_id: created.data.user.id }).eq('id', u.id).is('auth_user_id', null);
  if (linkError) { failed++; await admin.auth.admin.deleteUser(created.data.user.id); continue; }
  linked++;
  if (mailer && !(await mailer.auth.resetPasswordForEmail(u.email, { redirectTo: 'soflosuds://reset' })).error) invited++;
}
if (apply) console.log(`linked=${linked} failed=${failed} reset-emails=${invited}`);
