// Create (or re-link) an admin: a Supabase Auth user plus its `admins` mapping row.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/supabase/bootstrap-admin.mjs
// The service-role key stays in your shell; it is never printed or written anywhere.
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL and ADMIN_PASSWORD.');
if (ADMIN_PASSWORD.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = ADMIN_EMAIL.trim().toLowerCase();

let authId;
const created = await admin.auth.admin.createUser({ email, password: ADMIN_PASSWORD, email_confirm: true });
if (created.error) {
  // Already exists: find it and reset the password to the one supplied.
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error('Could not list Auth users.');
  const existing = data.users.find((u) => u.email?.toLowerCase() === email);
  if (!existing) throw new Error('Could not create the Auth user: ' + created.error.code);
  const upd = await admin.auth.admin.updateUserById(existing.id, { password: ADMIN_PASSWORD, email_confirm: true });
  if (upd.error) throw new Error('Could not update the Auth user.');
  authId = existing.id;
} else authId = created.data.user.id;

const { error } = await admin.from('admins').upsert({ email, auth_user_id: authId, active: true }, { onConflict: 'email' });
if (error) throw new Error('Could not write the admins mapping: ' + error.code);
console.log('Admin ready (Auth user linked to admins row). Sign in at the admin site with this email.');
