import { z } from 'zod';
import type { Deps } from '../_shared/deps.ts';
import { requireAdmin } from '../_shared/session.ts';
import { HttpError, notFound } from '../_shared/errors.ts';
import { sendPushToUser } from '../_shared/push.ts';
import { ownsJob } from '../_shared/sync.ts';
import type { Ctx, Router } from './router.ts';
import { reply } from './router.ts';

const uuid = z.object({ id: z.uuid() });
const promoSchema = z.object({ code: z.string().trim().min(3).max(32).transform((x) => x.toUpperCase()), kind: z.enum(['percent', 'fixed']), value: z.number().positive(), minOrderUsd: z.number().nonnegative().default(0), firstBookingOnly: z.boolean().default(false), maxUsesPerUser: z.number().int().positive().nullable().default(null), maxTotalUses: z.number().int().positive().nullable().default(null), startsAt: z.string().nullable().default(null), endsAt: z.string().nullable().default(null), active: z.boolean().default(true) });
const rewardSchema = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(500).nullable().default(null), pointsCost: z.number().int().positive(), active: z.boolean().default(true) });
const gallerySchema = z.object({ title: z.string().trim().min(2).max(150), caption: z.string().trim().max(1000).nullable().default(null), tag: z.string().trim().max(80).nullable().default(null), beforeUrl: z.url().startsWith('https://'), afterUrl: z.url().startsWith('https://'), displayOrder: z.number().int().default(0), published: z.boolean().default(false) });
const warrantySchema = z.object({ urableCustomerId: z.string().min(1), urableVehicleId: z.string().min(1), urableJobId: z.string().min(1), product: z.string().trim().max(120).nullable().default(null), coverage: z.string().trim().max(500).nullable().default(null), appliedOn: z.iso.date(), expiresOn: z.iso.date().nullable().default(null), documentUrl: z.url().startsWith('https://').nullable().default(null) }).refine((x) => !x.expiresOn || x.expiresOn >= x.appliedOn, { path: ['expiresOn'], message: 'Expiry must be after application.' });
const productSchema = z.object({ name: z.string().trim().min(2).max(120), brand: z.string().trim().max(80).nullable().default(null), category: z.string().trim().max(80).nullable().default(null), description: z.string().trim().max(1000).nullable().default(null), priceCents: z.number().int().nonnegative(), urableProductId: z.string().trim().nullable().default(null), imageUrl: z.url().startsWith('https://').nullable().default(null), active: z.boolean().default(true) });
const settingsKeys = ['shop_address', 'shop_phone', 'shop_email', 'mobile_area_text', 'reminder_hour_local', 'min_app_version', 'maintenance_message', 'cancel_window_hours', 'points_per_usd', 'referral_reward_points', 'shop_timezone', 'protection_categories'];
const settingsSchema = z.object({
  shop_address: z.string().trim().max(300).optional(), shop_phone: z.string().trim().max(40).optional(),
  shop_email: z.union([z.email(), z.literal('')]).optional(), mobile_area_text: z.string().trim().max(300).optional(),
  reminder_hour_local: z.coerce.number().int().min(0).max(23).optional(), min_app_version: z.string().trim().max(30).optional(), maintenance_message: z.string().trim().max(300).optional(), cancel_window_hours: z.coerce.number().int().min(0).max(168).optional(),
  points_per_usd: z.coerce.number().nonnegative().max(100).optional(), referral_reward_points: z.coerce.number().int().nonnegative().max(100000).optional(),
  shop_timezone: z.string().trim().refine((x) => { try { new Intl.DateTimeFormat('en-US', { timeZone: x }); return true; } catch { return false; } }, 'Use a valid IANA timezone.').optional(),
  protection_categories: z.union([z.array(z.string().trim().min(1)), z.string().transform((x) => { try { return JSON.parse(x) as unknown; } catch { return x.split(',').map((y) => y.trim()).filter(Boolean); } }).pipe(z.array(z.string().trim().min(1)))]).optional(),
}).strict();

const audit = (deps: Deps, adminId: string, action: string, entity: string, id?: string) =>
  deps.sql`INSERT INTO admin_audit (admin_id, action, entity, entity_id) VALUES (${adminId}, ${action}, ${entity}, ${id ?? null})`;
const sniff = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 ? 'image/png'
  : b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 ? 'image/webp' : null;

async function verifyWarranty(deps: Deps, x: z.infer<typeof warrantySchema>) {
  const urable = deps.urable();
  const [job, vehicles] = await Promise.all([urable.getJob(x.urableJobId), urable.listVehicles(x.urableCustomerId)]);
  const bad = (m: string) => new HttpError(400, 'VALIDATION_FAILED', m);
  if (!ownsJob(job, x.urableCustomerId) || !vehicles.some((v) => v.id === x.urableVehicleId) || !job.itemRefs?.some((r) => r === x.urableVehicleId || r.endsWith('/' + x.urableVehicleId))) throw bad('The job, customer and vehicle must match in Urable.');
  if (job.status.toLowerCase() !== 'completed') throw bad('Protection records require a completed job.');
}

export function adminRoutes(app: Router) {
  /** Every handler resolves the verified Auth user to an ACTIVE admin row first. */
  const admin = (fn: (c: Ctx, adminId: string) => Promise<unknown>) => async (c: Ctx) => fn(c, await requireAdmin(c.req, c.deps));
  const listOf = (path: string, run: (deps: Deps) => Promise<unknown>) => app.get(path, admin(async (c) => run(c.deps)));
  /** create / update with the same shape: validate, write, audit, 201 / 404. */
  const crud = (path: string, entity: string, schema: z.ZodType<any>, // deno-lint-ignore no-explicit-any
    insert: (deps: Deps, x: any) => Promise<{ id: string }[]>, update: (deps: Deps, id: string, x: any) => Promise<{ id: string }[]>) => {
    app.post(path, admin(async (c, a) => { const [row] = await insert(c.deps, schema.parse(await c.json())); await audit(c.deps, a, 'create', entity, row.id); return reply(row, 201); }));
    app.patch(`${path}/:id`, admin(async (c, a) => {
      const { id } = uuid.parse(c.params); const [row] = await update(c.deps, id, schema.parse(await c.json()));
      if (!row) throw notFound(entity.replace('_', ' ')); await audit(c.deps, a, 'update', entity, id); return row;
    }));
  };

  app.get('/admin/me', admin(async (_c, id) => ({ id, role: 'admin' })));

  app.post('/admin/uploads/gallery', admin(async (c, a) => {
    const file = (await c.req.formData().catch(() => null))?.get('file');
    if (!(file instanceof File)) throw new HttpError(400, 'VALIDATION_FAILED', 'Choose a JPEG, PNG or WebP photo.');
    if (file.size > 10 * 1024 * 1024) throw new HttpError(400, 'VALIDATION_FAILED', 'Photos must be 10 MB or smaller.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniff(bytes); // trust the bytes, not the client-declared type
    if (!type) throw new HttpError(400, 'VALIDATION_FAILED', 'Choose a JPEG, PNG or WebP photo.');
    const path = `${crypto.randomUUID()}.${type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp'}`;
    const url = await c.deps.storage.uploadGallery(path, bytes, type);
    await audit(c.deps, a, 'upload', 'gallery_photo', path);
    return reply({ url }, 201);
  }));

  listOf('/admin/dashboard', async (d) => (await d.sql`SELECT
      (SELECT count(*)::int FROM users WHERE deleted_at IS NULL) AS users,
      (SELECT count(*)::int FROM job_sync WHERE created_at >= date_trunc('week', now())) AS "bookingsThisWeek",
      (SELECT COALESCE(sum(delta),0)::int FROM points_ledger WHERE delta > 0) AS "pointsIssued",
      (SELECT count(*)::int FROM promo_codes WHERE active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now())) AS "activePromos"`)[0]);
  app.get('/admin/customers', admin(async ({ deps, url }) => {
    const { q } = z.object({ q: z.string().trim().max(100).default('') }).parse(Object.fromEntries(url.searchParams));
    if (q.length < 2) return [];
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    return await deps.sql`SELECT id, name, email, urable_customer_id AS "urableCustomerId" FROM users WHERE deleted_at IS NULL AND (name ILIKE ${like} OR email ILIKE ${like}) ORDER BY name LIMIT 30`;
  }));
  const customerUrableId = async (deps: Deps, id: string) => (await deps.sql`SELECT urable_customer_id AS u FROM users WHERE id = ${id} AND deleted_at IS NULL`)[0]?.u as string | undefined;
  app.get('/admin/customers/:id/vehicles', admin(async ({ deps, params }) => {
    const u = await customerUrableId(deps, uuid.parse(params).id); return u ? await deps.urable().listVehicles(u) : [];
  }));
  app.get('/admin/customers/:id/jobs', admin(async ({ deps, params }) => {
    const u = await customerUrableId(deps, uuid.parse(params).id); if (!u) return [];
    return (await deps.urable().listJobs(u)).filter((j) => ownsJob(j, u)).map((j) => ({ id: j.id, name: j.name || `Job ${j.num ?? ''}`.trim(), status: j.status, vehicleId: j.itemRefs?.[0]?.split('/').at(-1) ?? null, scheduledAt: j.start ?? null }));
  }));

  listOf('/admin/promos', (d) => d.sql`SELECT p.id, p.code, p.kind, p.value::float AS value, p.min_order_usd::float AS "minOrderUsd", p.first_booking_only AS "firstBookingOnly", p.max_uses_per_user AS "maxUsesPerUser", p.max_total_uses AS "maxTotalUses", p.starts_at AS "startsAt", p.ends_at AS "endsAt", p.active, (SELECT count(*)::int FROM promo_uses u WHERE u.promo_id = p.id AND u.status = 'applied') AS uses FROM promo_codes p ORDER BY p.created_at DESC`);
  crud('/admin/promos', 'promo', promoSchema,
    (d, x) => d.sql`INSERT INTO promo_codes (code,kind,value,min_order_usd,first_booking_only,max_uses_per_user,max_total_uses,starts_at,ends_at,active) VALUES (${x.code},${x.kind},${x.value},${x.minOrderUsd},${x.firstBookingOnly},${x.maxUsesPerUser},${x.maxTotalUses},${x.startsAt},${x.endsAt},${x.active}) RETURNING id`,
    (d, id, x) => d.sql`UPDATE promo_codes SET code=${x.code},kind=${x.kind},value=${x.value},min_order_usd=${x.minOrderUsd},first_booking_only=${x.firstBookingOnly},max_uses_per_user=${x.maxUsesPerUser},max_total_uses=${x.maxTotalUses},starts_at=${x.startsAt},ends_at=${x.endsAt},active=${x.active} WHERE id=${id} RETURNING id`);

  listOf('/admin/rewards', (d) => d.sql`SELECT id, name, description, points_cost AS "pointsCost", active FROM rewards ORDER BY points_cost`);
  crud('/admin/rewards', 'reward', rewardSchema,
    (d, x) => d.sql`INSERT INTO rewards (name,description,points_cost,active) VALUES (${x.name},${x.description},${x.pointsCost},${x.active}) RETURNING id`,
    (d, id, x) => d.sql`UPDATE rewards SET name=${x.name},description=${x.description},points_cost=${x.pointsCost},active=${x.active} WHERE id=${id} RETURNING id`);
  listOf('/admin/redemptions', (d) => d.sql`SELECT rr.id, rr.code, rr.status, rr.applied_job_id AS "appliedJobId", rr.created_at AS "createdAt", r.name AS "rewardName", u.email AS "customerEmail" FROM reward_redemptions rr JOIN rewards r ON r.id = rr.reward_id JOIN users u ON u.id = rr.user_id ORDER BY rr.created_at DESC LIMIT 300`);
  app.post('/admin/redemptions/:id/use', admin(async ({ deps, params }, a) => {
    const { id } = uuid.parse(params);
    const [r] = await deps.sql`UPDATE reward_redemptions SET status='used', used_at=now() WHERE id=${id} AND status='available' RETURNING id`;
    if (!r) throw new HttpError(409, 'REDEMPTION_NOT_AVAILABLE', 'This reward is already used or cancelled.');
    await audit(deps, a, 'use', 'redemption', id); return { ok: true };
  }));
  listOf('/admin/referrals', (d) => d.sql`SELECT r.id, r.status, r.reject_reason AS "rejectReason", r.qualifying_job_id AS "qualifyingJobId", r.created_at AS "createdAt", a.email AS "referrerEmail", b.email AS "refereeEmail" FROM referrals r JOIN users a ON a.id = r.referrer_id JOIN users b ON b.id = r.referee_id ORDER BY r.created_at DESC LIMIT 300`);
  listOf('/admin/reviews', (d) => d.sql`SELECT r.id, r.rating, r.body, r.visible, r.urable_job_id AS "jobId", r.created_at AS "createdAt", u.name AS "customerName" FROM reviews r JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC LIMIT 300`);
  app.patch('/admin/reviews/:id', admin(async ({ deps, params, json }, a) => {
    const { id } = uuid.parse(params); const { visible } = z.object({ visible: z.boolean() }).parse(await json());
    const [r] = await deps.sql`UPDATE reviews SET visible=${visible} WHERE id=${id} RETURNING id`;
    if (!r) throw notFound('Review'); await audit(deps, a, visible ? 'show' : 'hide', 'review', id); return { ok: true };
  }));

  listOf('/admin/gallery', (d) => d.sql`SELECT id, title, caption, tag, before_path AS "beforeUrl", after_path AS "afterUrl", display_order AS "displayOrder", published FROM gallery ORDER BY display_order, created_at DESC`);
  crud('/admin/gallery', 'gallery', gallerySchema,
    (d, x) => d.sql`INSERT INTO gallery (title,caption,tag,before_path,after_path,display_order,published) VALUES (${x.title},${x.caption},${x.tag},${x.beforeUrl},${x.afterUrl},${x.displayOrder},${x.published}) RETURNING id`,
    (d, id, x) => d.sql`UPDATE gallery SET title=${x.title},caption=${x.caption},tag=${x.tag},before_path=${x.beforeUrl},after_path=${x.afterUrl},display_order=${x.displayOrder},published=${x.published} WHERE id=${id} RETURNING id`);

  listOf('/admin/protection', (d) => d.sql`SELECT id, urable_customer_id AS "urableCustomerId", urable_vehicle_id AS "urableVehicleId", urable_job_id AS "urableJobId", product, coverage, applied_on::text AS "appliedOn", expires_on::text AS "expiresOn", document_path AS "documentUrl" FROM warranties ORDER BY applied_on DESC LIMIT 300`);
  app.post('/admin/protection', admin(async ({ deps, json }, a) => {
    const x = warrantySchema.parse(await json()); await verifyWarranty(deps, x);
    const [r] = await deps.sql`INSERT INTO warranties (urable_customer_id,urable_vehicle_id,urable_job_id,product,coverage,applied_on,expires_on,document_path) VALUES (${x.urableCustomerId},${x.urableVehicleId},${x.urableJobId},${x.product},${x.coverage},${x.appliedOn},${x.expiresOn},${x.documentUrl}) RETURNING id`;
    await audit(deps, a, 'create', 'warranty', r.id); return reply(r, 201);
  }));
  app.patch('/admin/protection/:id', admin(async ({ deps, params, json }, a) => {
    const { id } = uuid.parse(params); const x = warrantySchema.parse(await json()); await verifyWarranty(deps, x);
    const [r] = await deps.sql`UPDATE warranties SET urable_customer_id=${x.urableCustomerId},urable_vehicle_id=${x.urableVehicleId},urable_job_id=${x.urableJobId},product=${x.product},coverage=${x.coverage},applied_on=${x.appliedOn},expires_on=${x.expiresOn},document_path=${x.documentUrl} WHERE id=${id} RETURNING id`;
    if (!r) throw notFound('Warranty'); await audit(deps, a, 'update', 'warranty', id); return r;
  }));

  listOf('/admin/shop-products', (d) => d.sql`SELECT id, name, brand, category, description, price_cents AS "priceCents", urable_product_id AS "urableProductId", image_path AS "imageUrl", active FROM shop_products ORDER BY name`);
  crud('/admin/shop-products', 'shop_product', productSchema,
    (d, x) => d.sql`INSERT INTO shop_products (name,brand,category,description,price_cents,urable_product_id,image_path,active) VALUES (${x.name},${x.brand},${x.category},${x.description},${x.priceCents},${x.urableProductId},${x.imageUrl},${x.active}) RETURNING id`,
    (d, id, x) => d.sql`UPDATE shop_products SET name=${x.name},brand=${x.brand},category=${x.category},description=${x.description},price_cents=${x.priceCents},urable_product_id=${x.urableProductId},image_path=${x.imageUrl},active=${x.active} WHERE id=${id} RETURNING id`);

  listOf('/admin/settings', async (d) => Object.fromEntries((await d.sql`SELECT key, value FROM settings WHERE key = ANY(${settingsKeys})`).map((r) => [r.key, r.value])));
  app.put('/admin/settings', admin(async ({ deps, json }, a) => {
    const body = settingsSchema.parse(await json());
    await deps.sql.begin(async (tx) => { for (const [key, value] of Object.entries(body)) await tx`INSERT INTO settings (key,value) VALUES (${key}, ${tx.json(value as never)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`; });
    await audit(deps, a, 'update', 'settings'); return { ok: true };
  }));

  listOf('/admin/push', (d) => d.sql`SELECT event_key AS id, title, body, count(*)::int AS recipients, max(sent_at) AS "sentAt" FROM notification_log WHERE event_key LIKE 'promo:%' GROUP BY event_key, title, body ORDER BY max(sent_at) DESC LIMIT 100`);
  app.post('/admin/push', admin(async ({ deps, json }, a) => {
    const input = z.object({ title: z.string().trim().min(3).max(80), body: z.string().trim().min(3).max(200), deepLink: z.string().trim().regex(/^\/(bookings|rewards|protection|gallery|shop)(\/[^?#]*)?$/).optional() }).parse(await json());
    // Opted-in customers who have not had a promo push in the last day (max one per day).
    const users = await deps.sql`SELECT u.id FROM users u WHERE u.deleted_at IS NULL AND u.notification_promos = true
      AND NOT EXISTS (SELECT 1 FROM notification_log n WHERE n.user_id = u.id AND n.event_key LIKE 'promo:%' AND n.sent_at > now() - interval '1 day')`;
    const key = `promo:${crypto.randomUUID()}`; let sent = 0, failed = 0;
    for (let i = 0; i < users.length; i += 10) {
      const results = await Promise.all(users.slice(i, i + 10).map((u) => sendPushToUser(deps, u.id as string, key, { title: input.title, body: input.body, data: input.deepLink ? { deepLink: input.deepLink } : undefined }, 'promo')));
      sent += results.filter((r) => r === 'sent').length; failed += results.filter((r) => r === 'failed').length;
    }
    await audit(deps, a, 'send', 'promo_push', key);
    return reply({ id: key, sent, failed }, 202);
  }));
}
