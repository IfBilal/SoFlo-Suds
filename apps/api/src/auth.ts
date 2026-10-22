import { createHash, randomBytes } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import type { FastifyRequest } from 'fastify';
import { db } from './db.js';

export interface AuthUser { id: string; name: string; email: string; phone: string; urableCustomerId: string; referralCode: string; notificationAppointments: boolean; notificationPromos: boolean }
export function sha256(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function passwordHash(password: string) { return hash(password, 12); }
export function passwordMatches(password: string, digest: string) { return compare(password, digest); }
function secret() { const value = process.env.JWT_SECRET; if (!value || value.length < 32) throw new Error('JWT_SECRET must have at least 32 characters'); return new TextEncoder().encode(value); }
export async function createAccessToken(userId: string) { return new SignJWT({ sub: userId, role: 'customer' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('15m').sign(secret()); }
export async function createAdminToken(adminId: string) { return new SignJWT({ sub: adminId, role: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('15m').sign(secret()); }
export async function newRefreshToken(userId: string) { const token = randomBytes(48).toString('base64url'); await db().query('INSERT INTO refresh_sessions (user_id, token_hash, expires_at) VALUES ($1,$2,now() + interval \'30 days\')', [userId, sha256(token)]); return token; }
export async function getUser(request: FastifyRequest): Promise<AuthUser> {
  const raw = request.headers.authorization?.replace(/^Bearer /i, '');
  if (!raw) throw Object.assign(new Error('Log in to continue.'), { statusCode: 401, code: 'UNAUTHORIZED' });
  let id: string;
  try { const result = await jwtVerify(raw, secret()); if (result.payload.role !== 'customer' || !result.payload.sub) throw new Error('Bad role'); id = result.payload.sub; } catch { throw Object.assign(new Error('Session expired. Please log in again.'), { statusCode: 401, code: 'UNAUTHORIZED' }); }
  const result = await db().query('SELECT id,name,email,phone,urable_customer_id AS "urableCustomerId",referral_code AS "referralCode",notification_appointments AS "notificationAppointments",notification_promos AS "notificationPromos" FROM users WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!result.rows[0]) throw Object.assign(new Error('Session expired. Please log in again.'), { statusCode: 401, code: 'UNAUTHORIZED' });
  return result.rows[0] as AuthUser;
}
export async function getAdmin(request: FastifyRequest): Promise<string> {
  const raw = request.headers.authorization?.replace(/^Bearer /i, '');
  if (!raw) throw Object.assign(new Error('Admin sign-in required.'), { statusCode: 401, code: 'UNAUTHORIZED' });
  let id: string;
  try { const result = await jwtVerify(raw, secret()); if (result.payload.role !== 'admin' || !result.payload.sub) throw new Error('Bad role'); id = result.payload.sub; } catch { throw Object.assign(new Error('Admin sign-in required.'), { statusCode: 401, code: 'UNAUTHORIZED' }); }
  const admin = await db().query('SELECT id FROM admins WHERE id=$1 AND active=true', [id]);
  if (!admin.rows[0]) throw Object.assign(new Error('Admin sign-in required.'), { statusCode: 401, code: 'UNAUTHORIZED' });
  return id;
}
export function publicUser(user: AuthUser, points?: number) { return { id: user.id, name: user.name, email: user.email, phone: user.phone, points, notificationAppointments: user.notificationAppointments, notificationPromos: user.notificationPromos }; }
