import { db } from '../db.js';

export interface PushMessage { title: string; body: string; data?: Record<string,string> }
export async function sendPushToUser(userId: string, eventKey: string, message: PushMessage, kind: 'service' | 'promo'): Promise<'sent' | 'skipped' | 'failed'> {
  const user = await db().query('SELECT notification_appointments,notification_promos FROM users WHERE id=$1 AND deleted_at IS NULL', [userId]);
  if (!user.rows[0] || (kind === 'service' && !user.rows[0].notification_appointments) || (kind === 'promo' && !user.rows[0].notification_promos)) return 'skipped';
  const tokens = await db().query('SELECT token FROM push_tokens WHERE user_id=$1', [userId]);
  if (!tokens.rows.length) return 'skipped';
  const logged = await db().query('INSERT INTO notification_log (user_id,event_key,title,body) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,event_key) DO NOTHING RETURNING id', [userId,eventKey,message.title,message.body]);
  if (!logged.rowCount) return 'skipped';
  try {
    const payload = tokens.rows.map(r => ({ to: r.token, sound: 'default', title: message.title, body: message.body, data: message.data ?? {} }));
    const response = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000) });
    const result = await response.json() as { data?: Array<{ status: string; message?: string }> };
    if (!response.ok || !result.data?.some(ticket => ticket.status === 'ok')) return 'failed';
    await db().query('UPDATE notification_log SET sent_at=now() WHERE id=$1', [logged.rows[0].id]);
    return 'sent';
  } catch { return 'failed'; }
}
