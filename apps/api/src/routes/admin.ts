import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { createAdminToken, getAdmin, passwordMatches } from '../auth.js';
import { sendPushToUser } from '../notifications/push.js';
import { createClient } from '@supabase/supabase-js';
import { UrableClient } from '../urable/client.js';

const uuid = z.object({ id: z.uuid() });
const promoSchema = z.object({ code: z.string().trim().min(3).max(32).transform(x => x.toUpperCase()), kind: z.enum(['percent','fixed']), value: z.number().positive(), minOrderUsd: z.number().nonnegative().default(0), firstBookingOnly: z.boolean().default(false), maxUsesPerUser: z.number().int().positive().nullable().default(null), maxTotalUses: z.number().int().positive().nullable().default(null), startsAt: z.string().nullable().default(null), endsAt: z.string().nullable().default(null), active: z.boolean().default(true) });
const rewardSchema = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(500).nullable().default(null), pointsCost: z.number().int().positive(), active: z.boolean().default(true) });
const gallerySchema = z.object({ title: z.string().trim().min(2).max(150), caption: z.string().trim().max(1000).nullable().default(null), tag: z.string().trim().max(80).nullable().default(null), beforeUrl: z.url().startsWith('https://'), afterUrl: z.url().startsWith('https://'), displayOrder: z.number().int().default(0), published: z.boolean().default(false) });
const warrantySchema = z.object({ urableCustomerId: z.string().min(1), urableVehicleId: z.string().min(1), urableJobId: z.string().min(1), product: z.string().trim().max(120).nullable().default(null), coverage: z.string().trim().max(500).nullable().default(null), appliedOn: z.iso.date(), expiresOn: z.iso.date().nullable().default(null), documentUrl: z.url().startsWith('https://').nullable().default(null) }).refine(x => !x.expiresOn || x.expiresOn >= x.appliedOn, { path: ['expiresOn'], message: 'Expiry must be after application.' });
const productSchema = z.object({ name: z.string().trim().min(2).max(120), brand: z.string().trim().max(80).nullable().default(null), category: z.string().trim().max(80).nullable().default(null), description: z.string().trim().max(1000).nullable().default(null), priceCents: z.number().int().nonnegative(), urableProductId: z.string().trim().nullable().default(null), imageUrl: z.url().startsWith('https://').nullable().default(null), active: z.boolean().default(true) });
const settingsKeys = ['shop_address','shop_phone','shop_email','mobile_area_text','reminder_hour_local','min_app_version','points_per_usd','referral_reward_points','shop_timezone','protection_categories'] as const;
const settingsSchema = z.object({
  shop_address: z.string().trim().max(300).optional(),
  shop_phone: z.string().trim().max(40).optional(),
  shop_email: z.union([z.email(),z.literal('')]).optional(),
  mobile_area_text: z.string().trim().max(300).optional(),
  reminder_hour_local: z.coerce.number().int().min(0).max(23).optional(),
  min_app_version: z.string().trim().max(30).optional(),
  points_per_usd: z.coerce.number().nonnegative().max(100).optional(),
  referral_reward_points: z.coerce.number().int().nonnegative().max(100000).optional(),
  shop_timezone: z.string().trim().refine(x => { try { new Intl.DateTimeFormat('en-US',{timeZone:x}); return true; } catch { return false; } },'Use a valid IANA timezone.').optional(),
  protection_categories: z.union([z.array(z.string().trim().min(1)),z.string().transform(x => { try { return JSON.parse(x) as unknown; } catch { return x.split(',').map(y => y.trim()).filter(Boolean); } }).pipe(z.array(z.string().trim().min(1)))]).optional(),
}).strict();
async function audit(adminId: string, action: string, entity: string, id?: string) { await db().query('INSERT INTO admin_audit (admin_id,action,entity,entity_id) VALUES ($1,$2,$3,$4)', [adminId, action, entity, id ?? null]); }
async function verifyWarranty(x: z.infer<typeof warrantySchema>) {
  const client = new UrableClient(process.env.URABLE_API_KEY ?? '',process.env.URABLE_BASE_URL);
  const [job,vehicles] = await Promise.all([client.getJob(x.urableJobId),client.listVehicles(x.urableCustomerId)]);
  if ((job.customerRef !== x.urableCustomerId && !job.customerRef?.endsWith('/'+x.urableCustomerId)) || !vehicles.some(v=>v.id===x.urableVehicleId) || !job.itemRefs?.some(ref=>ref===x.urableVehicleId||ref.endsWith('/'+x.urableVehicleId))) throw Object.assign(new Error('The job, customer and vehicle must match in Urable.'),{statusCode:400,code:'VALIDATION_FAILED'});
  if (job.status.toLowerCase() !== 'completed') throw Object.assign(new Error('Protection records require a completed job.'),{statusCode:400,code:'VALIDATION_FAILED'});
}

export async function adminRoutes(app: FastifyInstance) {
  app.post('/admin/uploads/gallery', async (request, reply) => {
    const admin = await getAdmin(request);
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return reply.code(503).send({ error: { code: 'STORAGE_UNAVAILABLE', message: 'Gallery storage is not configured.' } });
    const file = await request.file();
    if (!file || !['image/jpeg','image/png','image/webp'].includes(file.mimetype)) return reply.code(400).send({ error: { code: 'VALIDATION_FAILED', message: 'Choose a JPEG, PNG or WebP photo.' } });
    const ext = file.mimetype === 'image/jpeg' ? 'jpg' : file.mimetype === 'image/png' ? 'png' : 'webp';
    const path = `${randomUUID()}.${ext}`;
    const storage = createClient(url,key,{auth:{persistSession:false}}).storage.from('gallery');
    const uploaded = await storage.upload(path,await file.toBuffer(),{contentType:file.mimetype,upsert:false});
    if (uploaded.error) return reply.code(502).send({ error: { code: 'STORAGE_UNAVAILABLE', message: 'Photo upload failed.' } });
    await audit(admin,'upload','gallery_photo',path);
    return reply.code(201).send({ url: storage.getPublicUrl(path).data.publicUrl });
  });
  app.post('/admin/login', async (request, reply) => {
    const input = z.object({ email: z.email().transform(x => x.toLowerCase()), password: z.string().min(1) }).parse(request.body);
    const result = await db().query('SELECT id,email,password_hash FROM admins WHERE email=$1 AND active=true', [input.email]);
    const admin = result.rows[0];
    if (!admin || !await passwordMatches(input.password, admin.password_hash)) return reply.code(401).send({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
    return { accessToken: await createAdminToken(admin.id), admin: { id: admin.id, email: admin.email } };
  });
  app.get('/admin/dashboard', async request => {
    await getAdmin(request);
    const result = await db().query(`SELECT
      (SELECT count(*)::int FROM users WHERE deleted_at IS NULL) AS users,
      (SELECT count(*)::int FROM job_sync WHERE created_at >= date_trunc('week', now())) AS "bookingsThisWeek",
      (SELECT COALESCE(sum(delta),0)::int FROM points_ledger WHERE delta > 0) AS "pointsIssued",
      (SELECT count(*)::int FROM promo_codes WHERE active AND (starts_at IS NULL OR starts_at<=now()) AND (ends_at IS NULL OR ends_at>=now())) AS "activePromos"`);
    return result.rows[0];
  });
  app.get('/admin/customers', async request => {
    await getAdmin(request);
    const { q } = z.object({ q: z.string().trim().max(100).default('') }).parse(request.query);
    if (q.length < 2) return [];
    const result = await db().query('SELECT id,name,email,urable_customer_id AS "urableCustomerId" FROM users WHERE deleted_at IS NULL AND (name ILIKE $1 OR email ILIKE $1) ORDER BY name LIMIT 30', [`%${q}%`]);
    return result.rows;
  });
  app.get('/admin/customers/:id/vehicles', async request => {
    await getAdmin(request); const { id } = uuid.parse(request.params);
    const row = await db().query('SELECT urable_customer_id FROM users WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!row.rows[0]) return [];
    return new UrableClient(process.env.URABLE_API_KEY ?? '',process.env.URABLE_BASE_URL).listVehicles(row.rows[0].urable_customer_id);
  });
  app.get('/admin/customers/:id/jobs', async request => {
    await getAdmin(request); const { id } = uuid.parse(request.params);
    const row = await db().query('SELECT urable_customer_id FROM users WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!row.rows[0]) return [];
    const customerId: string = row.rows[0].urable_customer_id;
    const jobs = await new UrableClient(process.env.URABLE_API_KEY ?? '',process.env.URABLE_BASE_URL).listJobs(customerId);
    return jobs.filter(job => job.customerRef === customerId || job.customerRef?.endsWith('/'+customerId)).map(job => ({
      id: job.id, name: job.name || `Job ${job.num ?? ''}`.trim(), status: job.status,
      vehicleId: job.itemRefs?.[0]?.split('/').at(-1) ?? null, scheduledAt: job.start ?? null,
    }));
  });
  app.get('/admin/promos', async request => { await getAdmin(request); return (await db().query('SELECT p.id,p.code,p.kind,p.value,p.min_order_usd AS "minOrderUsd",p.first_booking_only AS "firstBookingOnly",p.max_uses_per_user AS "maxUsesPerUser",p.max_total_uses AS "maxTotalUses",p.starts_at AS "startsAt",p.ends_at AS "endsAt",p.active,(SELECT count(*)::int FROM promo_uses u WHERE u.promo_id=p.id AND u.status=\'applied\') AS uses FROM promo_codes p ORDER BY p.created_at DESC')).rows; });
  app.post('/admin/promos', async (request, reply) => { const admin = await getAdmin(request); const x = promoSchema.parse(request.body); const r = await db().query('INSERT INTO promo_codes (code,kind,value,min_order_usd,first_booking_only,max_uses_per_user,max_total_uses,starts_at,ends_at,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id', [x.code,x.kind,x.value,x.minOrderUsd,x.firstBookingOnly,x.maxUsesPerUser,x.maxTotalUses,x.startsAt,x.endsAt,x.active]); await audit(admin,'create','promo',r.rows[0].id); return reply.code(201).send(r.rows[0]); });
  app.patch('/admin/promos/:id', async (request, reply) => { const admin = await getAdmin(request); const { id } = uuid.parse(request.params); const x = promoSchema.parse(request.body); const r = await db().query('UPDATE promo_codes SET code=$2,kind=$3,value=$4,min_order_usd=$5,first_booking_only=$6,max_uses_per_user=$7,max_total_uses=$8,starts_at=$9,ends_at=$10,active=$11 WHERE id=$1 RETURNING id', [id,x.code,x.kind,x.value,x.minOrderUsd,x.firstBookingOnly,x.maxUsesPerUser,x.maxTotalUses,x.startsAt,x.endsAt,x.active]); if (!r.rowCount) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Promo not found.' } }); await audit(admin,'update','promo',id); return r.rows[0]; });
  app.get('/admin/rewards', async request => { await getAdmin(request); return (await db().query('SELECT id,name,description,points_cost AS "pointsCost",active FROM rewards ORDER BY points_cost')).rows; });
  app.post('/admin/rewards', async (request, reply) => { const admin = await getAdmin(request); const x = rewardSchema.parse(request.body); const r = await db().query('INSERT INTO rewards (name,description,points_cost,active) VALUES ($1,$2,$3,$4) RETURNING id', [x.name,x.description,x.pointsCost,x.active]); await audit(admin,'create','reward',r.rows[0].id); return reply.code(201).send(r.rows[0]); });
  app.patch('/admin/rewards/:id', async (request, reply) => { const admin = await getAdmin(request); const { id } = uuid.parse(request.params); const x = rewardSchema.parse(request.body); const r = await db().query('UPDATE rewards SET name=$2,description=$3,points_cost=$4,active=$5 WHERE id=$1 RETURNING id', [id,x.name,x.description,x.pointsCost,x.active]); if (!r.rowCount) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Reward not found.' } }); await audit(admin,'update','reward',id); return r.rows[0]; });
  app.get('/admin/redemptions', async request => { await getAdmin(request); return (await db().query('SELECT rr.id,rr.code,rr.status,rr.created_at AS "createdAt",r.name AS "rewardName",u.email AS "customerEmail" FROM reward_redemptions rr JOIN rewards r ON r.id=rr.reward_id JOIN users u ON u.id=rr.user_id ORDER BY rr.created_at DESC LIMIT 300')).rows; });
  app.post('/admin/redemptions/:id/use', async (request, reply) => { const admin = await getAdmin(request); const { id } = uuid.parse(request.params); const r = await db().query("UPDATE reward_redemptions SET status='used',used_at=now() WHERE id=$1 AND status='available' RETURNING id", [id]); if (!r.rowCount) return reply.code(409).send({ error: { code: 'REDEMPTION_NOT_AVAILABLE', message: 'This reward is already used or cancelled.' } }); await audit(admin,'use','redemption',id); return { ok: true }; });
  app.get('/admin/referrals', async request => { await getAdmin(request); return (await db().query('SELECT r.id,r.status,r.reject_reason AS "rejectReason",r.qualifying_job_id AS "qualifyingJobId",r.created_at AS "createdAt",a.email AS "referrerEmail",b.email AS "refereeEmail" FROM referrals r JOIN users a ON a.id=r.referrer_id JOIN users b ON b.id=r.referee_id ORDER BY r.created_at DESC LIMIT 300')).rows; });
  app.get('/admin/reviews', async request => { await getAdmin(request); return (await db().query('SELECT r.id,r.rating,r.body,r.visible,r.urable_job_id AS "jobId",r.created_at AS "createdAt",u.name AS "customerName" FROM reviews r JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 300')).rows; });
  app.patch('/admin/reviews/:id', async (request, reply) => { const admin = await getAdmin(request); const { id } = uuid.parse(request.params); const { visible } = z.object({ visible: z.boolean() }).parse(request.body); const r = await db().query('UPDATE reviews SET visible=$2 WHERE id=$1 RETURNING id', [id, visible]); if (!r.rowCount) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Review not found.' } }); await audit(admin,visible?'show':'hide','review',id); return { ok: true }; });
  app.get('/admin/gallery', async request => { await getAdmin(request); return (await db().query('SELECT id,title,caption,tag,before_path AS "beforeUrl",after_path AS "afterUrl",display_order AS "displayOrder",published FROM gallery ORDER BY display_order,created_at DESC')).rows; });
  app.post('/admin/gallery', async (request, reply) => { const admin = await getAdmin(request); const x = gallerySchema.parse(request.body); const r = await db().query('INSERT INTO gallery (title,caption,tag,before_path,after_path,display_order,published) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', [x.title,x.caption,x.tag,x.beforeUrl,x.afterUrl,x.displayOrder,x.published]); await audit(admin,'create','gallery',r.rows[0].id); return reply.code(201).send(r.rows[0]); });
  app.patch('/admin/gallery/:id', async (request, reply) => { const admin = await getAdmin(request); const { id } = uuid.parse(request.params); const x = gallerySchema.parse(request.body); const r = await db().query('UPDATE gallery SET title=$2,caption=$3,tag=$4,before_path=$5,after_path=$6,display_order=$7,published=$8 WHERE id=$1 RETURNING id', [id,x.title,x.caption,x.tag,x.beforeUrl,x.afterUrl,x.displayOrder,x.published]); if (!r.rowCount) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Gallery item not found.' } }); await audit(admin,'update','gallery',id); return r.rows[0]; });
  app.get('/admin/protection', async request => { await getAdmin(request); return (await db().query('SELECT id,urable_customer_id AS "urableCustomerId",urable_vehicle_id AS "urableVehicleId",urable_job_id AS "urableJobId",product,coverage,applied_on AS "appliedOn",expires_on AS "expiresOn",document_path AS "documentUrl" FROM warranties ORDER BY applied_on DESC LIMIT 300')).rows; });
  app.post('/admin/protection', async (request, reply) => { const admin = await getAdmin(request); const x = warrantySchema.parse(request.body); await verifyWarranty(x); const r = await db().query('INSERT INTO warranties (urable_customer_id,urable_vehicle_id,urable_job_id,product,coverage,applied_on,expires_on,document_path) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [x.urableCustomerId,x.urableVehicleId,x.urableJobId,x.product,x.coverage,x.appliedOn,x.expiresOn,x.documentUrl]); await audit(admin,'create','warranty',r.rows[0].id); return reply.code(201).send(r.rows[0]); });
  app.patch('/admin/protection/:id', async (request, reply) => { const admin = await getAdmin(request); const { id } = uuid.parse(request.params); const x = warrantySchema.parse(request.body); await verifyWarranty(x); const r = await db().query('UPDATE warranties SET urable_customer_id=$2,urable_vehicle_id=$3,urable_job_id=$4,product=$5,coverage=$6,applied_on=$7,expires_on=$8,document_path=$9 WHERE id=$1 RETURNING id', [id,x.urableCustomerId,x.urableVehicleId,x.urableJobId,x.product,x.coverage,x.appliedOn,x.expiresOn,x.documentUrl]); if (!r.rowCount) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Warranty not found.' } }); await audit(admin,'update','warranty',id); return r.rows[0]; });
  app.get('/admin/shop-products', async request => { await getAdmin(request); return (await db().query('SELECT id,name,brand,category,description,price_cents AS "priceCents",urable_product_id AS "urableProductId",image_path AS "imageUrl",active FROM shop_products ORDER BY name')).rows; });
  app.post('/admin/shop-products', async (request, reply) => { const admin = await getAdmin(request); const x = productSchema.parse(request.body); const r = await db().query('INSERT INTO shop_products (name,brand,category,description,price_cents,urable_product_id,image_path,active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [x.name,x.brand,x.category,x.description,x.priceCents,x.urableProductId,x.imageUrl,x.active]); await audit(admin,'create','shop_product',r.rows[0].id); return reply.code(201).send(r.rows[0]); });
  app.patch('/admin/shop-products/:id', async (request, reply) => { const admin = await getAdmin(request); const { id } = uuid.parse(request.params); const x = productSchema.parse(request.body); const r = await db().query('UPDATE shop_products SET name=$2,brand=$3,category=$4,description=$5,price_cents=$6,urable_product_id=$7,image_path=$8,active=$9 WHERE id=$1 RETURNING id', [id,x.name,x.brand,x.category,x.description,x.priceCents,x.urableProductId,x.imageUrl,x.active]); if (!r.rowCount) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Product not found.' } }); await audit(admin,'update','shop_product',id); return r.rows[0]; });
  app.get('/admin/settings', async request => { await getAdmin(request); return Object.fromEntries((await db().query('SELECT key,value FROM settings WHERE key=ANY($1)', [settingsKeys])).rows.map(r => [r.key,r.value])); });
  app.put('/admin/settings', async request => { const admin = await getAdmin(request); const body = settingsSchema.parse(request.body); const client = await db().connect(); try { await client.query('BEGIN'); for (const [key,value] of Object.entries(body)) await client.query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()', [key, JSON.stringify(value)]); await client.query('COMMIT'); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } await audit(admin,'update','settings'); return { ok: true }; });
  app.get('/admin/push', async request => { await getAdmin(request); return (await db().query("SELECT event_key AS id,title,body,count(*)::int AS recipients,max(sent_at) AS \"sentAt\" FROM notification_log WHERE event_key LIKE 'promo:%' GROUP BY event_key,title,body ORDER BY max(sent_at) DESC LIMIT 100")).rows; });
  app.post('/admin/push', async (request, reply) => {
    const admin = await getAdmin(request);
    const input = z.object({ title: z.string().trim().min(3).max(80), body: z.string().trim().min(3).max(200), deepLink: z.string().trim().regex(/^\/(bookings|rewards|protection|gallery|shop)(\/[^?#]*)?$/).optional() }).parse(request.body);
    const users = await db().query("SELECT u.id FROM users u WHERE u.deleted_at IS NULL AND u.notification_promos=true AND NOT EXISTS (SELECT 1 FROM notification_log n WHERE n.user_id=u.id AND n.event_key LIKE 'promo:%' AND n.sent_at>now()-interval '1 day')");
    const key = `promo:${randomUUID()}`;
    let sent=0,failed=0;
    for (const user of users.rows) { const result = await sendPushToUser(user.id,key,{title:input.title,body:input.body,data:input.deepLink?{deepLink:input.deepLink}:undefined},'promo'); if(result==='sent') sent++; if(result==='failed') failed++; }
    await audit(admin,'send','promo_push',key);
    return reply.code(202).send({ id:key, sent, failed });
  });
}
