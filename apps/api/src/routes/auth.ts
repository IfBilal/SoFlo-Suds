import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { createAccessToken, getUser, newRefreshToken, passwordHash, passwordMatches, publicUser, sha256 } from '../auth.js';
import { UrableClient } from '../urable/client.js';
import { isEmailConfigured, sendPasswordReset } from '../email.js';

const signupSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.email().transform(x => x.toLowerCase()), phone: z.string().trim().min(7).max(25), password: z.string().min(8).max(128), referralCode: z.string().trim().optional() });
const loginSchema = z.object({ email: z.email().transform(x => x.toLowerCase()), password: z.string().min(1) });
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const loginLimit = { config: { rateLimit: { max: 5, timeWindow: '15 minutes', keyGenerator: (request: { ip: string; body: unknown }) => { const body = request.body && typeof request.body === 'object' && 'email' in request.body ? request.body as { email?: unknown } : {}; return request.ip + ':' + String(body.email ?? '').trim().toLowerCase(); } } } };
function code() { const bytes = randomBytes(6); return [...bytes].map(x => alphabet[x % alphabet.length]).join(''); }
function urable() { return new UrableClient(process.env.URABLE_API_KEY ?? '', process.env.URABLE_BASE_URL); }

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/signup', async (request, reply) => {
    const input = signupSchema.parse(request.body);
    const existing = await db().query('SELECT 1 FROM users WHERE email=$1 AND deleted_at IS NULL', [input.email]);
    if (existing.rowCount) return reply.code(409).send({ error: { code: 'EMAIL_TAKEN', message: 'This email already has an account.' } });
    let referredBy: string | null = null;
    if (input.referralCode) {
      const r = await db().query('SELECT id FROM users WHERE referral_code=$1 AND deleted_at IS NULL', [input.referralCode.toUpperCase()]);
      if (!r.rows[0]) return reply.code(400).send({ error: { code: 'REFERRAL_INVALID', message: 'That referral code is not valid.' } });
      referredBy = r.rows[0].id;
    }
    const parts = input.name.split(/\s+/);
    const urableCustomerId = await urable().createCustomer({ firstName: parts[0], lastName: parts.slice(1).join(' '), email: input.email, phone: input.phone });
    const digest = await passwordHash(input.password);
    const result = await db().query('INSERT INTO users (urable_customer_id,name,email,phone,password_hash,referral_code,referred_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,email,phone,urable_customer_id AS "urableCustomerId",referral_code AS "referralCode",notification_appointments AS "notificationAppointments",notification_promos AS "notificationPromos"', [urableCustomerId, input.name, input.email, input.phone, digest, code(), referredBy]);
    const user = result.rows[0];
    if (referredBy) await db().query('INSERT INTO referrals (referrer_id,referee_id) VALUES ($1,$2)', [referredBy, user.id]);
    return { user: publicUser(user, 0), accessToken: await createAccessToken(user.id), refreshToken: await newRefreshToken(user.id) };
  });
  app.post('/auth/login', loginLimit, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const result = await db().query('SELECT id,name,email,phone,password_hash,urable_customer_id AS "urableCustomerId",referral_code AS "referralCode",notification_appointments AS "notificationAppointments",notification_promos AS "notificationPromos" FROM users WHERE email=$1 AND deleted_at IS NULL', [input.email]);
    const user = result.rows[0];
    if (!user || !await passwordMatches(input.password, user.password_hash)) return reply.code(401).send({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
    const points = await db().query('SELECT COALESCE(SUM(delta),0)::int AS balance FROM points_ledger WHERE user_id=$1', [user.id]);
    return { user: publicUser(user, points.rows[0].balance), accessToken: await createAccessToken(user.id), refreshToken: await newRefreshToken(user.id) };
  });
  app.post('/auth/refresh', async (request, reply) => {
    const input = z.object({ refreshToken: z.string().min(20) }).parse(request.body);
    const client = await db().connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT rs.id AS session_id, rs.user_id, u.id,u.name,u.email,u.phone,u.urable_customer_id AS "urableCustomerId",u.referral_code AS "referralCode",u.notification_appointments AS "notificationAppointments",u.notification_promos AS "notificationPromos" FROM refresh_sessions rs JOIN users u ON u.id=rs.user_id WHERE rs.token_hash=$1 AND rs.revoked_at IS NULL AND rs.expires_at>now() AND u.deleted_at IS NULL FOR UPDATE OF rs', [sha256(input.refreshToken)]);
      if (!result.rows[0]) { await client.query('ROLLBACK'); return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Session expired. Please log in again.' } }); }
      const user = result.rows[0];
      await client.query('UPDATE refresh_sessions SET revoked_at=now() WHERE id=$1', [user.session_id]);
      await client.query('COMMIT');
      return { user: publicUser(user), accessToken: await createAccessToken(user.user_id), refreshToken: await newRefreshToken(user.user_id) };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  });
  app.post('/auth/logout', async request => {
    const input = z.object({ refreshToken: z.string().min(20) }).parse(request.body);
    await db().query('UPDATE refresh_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL', [sha256(input.refreshToken)]);
    return { ok: true };
  });
  app.get('/me', async request => {
    const user = await getUser(request);
    const points = await db().query('SELECT COALESCE(SUM(delta),0)::int AS balance FROM points_ledger WHERE user_id=$1', [user.id]);
    return publicUser(user, points.rows[0].balance);
  });
  app.patch('/me', async request => {
    const user = await getUser(request);
    const input = z.object({ name: z.string().trim().min(2).max(100).optional(), phone: z.string().trim().min(7).max(25).optional(), notificationAppointments: z.boolean().optional(), notificationPromos: z.boolean().optional() }).parse(request.body);
    const result = await db().query('UPDATE users SET name=COALESCE($2,name),phone=COALESCE($3,phone),notification_appointments=COALESCE($4,notification_appointments),notification_promos=COALESCE($5,notification_promos),updated_at=now() WHERE id=$1 RETURNING id,name,email,phone,urable_customer_id AS "urableCustomerId",referral_code AS "referralCode",notification_appointments AS "notificationAppointments",notification_promos AS "notificationPromos"', [user.id, input.name ?? null, input.phone ?? null, input.notificationAppointments ?? null, input.notificationPromos ?? null]);
    return publicUser(result.rows[0]);
  });
  app.delete('/me', async request => {
    const user = await getUser(request);
    const client = await db().connect();
    try { await client.query('BEGIN'); await client.query('DELETE FROM refresh_sessions WHERE user_id=$1', [user.id]); await client.query('DELETE FROM push_tokens WHERE user_id=$1', [user.id]); await client.query("UPDATE users SET name='Deleted customer',email=id::text || '@deleted.invalid',phone='',password_hash='',deleted_at=now() WHERE id=$1", [user.id]); await client.query('COMMIT'); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    return { ok: true };
  });
  app.post('/auth/forgot', loginLimit, async (request, reply) => {
    const input = z.object({ email: z.email().transform(x => x.toLowerCase()) }).parse(request.body);
    if (!isEmailConfigured()) return reply.code(503).send({ error: { code: 'EMAIL_NOT_CONFIGURED', message: 'Password reset is temporarily unavailable. Please contact the shop.' } });
    const found = await db().query('SELECT id FROM users WHERE email=$1 AND deleted_at IS NULL', [input.email]);
    if (found.rows[0]) {
      const token = randomBytes(32).toString('base64url');
      await db().query("INSERT INTO password_resets (user_id,token_hash,expires_at) VALUES ($1,$2,now()+interval '30 minutes')", [found.rows[0].id,sha256(token)]);
      await sendPasswordReset(input.email, token);
    }
    return { ok: true };
  });
  app.post('/auth/reset', async (request, reply) => {
    const input = z.object({ token: z.string().min(20), password: z.string().min(8).max(128) }).parse(request.body);
    const client = await db().connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT id,user_id FROM password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE', [sha256(input.token)]);
      if (!result.rows[0]) { await client.query('ROLLBACK'); return reply.code(400).send({ error: { code: 'RESET_EXPIRED', message: 'This reset link has expired. Request a new one.' } }); }
      await client.query('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1', [result.rows[0].user_id,await passwordHash(input.password)]);
      await client.query('UPDATE password_resets SET used_at=now() WHERE id=$1', [result.rows[0].id]);
      await client.query('UPDATE refresh_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [result.rows[0].user_id]);
      await client.query('COMMIT'); return { ok: true };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  });
}
