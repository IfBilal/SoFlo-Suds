import { expoReceipts, productionDeps } from '../_shared/runtime.ts';
import { processReceipts } from '../_shared/push.ts';
import { sendRemindersOnce, sendReviewPromptsOnce, syncJobsBatch } from '../_shared/sync.ts';

/** Constant-time compare so the scheduler secret cannot be probed by timing. */
function same(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * Invoked by Supabase Cron (pg_net) with the shared secret. Customer JWTs are never accepted
 * as scheduler authority. Each call does one bounded slice of work and returns counts only.
 */
export async function handle(req: Request, deps = productionDeps(), secret = Deno.env.get('CRON_SECRET') ?? '') {
  const given = req.headers.get('x-cron-secret') ?? '';
  if (!secret || secret.length < 24 || !same(given, secret)) return Response.json({ error: { code: 'UNAUTHORIZED', message: 'Not allowed.' } }, { status: 401 });
  if (req.method !== 'POST') return Response.json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' } }, { status: 405 });
  const result: Record<string, unknown> = {};
  for (const [name, run] of [['sync', () => syncJobsBatch(deps)], ['reminders', () => sendRemindersOnce(deps)], ['reviewPrompts', () => sendReviewPromptsOnce(deps)], ['receipts', () => processReceipts(deps, expoReceipts)]] as const) {
    try { result[name] = await run(); } catch (e) { result[name] = { error: e instanceof Error ? e.name : 'error' }; }
  }
  return Response.json(result);
}
if (import.meta.main) Deno.serve((req) => handle(req));
