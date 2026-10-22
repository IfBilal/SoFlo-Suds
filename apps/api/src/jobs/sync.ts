import { db } from '../db.js';
import { UrableClient, type UrableJob } from '../urable/client.js';
import { sendPushToUser } from '../notifications/push.js';

function owns(job: UrableJob, customerId: string) { return job.customerRef === customerId || job.customerRef?.endsWith('/' + customerId); }
function vehicleId(job: UrableJob) { return job.itemRefs?.[0]?.split('/').at(-1) ?? ''; }
async function pointsPerUsd() { const result = await db().query("SELECT value FROM settings WHERE key='points_per_usd'"); const value = Number(result.rows[0]?.value); return Number.isFinite(value) && value >= 0 ? value : 0; }
async function recordJob(userId: string, job: UrableJob, rate: number) {
  const id = vehicleId(job);
  if (!id) return;
  const old = await db().query('SELECT last_status FROM job_sync WHERE urable_job_id=$1 AND user_id=$2', [job.id,userId]);
  await db().query('INSERT INTO job_sync (user_id,urable_job_id,urable_vehicle_id,last_status,payment_status,scheduled_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (urable_job_id) DO UPDATE SET last_status=EXCLUDED.last_status,payment_status=EXCLUDED.payment_status,scheduled_at=EXCLUDED.scheduled_at,updated_at=now() WHERE job_sync.user_id=EXCLUDED.user_id', [userId,job.id,id,job.status,job.paymentStatus ?? null,job.start ? new Date(job.start) : null]);
  if (!old.rows[0] && job.status.toLowerCase() === 'scheduled') await sendPushToUser(userId,`confirmed:${job.id}`,{title:'Booking confirmed',body:'Your SoFlo Suds appointment is on the schedule.',data:{deepLink:`/bookings/${job.id}`}},'service');
  if (old.rows[0] && old.rows[0].last_status !== job.status) await sendPushToUser(userId,`status:${job.id}:${job.status}`,{title:'Service update',body:`Your SoFlo Suds booking is ${job.status}.`,data:{deepLink:`/bookings/${job.id}`}},'service');
  if (job.status.toLowerCase() === 'completed' && job.paymentStatus === 'paid' && job.invoice?.amountPaid && rate > 0) {
    const client = await db().connect();
    try {
      await client.query('BEGIN');
      const marked = await client.query('UPDATE job_sync SET completed_paid_at=now() WHERE urable_job_id=$1 AND user_id=$2 AND completed_paid_at IS NULL RETURNING id', [job.id,userId]);
      if (marked.rowCount) {
        const points = Math.floor(job.invoice.amountPaid / 100 * rate);
        if (points > 0) await client.query('INSERT INTO points_ledger (user_id,delta,reason,source_key) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [userId,points,'job_completed',job.id]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
}
export async function syncJobsOnce() {
  if (!process.env.URABLE_API_KEY || !process.env.DATABASE_URL) throw new Error('URABLE_API_KEY and DATABASE_URL are required for sync');
  const client = new UrableClient(process.env.URABLE_API_KEY,process.env.URABLE_BASE_URL);
  const users = await db().query('SELECT id,urable_customer_id FROM users WHERE deleted_at IS NULL');
  const rate = await pointsPerUsd();
  let checked=0,failed=0;
  for (const user of users.rows) {
    try { const jobs = await client.listJobs(user.urable_customer_id); for (const job of jobs) if (owns(job,user.urable_customer_id)) { await recordJob(user.id,job,rate); checked++; } } catch { failed++; }
  }
  return { checked, failed };
}
export async function sendRemindersOnce() {
  const jobs = await db().query("SELECT id,user_id,urable_job_id,scheduled_at FROM job_sync WHERE reminder_sent_at IS NULL AND last_status NOT IN ('completed','canceled','cancelled') AND scheduled_at BETWEEN now()+interval '20 hours' AND now()+interval '28 hours'");
  let sent=0;
  for (const job of jobs.rows) {
    const result=await sendPushToUser(job.user_id,`reminder:${job.urable_job_id}`,{title:'Your SoFlo Suds visit is tomorrow',body:'Your vehicle care appointment is coming up. Open the app for details.',data:{deepLink:`/bookings/${job.urable_job_id}`}},'service');
    if (result==='sent') { await db().query('UPDATE job_sync SET reminder_sent_at=now() WHERE id=$1 AND reminder_sent_at IS NULL', [job.id]); sent++; }
  }
  return { sent };
}
