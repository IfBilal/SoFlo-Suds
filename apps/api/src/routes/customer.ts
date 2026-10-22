import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { getUser } from '../auth.js';
import { UrableClient, type UrableJob, type UrableVehicle } from '../urable/client.js';

function urable() { return new UrableClient(process.env.URABLE_API_KEY ?? '', process.env.URABLE_BASE_URL); }
function simpleVehicle(v: UrableVehicle) {
  const match = /^(\d{4})\s+(.+)$/.exec(v.name);
  const nameParts = match?.[2].split(/\s+/) ?? [];
  return {
    id: v.id, name: v.name,
    year: match ? Number(match[1]) : undefined,
    make: nameParts[0] || undefined,
    model: nameParts.slice(1).join(' ') || undefined,
    color: /(?:^|;)\s*Color:\s*([^;]+)/i.exec(v.notes ?? '')?.[1]?.trim(),
    plate: /(?:^|;)\s*Plate:\s*([^;]+)/i.exec(v.notes ?? '')?.[1]?.trim(),
  };
}
function booking(job: UrableJob, vehicles: UrableVehicle[]) {
  const vehicle = vehicles.find(v => job.itemRefs?.some(ref => ref === v.id || ref.endsWith('/' + v.id)));
  return { id: job.id, serviceName: job.name || `Job ${job.num ?? ''}`.trim(), vehicleName: vehicle?.name ?? 'Vehicle', scheduledAt: job.start ? new Date(job.start).toISOString() : '', status: job.status, paymentStatus: job.paymentStatus, location: job.type === 'field' ? 'Mobile service' : 'In-shop service' };
}
export async function customerRoutes(app: FastifyInstance) {
  app.get('/config', async () => {
    const rows = await db().query("SELECT key,value FROM settings WHERE key=ANY($1)", [['shop_address','shop_phone','shop_email','mobile_area_text','min_app_version','shop_timezone']]);
    const settings = Object.fromEntries(rows.rows.map(r => [r.key,r.value]));
    return { shopAddress: settings.shop_address ?? process.env.SHOP_ADDRESS ?? null, shopPhone: settings.shop_phone ?? process.env.SHOP_PHONE ?? null, shopEmail: settings.shop_email ?? process.env.SHOP_EMAIL ?? null, mobileAreaText: settings.mobile_area_text ?? process.env.MOBILE_AREA_TEXT ?? null, minAppVersion: settings.min_app_version ?? null, shopTimezone: settings.shop_timezone ?? 'America/New_York' };
  });
  app.get('/services', async request => {
    await getUser(request);
    const products = await urable().listServices();
    return products.map(p => ({ id: p.id, name: p.name, category: p.categoryName || 'Services', description: undefined, priceCents: p.prices?.[0]?.value, durationMinutes: undefined }));
  });
  app.put('/me/push-token', async request => {
    const user = await getUser(request);
    const input = z.object({ token: z.string().min(20).max(300), platform: z.enum(['ios','android']) }).parse(request.body);
    await db().query('INSERT INTO push_tokens (token,user_id,platform) VALUES ($1,$2,$3) ON CONFLICT (token) DO UPDATE SET user_id=EXCLUDED.user_id,platform=EXCLUDED.platform', [input.token,user.id,input.platform]);
    return { ok: true };
  });
  app.get('/services/:id', async (request, reply) => {
    await getUser(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const product = (await urable().listServices()).find(x => x.id === id);
    if (!product) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Service not found.' } });
    return { id: product.id, name: product.name, category: product.categoryName || 'Services', priceCents: product.prices?.[0]?.value };
  });
  app.get('/vehicles', async request => {
    const user = await getUser(request);
    return (await urable().listVehicles(user.urableCustomerId)).map(simpleVehicle);
  });
  app.post('/vehicles', async (request, reply) => {
    const user = await getUser(request);
    const input = z.object({ make: z.string().trim().min(1).max(50), model: z.string().trim().min(1).max(50), year: z.number().int().min(1900).max(new Date().getFullYear() + 1), color: z.string().trim().min(1).max(50), plate: z.string().trim().max(20).optional() }).parse(request.body);
    const name = `${input.year} ${input.make} ${input.model}`;
    const id = await urable().createVehicle({ customerId: user.urableCustomerId, name, notes: `Color: ${input.color}${input.plate ? `; Plate: ${input.plate}` : ''}` });
    return reply.code(201).send({ id, name, year: input.year, color: input.color });
  });
  app.patch('/vehicles/:id', async (request, reply) => {
    const user = await getUser(request); const { id } = z.object({ id: z.string() }).parse(request.params);
    const input = z.object({ make: z.string().trim().min(1).max(50), model: z.string().trim().min(1).max(50), year: z.number().int().min(1900).max(new Date().getFullYear() + 1), color: z.string().trim().min(1).max(50), plate: z.string().trim().max(20).optional() }).parse(request.body);
    const vehicle = (await urable().listVehicles(user.urableCustomerId)).find(v => v.id === id);
    if (!vehicle) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Vehicle not found.' } });
    const name = `${input.year} ${input.make} ${input.model}`;
    await urable().updateVehicle(id, { name, notes: `Color: ${input.color}${input.plate ? `; Plate: ${input.plate}` : ''}` });
    return { id, name, year: input.year, color: input.color };
  });
  app.delete('/vehicles/:id', async (request, reply) => {
    const user = await getUser(request); const { id } = z.object({ id: z.string() }).parse(request.params);
    const client = urable();
    const [vehicles, jobs] = await Promise.all([client.listVehicles(user.urableCustomerId), client.listJobs(user.urableCustomerId)]);
    if (!vehicles.some(v => v.id === id)) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Vehicle not found.' } });
    if (jobs.some(j => j.itemRefs?.some(ref => ref === id || ref.endsWith('/' + id)) && !['completed','canceled','cancelled'].includes(j.status.toLowerCase()))) return reply.code(409).send({ error: { code: 'VEHICLE_HAS_BOOKING', message: 'This vehicle has an upcoming booking.' } });
    await client.deleteVehicle(id); return { ok: true };
  });
  app.get('/bookings', async request => {
    const user = await getUser(request); const client = urable();
    const [jobs, vehicles] = await Promise.all([client.listJobs(user.urableCustomerId), client.listVehicles(user.urableCustomerId)]);
    return jobs.filter(j => j.customerRef === user.urableCustomerId || j.customerRef?.endsWith('/' + user.urableCustomerId)).map(j => booking(j, vehicles));
  });
  app.get('/bookings/:id', async (request, reply) => {
    const user = await getUser(request); const { id } = z.object({ id: z.string() }).parse(request.params);
    const [job, vehicles] = await Promise.all([urable().getJob(id), urable().listVehicles(user.urableCustomerId)]);
    if (job.customerRef !== user.urableCustomerId && !job.customerRef?.endsWith('/' + user.urableCustomerId)) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Booking not found.' } });
    return booking(job, vehicles);
  });
  app.post('/bookings/:id/cancel', async (request, reply) => {
    const user = await getUser(request); const { id } = z.object({ id: z.string() }).parse(request.params);
    const job = await urable().getJob(id);
    if (job.customerRef !== user.urableCustomerId && !job.customerRef?.endsWith('/' + user.urableCustomerId)) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Booking not found.' } });
    if (['completed','canceled','cancelled'].includes(job.status.toLowerCase())) return reply.code(409).send({ error: { code: 'CANCEL_NOT_ALLOWED', message: 'This booking cannot be cancelled in the app.' } });
    await urable().cancelJob(id); return { ok: true };
  });
  app.get('/rewards', async request => {
    const user = await getUser(request);
    const [balance, rewards, activity, redemptions] = await Promise.all([
      db().query('SELECT COALESCE(SUM(delta),0)::int AS points FROM points_ledger WHERE user_id=$1', [user.id]),
      db().query('SELECT id,name,description,points_cost AS "pointsCost" FROM rewards WHERE active=true ORDER BY points_cost'),
      db().query('SELECT id,reason AS label,delta,created_at AS "createdAt" FROM points_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [user.id]),
      db().query('SELECT rr.id,rr.code,rr.status,r.name FROM reward_redemptions rr JOIN rewards r ON r.id=rr.reward_id WHERE rr.user_id=$1 ORDER BY rr.created_at DESC', [user.id]),
    ]);
    return { points: balance.rows[0].points, rewards: rewards.rows, activity: activity.rows, redemptions: redemptions.rows, referralCode: user.referralCode };
  });
  app.post('/rewards/:id/redeem', async (request, reply) => {
    const user = await getUser(request); const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const client = await db().connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [user.id]);
      const reward = await client.query('SELECT id,name,points_cost FROM rewards WHERE id=$1 AND active=true', [id]);
      if (!reward.rows[0]) { await client.query('ROLLBACK'); return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Reward not found.' } }); }
      const balance = await client.query('SELECT COALESCE(SUM(delta),0)::int AS points FROM points_ledger WHERE user_id=$1', [user.id]);
      if (balance.rows[0].points < reward.rows[0].points_cost) { await client.query('ROLLBACK'); return reply.code(409).send({ error: { code: 'INSUFFICIENT_POINTS', message: 'More points are needed to redeem this reward.' } }); }
      const code = randomBytes(8).toString('hex').toUpperCase();
      const redemption = await client.query('INSERT INTO reward_redemptions (user_id,reward_id,code) VALUES ($1,$2,$3) RETURNING id,code,status', [user.id, id, code]);
      await client.query('INSERT INTO points_ledger (user_id,delta,reason,source_key) VALUES ($1,$2,$3,$4)', [user.id, -reward.rows[0].points_cost, 'redeem', redemption.rows[0].id]);
      await client.query('COMMIT');
      return { ...redemption.rows[0], rewardName: reward.rows[0].name };
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  });
  app.get('/payments', async request => {
    const user = await getUser(request);
    return (await urable().listPayments(user.urableCustomerId)).filter(p => p.customerRef === user.urableCustomerId || p.customerRef?.endsWith('/' + user.urableCustomerId)).map(p => ({ id: p.id, status: p.status, totalCents: p.total, jobIds: p.jobOrderRefs }));
  });
  app.get('/me/points', async request => { const user = await getUser(request); const result = await db().query('SELECT COALESCE(SUM(delta),0)::int AS points FROM points_ledger WHERE user_id=$1', [user.id]); return result.rows[0]; });
  app.get('/me/referral', async request => { const user = await getUser(request); const result = await db().query('SELECT status,count(*)::int AS count FROM referrals WHERE referrer_id=$1 GROUP BY status', [user.id]); return { code: user.referralCode, stats: result.rows }; });
  app.get('/protection', async request => {
    const user = await getUser(request);
    const query = z.object({ vehicleId: z.string().optional() }).parse(request.query);
    const client = urable();
    const [vehicles,jobs,services,warranties,categories] = await Promise.all([
      client.listVehicles(user.urableCustomerId),client.listJobs(user.urableCustomerId),client.listAllServices(),
      db().query('SELECT id,urable_vehicle_id,urable_job_id,product,coverage,applied_on AS "appliedOn",expires_on AS "expiresOn" FROM warranties WHERE urable_customer_id=$1', [user.urableCustomerId]),
      db().query("SELECT value FROM settings WHERE key='protection_categories'"),
    ]);
    const allowed = new Set(vehicles.map(v => v.id));
    if (query.vehicleId && !allowed.has(query.vehicleId)) return [];
    const names: string[] = Array.isArray(categories.rows[0]?.value) ? categories.rows[0].value.map((x: unknown) => String(x).toLowerCase()) : [];
    const productMap = new Map(services.map(x => [x.id,x]));
    const records: Array<{id:string;vehicleName:string;serviceName:string;appliedOn:string;product?:string;coverage?:string;expiresOn?:string}> = [];
    const usedWarranties = new Set<string>();
    for (const job of jobs) {
      if (job.status.toLowerCase() !== 'completed') continue;
      if (job.customerRef !== user.urableCustomerId && !job.customerRef?.endsWith('/'+user.urableCustomerId)) continue;
      for (const [itemRef,lines] of Object.entries(job.invoice?.items ?? {})) {
        const itemId = itemRef.split('/').at(-1) ?? '';
        if (!allowed.has(itemId) || (query.vehicleId && itemId !== query.vehicleId)) continue;
        const vehicle = vehicles.find(v => v.id === itemId);
        for (const line of lines) {
          const raw = line.service?.id ?? line.product?.id ?? line.productServiceId ?? line.productServiceRef ?? line.productRef;
          const productId = typeof raw === 'string' ? raw.split('/').at(-1) ?? '' : '';
          const service = productMap.get(productId);
          if (!service) continue;
          const text = (service.categoryName ?? service.name).toLowerCase();
          if (!names.some(name => text.includes(name))) continue;
          const warranty = warranties.rows.find(w => w.urable_job_id === job.id && w.urable_vehicle_id === itemId);
          if (warranty) usedWarranties.add(warranty.id);
          const timestamp = job.completedAt ?? job.start;
          const appliedOn = warranty?.appliedOn ?? (timestamp !== undefined ? new Date(timestamp).toISOString() : null);
          if (!appliedOn) continue;
          records.push({ id:`${job.id}:${productId}:${itemId}`,vehicleName:vehicle?.name ?? 'Vehicle',serviceName:service.name,appliedOn,product:warranty?.product ?? undefined,coverage:warranty?.coverage ?? undefined,expiresOn:warranty?.expiresOn ?? undefined });
        }
      }
    }
    for (const warranty of warranties.rows) {
      if (usedWarranties.has(warranty.id) || !allowed.has(warranty.urable_vehicle_id) || (query.vehicleId && warranty.urable_vehicle_id !== query.vehicleId)) continue;
      records.push({id:warranty.id,vehicleName:vehicles.find(v=>v.id===warranty.urable_vehicle_id)?.name ?? 'Vehicle',serviceName:'Protection record',appliedOn:warranty.appliedOn,product:warranty.product ?? undefined,coverage:warranty.coverage ?? undefined,expiresOn:warranty.expiresOn ?? undefined});
    }
    return records.sort((a,b)=>new Date(b.appliedOn).getTime()-new Date(a.appliedOn).getTime());
  });
  app.get('/shop/products', async request => {
    await getUser(request);
    const products = (await urable().listShopProducts()).filter(x => !/gift\s*cards?/i.test(x.name));
    if (products.length) return products.map(x => ({ id: x.id, name: x.name, category: x.categoryName, priceCents: x.prices?.[0]?.value }));
    const rows = await db().query('SELECT id,name,brand,category,description,price_cents AS "priceCents" FROM shop_products WHERE active=true ORDER BY name');
    return rows.rows;
  });
  app.get('/gallery', async request => {
    await getUser(request);
    const rows = await db().query('SELECT id,title,caption,tag,before_path AS "beforeUrl",after_path AS "afterUrl" FROM gallery WHERE published=true ORDER BY display_order,created_at DESC');
    return rows.rows;
  });
  app.get('/reviews', async request => {
    await getUser(request);
    const rows = await db().query('SELECT r.id,r.rating,r.body,r.created_at AS "createdAt",u.name AS "customerName" FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.visible=true ORDER BY r.created_at DESC LIMIT 100');
    return rows.rows;
  });
  app.post('/bookings/:id/review', async (request, reply) => {
    const user = await getUser(request); const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
    const input = z.object({ rating: z.number().int().min(1).max(5), body: z.string().trim().max(1000).optional() }).parse(request.body);
    const job = await urable().getJob(id);
    if (job.customerRef !== user.urableCustomerId && !job.customerRef?.endsWith('/' + user.urableCustomerId)) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Booking not found.' } });
    if (job.status.toLowerCase() !== 'completed') return reply.code(409).send({ error: { code: 'REVIEW_NOT_ALLOWED', message: 'You can review a completed service.' } });
    const body = input.body?.replace(/<[^>]*>/g,'') ?? null;
    const row = await db().query('INSERT INTO reviews (user_id,urable_job_id,rating,body) VALUES ($1,$2,$3,$4) ON CONFLICT (urable_job_id) DO NOTHING RETURNING id', [user.id,id,input.rating,body]);
    if (!row.rowCount) return reply.code(409).send({ error: { code: 'REVIEW_EXISTS', message: 'This service already has a review.' } });
    return reply.code(201).send(row.rows[0]);
  });
}
