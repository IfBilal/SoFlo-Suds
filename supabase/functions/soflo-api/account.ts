import { z } from 'zod';
import type { Customer } from '../_shared/session.ts';
import { identify, requireCustomer } from '../_shared/session.ts';
import { HttpError } from '../_shared/errors.ts';
import type { Router } from './router.ts';
import { reply } from './router.ts';

const phone = z.string().trim().min(7).max(25);
const name = z.string().trim().min(2).max(100);
const completeSchema = z.object({ name, phone, referralCode: z.string().trim().max(20).optional() });

export function publicUser(u: Customer, points?: number) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, points, notificationAppointments: u.notificationAppointments, notificationPromos: u.notificationPromos };
}
const sqlErrors: Record<string, [number, string, string]> = {
  EMAIL_TAKEN: [409, 'EMAIL_TAKEN', 'This email already has an account.'],
  ACCOUNT_NEEDS_MIGRATION: [409, 'ACCOUNT_NEEDS_MIGRATION', 'This account needs a password reset to finish moving to the new sign-in. Use "Forgot password".'],
  REFERRAL_INVALID: [400, 'REFERRAL_INVALID', 'That referral code is not valid.'],
};
function mapSql(error: unknown): never {
  const hit = Object.keys(sqlErrors).find((k) => String((error as Error)?.message).includes(k));
  if (hit) throw new HttpError(...sqlErrors[hit]);
  throw error;
}

export function accountRoutes(app: Router) {
  /**
   * Finish signup after Supabase Auth created the identity. Idempotent and retry-safe:
   * the Urable customer id is stored in server-only app_metadata the moment it is created,
   * so a retry after a later failure reuses it instead of creating a duplicate customer.
   */
  app.post('/me/complete', async ({ req, deps, json }) => {
    const who = await identify(req, deps);
    const existing = await deps.sql`SELECT id FROM users WHERE auth_user_id = ${who.id} AND deleted_at IS NULL`;
    if (existing.length) return reply(await profile(deps, who.id));
    const input = completeSchema.parse({ ...who.userMetadata, ...((await json().catch(() => ({}))) as Record<string, unknown>) });
    if (!who.email) throw new HttpError(400, 'VALIDATION_FAILED', 'An email address is required.');
    // Cheap pre-checks so we never create an Urable customer for a signup that cannot finish.
    const email = who.email.toLowerCase();
    const [taken] = await deps.sql`SELECT auth_user_id FROM users WHERE lower(email) = ${email} AND deleted_at IS NULL`;
    if (taken) mapSql(new Error(taken.auth_user_id ? 'EMAIL_TAKEN' : 'ACCOUNT_NEEDS_MIGRATION'));
    if (input.referralCode) {
      const ok = await deps.sql`SELECT 1 FROM users WHERE referral_code = ${input.referralCode.toUpperCase()} AND deleted_at IS NULL`;
      if (!ok.length) mapSql(new Error('REFERRAL_INVALID'));
    }
    let urableId = typeof who.appMetadata.urable_customer_id === 'string' ? who.appMetadata.urable_customer_id : '';
    if (!urableId) {
      const parts = input.name.split(/\s+/);
      urableId = await deps.urable().createCustomer({ firstName: parts[0], lastName: parts.slice(1).join(' '), email, phone: input.phone });
      await deps.auth.setAppMetadata(who.id, { urable_customer_id: urableId });
    }
    try {
      await deps.sql`SELECT soflo_private.complete_profile(${who.id}, ${email}, ${input.name}, ${input.phone}, ${urableId}, ${input.referralCode ?? null})`;
    } catch (error) { mapSql(error); }
    return reply(await profile(deps, who.id), 201);
  });

  app.get('/me', async ({ req, deps }) => {
    const user = await requireCustomer(req, deps);
    return publicUser(user, await balance(deps, user.id));
  });

  app.patch('/me', async ({ req, deps, json }) => {
    const user = await requireCustomer(req, deps);
    const input = z.object({ name: name.optional(), phone: phone.optional(), notificationAppointments: z.boolean().optional(), notificationPromos: z.boolean().optional() }).parse(await json());
    const [row] = await deps.sql`UPDATE users SET name = COALESCE(${input.name ?? null}, name), phone = COALESCE(${input.phone ?? null}, phone),
        notification_appointments = COALESCE(${input.notificationAppointments ?? null}, notification_appointments),
        notification_promos = COALESCE(${input.notificationPromos ?? null}, notification_promos), updated_at = now()
      WHERE id = ${user.id} AND deleted_at IS NULL
      RETURNING id, name, email, phone, notification_appointments AS "notificationAppointments", notification_promos AS "notificationPromos"`;
    return row;
  });

  app.delete('/me', async ({ req, deps }) => {
    const user = await requireCustomer(req, deps);
    const [row] = await deps.sql`SELECT soflo_private.delete_account(${user.id}) AS auth_id`;
    // The app profile is already unusable (deleted_at set); removing the Auth identity ends the session at refresh.
    if (row?.auth_id) await deps.auth.deleteUser(row.auth_id as string);
    return { ok: true };
  });

  app.put('/me/push-token', async ({ req, deps, json }) => {
    const user = await requireCustomer(req, deps);
    const input = z.object({ token: z.string().min(20).max(300), platform: z.enum(['ios', 'android']) }).parse(await json());
    await deps.sql`INSERT INTO push_tokens (token, user_id, platform) VALUES (${input.token}, ${user.id}, ${input.platform})
      ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform`;
    return { ok: true };
  });

  app.get('/me/points', async ({ req, deps }) => ({ points: await balance(deps, (await requireCustomer(req, deps)).id) }));
  app.get('/me/referral', async ({ req, deps }) => {
    const user = await requireCustomer(req, deps);
    const stats = await deps.sql`SELECT status, count(*)::int AS count FROM referrals WHERE referrer_id = ${user.id} GROUP BY status`;
    return { code: user.referralCode, stats };
  });
}

export async function balance(deps: { sql: import('postgres').Sql }, userId: string): Promise<number> {
  const [row] = await deps.sql`SELECT COALESCE(sum(delta), 0)::int AS points FROM points_ledger WHERE user_id = ${userId}`;
  return row.points as number;
}
async function profile(deps: import('../_shared/deps.ts').Deps, authId: string) {
  const [u] = await deps.sql`SELECT id, auth_user_id AS "authUserId", name, email, phone, urable_customer_id AS "urableCustomerId", referral_code AS "referralCode",
      notification_appointments AS "notificationAppointments", notification_promos AS "notificationPromos" FROM users WHERE auth_user_id = ${authId} AND deleted_at IS NULL`;
  return publicUser(u as unknown as Customer, await balance(deps, u.id as string));
}
