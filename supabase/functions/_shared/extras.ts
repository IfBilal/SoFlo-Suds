import type { Sql } from 'postgres';
import type { Deps } from './deps.ts';
import { HttpError } from './errors.ts';
import type { UrableJob } from './urable.ts';

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const reject = (status: number, code: string, message: string) => new HttpError(status, code, message);

export interface ShopProduct { id: string; name: string; priceCents: number; urableProductId?: string }

/** A product by the id the Shop screen shows: our table (uuid) first, then Urable's own product list. */
export async function resolveProduct(deps: Deps, id: string): Promise<ShopProduct | null> {
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    const [p] = await deps.sql`SELECT id, name, price_cents AS "priceCents", urable_product_id AS "urableProductId" FROM shop_products WHERE id = ${id} AND active = true`;
    if (p) return { id: p.id as string, name: p.name as string, priceCents: p.priceCents as number, urableProductId: (p.urableProductId as string | null) ?? undefined };
  }
  const urable = (await deps.urable().listShopProducts()).find((x) => x.id === id && !/gift\s*cards?/i.test(x.name));
  return urable ? { id: urable.id, name: urable.name, priceCents: urable.prices?.[0]?.value ?? 0, urableProductId: urable.id } : null;
}

/** Attach an available redemption to one unpaid booking; the shop sees it in the job notes. */
export async function attachReward(deps: Deps, userId: string, job: UrableJob, redemptionId: string): Promise<{ code: string; name: string }> {
  const [r] = await deps.sql`SELECT rr.id, rr.code, rr.status, rr.applied_job_id AS "appliedJobId", r.name
    FROM reward_redemptions rr JOIN rewards r ON r.id = rr.reward_id WHERE rr.id = ${redemptionId} AND rr.user_id = ${userId}`;
  if (!r) throw reject(404, 'NOT_FOUND', 'Reward not found.');
  if (r.status !== 'available') throw reject(409, 'REDEMPTION_NOT_AVAILABLE', 'This reward is already used or cancelled.');
  if (r.appliedJobId) throw reject(409, 'REDEMPTION_ALREADY_ATTACHED', r.appliedJobId === job.id ? 'This reward is already on this booking.' : 'This reward is already on another booking.');
  const claimed = await deps.sql`UPDATE reward_redemptions SET applied_job_id = ${job.id} WHERE id = ${redemptionId} AND applied_job_id IS NULL AND status = 'available' RETURNING id`
    .catch((e: Error) => { if (/reward_redemptions_one_per_job_idx|duplicate key/i.test(e.message)) throw reject(409, 'BOOKING_HAS_REWARD', 'This booking already has a reward.'); throw e; });
  if (!claimed.length) throw reject(409, 'REDEMPTION_NOT_AVAILABLE', 'This reward can no longer be applied.');
  try {
    await deps.urable().appendNote(job, `SOFLO REWARD ${r.code}: ${r.name}. Customer redeemed points; please honour at this visit.`);
  } catch (e) {
    await deps.sql`UPDATE reward_redemptions SET applied_job_id = NULL WHERE id = ${redemptionId}`; // never keep a claim Urable did not record
    throw e;
  }
  return { code: r.code as string, name: r.name as string };
}

export const releaseReward = (sql: Sql, jobId: string) =>
  sql`UPDATE reward_redemptions SET applied_job_id = NULL WHERE applied_job_id = ${jobId} AND status = 'available'`;

/** Add a product to a booking: a real invoice line when Urable knows it, otherwise a note for the shop. */
export async function addProductToJob(deps: Deps, userId: string, job: UrableJob, product: ShopProduct, quantity: number): Promise<{ asLineItem: boolean }> {
  const asLineItem = !!product.urableProductId;
  const [row] = await deps.sql`INSERT INTO booking_products (user_id, urable_job_id, product_id, name, quantity, price_cents, as_line_item)
    VALUES (${userId}, ${job.id}, ${product.id}, ${product.name}, ${quantity}, ${product.priceCents}, ${asLineItem})
    ON CONFLICT (urable_job_id, product_id) DO NOTHING RETURNING id`;
  if (!row) throw reject(409, 'PRODUCT_ALREADY_ADDED', 'This product is already on the booking.');
  try {
    if (asLineItem) await deps.urable().addLineItem(job, product.urableProductId!, quantity);
    else await deps.urable().appendNote(job, `SOFLO SHOP PRODUCT: ${product.name} x${quantity} (${usd(product.priceCents * quantity)}). Customer asked to add this to the visit; please add to the invoice.`);
  } catch (e) {
    await deps.sql`DELETE FROM booking_products WHERE id = ${row.id}`;
    throw e;
  }
  return { asLineItem };
}

/** Apply the "next booking" list to a freshly linked booking. Best effort: failures leave the list for later. */
export async function applyNextBookingProducts(deps: Deps, userId: string, job: UrableJob): Promise<number> {
  const s = job.status.toLowerCase();
  if (['completed', 'canceled', 'cancelled'].includes(s) || (job.paymentStatus && job.paymentStatus.toLowerCase() !== 'unpaid' && job.paymentStatus.toLowerCase() !== 'pending')) return 0;
  const list = await deps.sql`SELECT product_id, quantity FROM next_booking_products WHERE user_id = ${userId} ORDER BY created_at`;
  let added = 0;
  for (const item of list) {
    try {
      const product = await resolveProduct(deps, item.product_id as string);
      if (product) { await addProductToJob(deps, userId, job, product, item.quantity as number); added++; }
      await deps.sql`DELETE FROM next_booking_products WHERE user_id = ${userId} AND product_id = ${item.product_id}`;
    } catch (e) {
      if (e instanceof HttpError && e.code === 'PRODUCT_ALREADY_ADDED') { await deps.sql`DELETE FROM next_booking_products WHERE user_id = ${userId} AND product_id = ${item.product_id}`; continue; }
      break; // Urable hiccup: keep the rest for the next check
    }
  }
  return added;
}
