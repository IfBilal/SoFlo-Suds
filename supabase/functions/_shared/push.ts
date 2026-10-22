import type { Deps } from './deps.ts';

export type PushResult = 'sent' | 'skipped' | 'failed';
export interface PushContent { title: string; body: string; data?: Record<string, string> }

/**
 * Send to one user. notification_log (UNIQUE user_id,event_key) is the idempotency
 * marker, claimed BEFORE sending so a replay can never double-send. Respects the
 * appointment/promo opt-ins. A fully failed send releases the claim so a retry works.
 */
export async function sendPushToUser(deps: Deps, userId: string, eventKey: string, msg: PushContent, kind: 'service' | 'promo'): Promise<PushResult> {
  const { sql } = deps;
  const [user] = await sql`SELECT notification_appointments AS a, notification_promos AS p FROM users WHERE id = ${userId} AND deleted_at IS NULL`;
  if (!user || (kind === 'service' && !user.a) || (kind === 'promo' && !user.p)) return 'skipped';
  const tokens = await sql`SELECT token FROM push_tokens WHERE user_id = ${userId}`;
  if (!tokens.length) return 'skipped';
  const [logged] = await sql`INSERT INTO notification_log (user_id, event_key, title, body) VALUES (${userId}, ${eventKey}, ${msg.title}, ${msg.body})
    ON CONFLICT (user_id, event_key) DO NOTHING RETURNING id`;
  if (!logged) return 'skipped';
  try {
    const tickets = await deps.push(tokens.map((t) => ({ to: t.token as string, title: msg.title, body: msg.body, data: msg.data })));
    let ok = 0;
    for (const [i, ticket] of tickets.entries()) {
      if (ticket.status === 'ok') {
        ok++;
        if (ticket.id) await sql`INSERT INTO push_tickets (ticket_id, token) VALUES (${ticket.id}, ${tokens[i].token}) ON CONFLICT DO NOTHING`;
      } else if (ticket.details?.error === 'DeviceNotRegistered') {
        await sql`DELETE FROM push_tokens WHERE token = ${tokens[i].token}`;
      }
    }
    if (!ok) throw new Error('no accepted tickets');
    await sql`UPDATE notification_log SET sent_at = now() WHERE id = ${logged.id}`;
    return 'sent';
  } catch {
    await sql`DELETE FROM notification_log WHERE id = ${logged.id} AND sent_at IS NULL`;
    return 'failed';
  }
}

/** Check receipts for tickets older than a minute; remove tokens Expo reports unregistered. */
export async function processReceipts(deps: Deps, getReceipts: (ids: string[]) => Promise<Record<string, { status: string; details?: { error?: string } }>>) {
  const { sql } = deps;
  const rows = await sql`SELECT ticket_id, token FROM push_tickets WHERE created_at < now() - interval '1 minute' ORDER BY created_at LIMIT 300`;
  if (!rows.length) return { checked: 0, removed: 0 };
  const receipts = await getReceipts(rows.map((r) => r.ticket_id as string));
  let removed = 0;
  for (const row of rows) {
    const receipt = receipts[row.ticket_id as string];
    if (!receipt) continue; // not ready yet; keep for the next run
    if (receipt.details?.error === 'DeviceNotRegistered') { await sql`DELETE FROM push_tokens WHERE token = ${row.token}`; removed++; }
    await sql`DELETE FROM push_tickets WHERE ticket_id = ${row.ticket_id}`;
  }
  return { checked: rows.length, removed };
}
