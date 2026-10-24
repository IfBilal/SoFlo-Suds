import { z } from 'zod';
import { HttpError } from '../_shared/errors.ts';
import { reply, type Router } from './router.ts';

const body = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(200) });
const LOCKED = 'Too many failed attempts. Please wait 15 minutes, or reset your password.';

/**
 * Handbook 6/7: POST /auth/login with a rate limit of 5 failed attempts per 15 minutes per IP + email (and 20 per email, so
 * rotating IPs does not help). Registered in `soflo-auth` (no JWT needed to reach it) and in the test router.
 */
export function loginRoutes(app: Router) {
  app.post('/auth/login', async ({ req, deps, json }) => {
    const input = body.parse(await json());
    const ip = (req.headers.get('x-forwarded-for')?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'unknown').trim().slice(0, 64) || 'unknown';
    const [seen] = await deps.sql`SELECT count(*) FILTER (WHERE ip = ${ip})::int AS pair, count(*)::int AS total
      FROM login_attempts WHERE email = ${input.email} AND at > now() - interval '15 minutes'`;
    if (seen.pair >= 5 || seen.total >= 20) throw new HttpError(429, 'LOGIN_RATE_LIMITED', LOCKED);
    const result = await deps.auth.signIn(input.email, input.password);
    if ('error' in result) {
      if (result.error.code === 'invalid_credentials') {
        await deps.sql`INSERT INTO login_attempts (email, ip) VALUES (${input.email}, ${ip})`;
        await deps.sql`DELETE FROM login_attempts WHERE at < now() - interval '1 day'`;
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      }
      if (result.error.code === 'email_not_confirmed') throw new HttpError(403, 'EMAIL_NOT_CONFIRMED', 'Please confirm your email first. Check your inbox for the link.');
      throw new HttpError(502, 'AUTH_FAILED', 'Could not log in. Please try again.');
    }
    await deps.sql`DELETE FROM login_attempts WHERE email = ${input.email} AND ip = ${ip}`;
    return reply(result.session);
  });
}
