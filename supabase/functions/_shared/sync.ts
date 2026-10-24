import { settlePromo } from './promo.ts';
import { releaseReward } from './extras.ts';
import type { Deps } from './deps.ts';
import type { UrableJob } from './urable.ts';
import { sendPushToUser } from './push.ts';

export const ownsJob = (job: UrableJob, customerId: string) => job.customerRef === customerId || !!job.customerRef?.endsWith('/' + customerId);
export const jobVehicleId = (job: UrableJob) => job.itemRefs?.[0]?.split('/').at(-1) ?? '';
const done = (s: string) => ['completed', 'canceled', 'cancelled'].includes(s.toLowerCase());

export interface SyncStats { users: number; jobs: number; failed: number; wrapped: boolean; skipped?: boolean }

/** Record one job (all point rules run inside the SQL function) and notify exactly once. */
export async function recordJob(deps: Deps, userId: string, job: UrableJob): Promise<void> {
  const vehicle = jobVehicleId(job);
  if (!vehicle) return;
  await settlePromo(deps.sql, job);
  if (['canceled', 'cancelled'].includes(job.status.toLowerCase())) await releaseReward(deps.sql, job.id);
  const [row] = await deps.sql`SELECT soflo_private.record_job(${userId}, ${job.id}, ${vehicle}, ${job.status}, ${job.paymentStatus ?? null},
      ${job.start ? new Date(job.start) : null}, ${job.invoice?.amountPaid ?? 0}) AS r`;
  const r = row.r as { skipped?: boolean; isNew?: boolean; oldStatus?: string };
  if (r.skipped) return;
  if (job.status.toLowerCase() === 'completed') {
    await deps.sql`UPDATE job_sync SET completed_at = ${job.completedAt ? new Date(job.completedAt) : new Date()} WHERE urable_job_id = ${job.id} AND completed_at IS NULL`;
  }
  const link = { deepLink: `/bookings/${job.id}` };
  // A virtual-shop job can exist before checkout is paid. The same event key
  // lets a later paid sync send confirmation once without announcing an
  // abandoned unpaid checkout as confirmed.
  if (job.status.toLowerCase() === 'scheduled' && job.paymentStatus === 'paid') {
    await sendPushToUser(deps, userId, `confirmed:${job.id}`, { title: 'Booking confirmed', body: 'Your SoFlo Suds appointment is on the schedule.', data: link }, 'service');
  } else if (!r.isNew && r.oldStatus !== job.status) {
    await sendPushToUser(deps, userId, `status:${job.id}:${job.status}`, { title: 'Service update', body: `Your SoFlo Suds booking is ${job.status}.`, data: link }, 'service');
  }
}

/**
 * One bounded slice of the Urable → app sync. A lease stops overlapping runs and a
 * cursor lets the next run resume where this one stopped, so a slow Urable call or a
 * big customer base can never push a single invocation past the platform limit.
 */
export async function syncJobsBatch(deps: Deps, opts: { budgetMs?: number; batchSize?: number; now?: () => number } = {}): Promise<SyncStats> {
  const { sql } = deps;
  const now = opts.now ?? Date.now;
  const started = now();
  const budget = opts.budgetMs ?? 90_000, size = opts.batchSize ?? 10;
  const [lease] = await sql`SELECT * FROM soflo_private.claim_sync_lease('jobs', ${Math.ceil(budget / 1000) + 120})`;
  const stats: SyncStats = { users: 0, jobs: 0, failed: 0, wrapped: false };
  if (!lease.claimed) return { ...stats, skipped: true };
  let cursor = (lease.cursor as string | null) ?? null;
  try {
    const urable = deps.urable();
    while (now() - started < budget) {
      const users = await sql`SELECT id, urable_customer_id FROM users WHERE deleted_at IS NULL AND (${cursor}::uuid IS NULL OR id > ${cursor}::uuid) ORDER BY id LIMIT ${size}`;
      if (!users.length) { cursor = null; stats.wrapped = true; break; }
      for (const user of users) {
        cursor = user.id as string; stats.users++;
        try {
          const jobs = await urable.listJobs(user.urable_customer_id as string);
          const seen = new Set<string>();
          for (const job of jobs) {
            if (!ownsJob(job, user.urable_customer_id as string)) continue;
            seen.add(job.id);
            await recordJob(deps, user.id as string, job); stats.jobs++;
          }
          // Virtual-shop checkout can create a duplicate Urable customer. Jobs
          // linked by a verified handoff still need payment/status polling.
          const linked = await sql`SELECT urable_job_id FROM job_sync WHERE user_id = ${user.id}`;
          for (const row of linked) {
            const id = row.urable_job_id as string;
            if (seen.has(id)) continue;
            await recordJob(deps, user.id as string, await urable.getJob(id)); stats.jobs++;
          }
        } catch { stats.failed++; } // partial Urable failure: keep going, retry on the next cycle
        if (now() - started >= budget) break;
      }
    }
  } finally {
    await sql`SELECT soflo_private.finish_sync_lease('jobs', ${cursor}::uuid, ${sql.json(stats as never)})`;
  }
  return stats;
}

/**
 * Day-before reminders: appointments whose local (shop timezone) date is tomorrow, sent once the shop's
 * `reminder_hour_local` has arrived (default 9). reminder_sent_at is the idempotency marker.
 */
export async function sendRemindersOnce(deps: Deps): Promise<{ sent: number }> {
  const { sql } = deps;
  const jobs = await sql`WITH cfg AS (
      SELECT COALESCE((SELECT value #>> '{}' FROM settings WHERE key = 'shop_timezone'), 'America/New_York') AS tz,
             COALESCE((SELECT (value #>> '{}')::int FROM settings WHERE key = 'reminder_hour_local'), 9) AS hr)
    SELECT j.id, j.user_id, j.urable_job_id FROM job_sync j, cfg
    WHERE j.reminder_sent_at IS NULL AND lower(j.last_status) NOT IN ('completed','canceled','cancelled')
      AND (j.scheduled_at AT TIME ZONE cfg.tz)::date = (now() AT TIME ZONE cfg.tz)::date + 1
      AND extract(hour FROM now() AT TIME ZONE cfg.tz) >= cfg.hr`;
  let sent = 0;
  for (const job of jobs) {
    const result = await sendPushToUser(deps, job.user_id as string, `reminder:${job.urable_job_id}`,
      { title: 'Your SoFlo Suds visit is tomorrow', body: 'Your vehicle care appointment is coming up. Open the app for details.', data: { deepLink: `/bookings/${job.urable_job_id}` } }, 'service');
    if (result === 'sent') { await sql`UPDATE job_sync SET reminder_sent_at = now() WHERE id = ${job.id} AND reminder_sent_at IS NULL`; sent++; }
  }
  return { sent };
}

/** Ask for a review 2 hours after a job completes (once per job, never if already reviewed). */
export async function sendReviewPromptsOnce(deps: Deps): Promise<{ sent: number }> {
  const { sql } = deps;
  const jobs = await sql`SELECT j.user_id, j.urable_job_id FROM job_sync j
    WHERE j.completed_at IS NOT NULL AND j.completed_at <= now() - interval '2 hours' AND j.completed_at > now() - interval '3 days'
      AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.urable_job_id = j.urable_job_id)`;
  let sent = 0;
  for (const job of jobs) {
    const result = await sendPushToUser(deps, job.user_id as string, `review:${job.urable_job_id}`,
      { title: 'How was your SoFlo Suds service?', body: 'Tell us how it went. It takes a few seconds.', data: { deepLink: `/review/${job.urable_job_id}` } }, 'service');
    if (result === 'sent') sent++;
  }
  return { sent };
}
export { done as isDoneStatus };
