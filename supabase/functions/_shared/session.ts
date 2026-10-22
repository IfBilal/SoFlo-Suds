import type { AuthIdentity, Deps } from './deps.ts';
import { HttpError } from './errors.ts';

export interface Customer {
  id: string; authUserId: string; name: string; email: string; phone: string; urableCustomerId: string;
  referralCode: string; notificationAppointments: boolean; notificationPromos: boolean;
}

export function bearer(req: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  return m ? m[1].trim() : null;
}

/** Verified Auth identity or 401. A token's mere presence is never enough. */
export async function identify(req: Request, deps: Deps, message = 'Log in to continue.'): Promise<AuthIdentity> {
  const token = bearer(req);
  const who = token ? await deps.verifyToken(token) : null;
  if (!who) throw new HttpError(401, 'UNAUTHORIZED', message);
  return who;
}

/** Resolve the signed-in customer through users.auth_user_id; never from request input. */
export async function requireCustomer(req: Request, deps: Deps): Promise<Customer> {
  const who = await identify(req, deps);
  const [row] = await deps.sql`SELECT id, auth_user_id AS "authUserId", name, email, phone, urable_customer_id AS "urableCustomerId",
      referral_code AS "referralCode", notification_appointments AS "notificationAppointments", notification_promos AS "notificationPromos"
    FROM users WHERE auth_user_id = ${who.id} AND deleted_at IS NULL`;
  if (!row) throw new HttpError(401, 'PROFILE_INCOMPLETE', 'Finish setting up your account to continue.');
  return row as unknown as Customer;
}

/** Active admin mapped to the verified Auth user. Deactivation takes effect immediately. */
export async function requireAdmin(req: Request, deps: Deps): Promise<string> {
  const who = await identify(req, deps, 'Admin sign-in required.');
  const [row] = await deps.sql`SELECT id FROM admins WHERE auth_user_id = ${who.id} AND active = true`;
  if (!row) throw new HttpError(401, 'UNAUTHORIZED', 'Admin sign-in required.');
  return row.id as string;
}
