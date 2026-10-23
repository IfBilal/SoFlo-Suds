import type { Sql } from 'postgres';
import { HttpError } from './errors.ts';
import type { UrableJob } from './urable.ts';

export interface PromoResult { promoId: string; useId: string; discountCents: number; percent: boolean; value: number }

/** Discount in cents, capped at the subtotal (handbook 4.4). */
export function discountFor(kind: string, value: number, subtotalCents: number): number {
  const raw = kind === 'percent' ? Math.round(subtotalCents * value / 100) : Math.round(value * 100);
  return Math.max(0, Math.min(raw, subtotalCents));
}

const reject = (code: string, message: string) => new HttpError(400, code, message);

/** Validate a code and reserve it for one booking, all under a row lock on the code. */
export async function reservePromo(sql: Sql, userId: string, rawCode: string, jobId: string, subtotalCents: number): Promise<PromoResult> {
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM promo_attempts WHERE user_id = ${userId} AND created_at > now() - interval '1 hour'`;
  if (n >= 10) throw new HttpError(429, 'PROMO_RATE_LIMITED', 'Too many attempts. Please try again later.');
  try {
    return await sql.begin(async (tx) => {
      const [p] = await tx`SELECT * FROM promo_codes WHERE code = ${rawCode.trim().toUpperCase()} AND active
        AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()) FOR UPDATE`;
      if (!p) throw reject('PROMO_INVALID', 'That code is not valid.');
      if (subtotalCents <= 0) throw reject('PROMO_INVALID', 'That code cannot be applied to this booking.');
      if (Number(p.min_order_usd) * 100 > subtotalCents) throw reject('PROMO_MIN_ORDER', `This code needs a minimum order of $${Number(p.min_order_usd).toFixed(2)}.`);
      const [live] = await tx`SELECT 1 FROM promo_uses WHERE urable_job_id = ${jobId} AND status IN ('reserved','applied')`;
      if (live) throw reject('PROMO_ALREADY_USED', 'A code is already applied to this booking.');
      if (p.first_booking_only) {
        const [other] = await tx`SELECT 1 FROM job_sync WHERE user_id = ${userId} AND urable_job_id <> ${jobId} AND last_status <> 'canceled' LIMIT 1`;
        if (other) throw reject('PROMO_FIRST_BOOKING_ONLY', 'This code is for first bookings only.');
      }
      const [mine] = await tx`SELECT count(*)::int AS n FROM promo_uses WHERE promo_id = ${p.id} AND user_id = ${userId} AND status IN ('reserved','applied')`;
      if (p.max_uses_per_user != null && mine.n >= p.max_uses_per_user) throw reject('PROMO_ALREADY_USED', 'You have already used this code.');
      const [all] = await tx`SELECT count(*)::int AS n FROM promo_uses WHERE promo_id = ${p.id} AND status IN ('reserved','applied')`;
      if (p.max_total_uses != null && all.n >= p.max_total_uses) throw reject('PROMO_LIMIT_REACHED', 'This code has reached its limit.');
      const percent = p.kind === 'percent';
      const discountCents = discountFor(p.kind as string, Number(p.value), subtotalCents);
      const [use] = await tx`INSERT INTO promo_uses (promo_id, user_id, urable_job_id, status) VALUES (${p.id}, ${userId}, ${jobId}, 'reserved') RETURNING id`;
      return { promoId: p.id as string, useId: use.id as string, discountCents, percent, value: percent ? Number(p.value) : discountCents };
    });
  } catch (e) {
    if (e instanceof HttpError && e.code.startsWith('PROMO_') && e.code !== 'PROMO_ALREADY_USED') await sql`INSERT INTO promo_attempts (user_id) VALUES (${userId})`;
    throw e;
  }
}

export const releasePromo = (sql: Sql, jobId: string) =>
  sql`UPDATE promo_uses SET status = 'released' WHERE urable_job_id = ${jobId} AND status = 'reserved'`;

/** Move reservations along as Urable reports payment or cancellation. */
export async function settlePromo(sql: Sql, job: UrableJob): Promise<void> {
  const status = job.status.toLowerCase();
  if (status === 'canceled' || status === 'cancelled') await sql`UPDATE promo_uses SET status = 'released' WHERE urable_job_id = ${job.id} AND status IN ('reserved','applied')`;
  else if (job.paymentStatus === 'paid') await sql`UPDATE promo_uses SET status = 'applied' WHERE urable_job_id = ${job.id} AND status = 'reserved'`;
}

/** Only an unpaid, not-yet-finished booking can take a code. */
export function promoEligible(job: UrableJob): boolean {
  const s = job.status.toLowerCase();
  return !['completed', 'canceled', 'cancelled'].includes(s) && ['unpaid', 'pending', undefined].includes(job.paymentStatus?.toLowerCase());
}
