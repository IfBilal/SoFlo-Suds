import { z } from 'zod';
import type { Customer } from '../_shared/session.ts';
import { identify, requireCustomer } from '../_shared/session.ts';
import { HttpError, notFound } from '../_shared/errors.ts';
import { ownsJob, isDoneStatus } from '../_shared/sync.ts';
import { jobVehicleId, recordJob } from '../_shared/sync.ts';
import { findBookingHandoff } from '../_shared/booking-handoff.ts';
import type { UrableJob, UrableVehicle } from '../_shared/urable.ts';
import type { Router } from './router.ts';
import { reply } from './router.ts';
import { balance } from './account.ts';

const vehicleSchema = z.object({ make: z.string().trim().min(1).max(50), model: z.string().trim().min(1).max(50), year: z.number().int().min(1900).max(new Date().getFullYear() + 1), color: z.string().trim().min(1).max(50), plate: z.string().trim().max(20).optional() });
const notes = (x: z.infer<typeof vehicleSchema>) => `Color: ${x.color}${x.plate ? `; Plate: ${x.plate}` : ''}`;
const idParam = z.object({ id: z.string().min(1).max(200) });
const refMatches = (ref: string, id: string) => ref === id || ref.endsWith('/' + id);

function simpleVehicle(v: UrableVehicle) {
  const match = /^(\d{4})\s+(.+)$/.exec(v.name);
  const parts = match?.[2].split(/\s+/) ?? [];
  return {
    id: v.id, name: v.name, year: match ? Number(match[1]) : undefined, make: parts[0] || undefined, model: parts.slice(1).join(' ') || undefined,
    color: /(?:^|;)\s*Color:\s*([^;]+)/i.exec(v.notes ?? '')?.[1]?.trim(), plate: /(?:^|;)\s*Plate:\s*([^;]+)/i.exec(v.notes ?? '')?.[1]?.trim(),
  };
}
function booking(job: UrableJob, vehicles: UrableVehicle[]) {
  const vehicle = vehicles.find((v) => job.itemRefs?.some((ref) => refMatches(ref, v.id)));
  const line = Object.values(job.invoice?.items ?? {}).flat().find((i) => i.service?.id || i.productServiceId || i.productServiceRef);
  const serviceRef = line?.service?.id ?? line?.productServiceId ?? line?.productServiceRef;
  return {
    id: job.id, serviceId: serviceRef?.split('/').at(-1), vehicleId: vehicle?.id, serviceName: job.name || `Job ${job.num ?? ''}`.trim(), vehicleName: vehicle?.name ?? 'Vehicle',
    scheduledAt: job.start ? new Date(job.start).toISOString() : '', status: job.status, paymentStatus: job.paymentStatus, location: job.type === 'field' ? 'Mobile service' : 'In-shop service',
  };
}
/** Urable job -> only if it belongs to this customer; otherwise indistinguishable from "missing". */
async function ownedJob(c: { deps: import('../_shared/deps.ts').Deps }, user: Customer, id: string): Promise<UrableJob> {
  const job = await c.deps.urable().getJob(id).catch((e) => { if ((e as { status?: number }).status === 404) return null; throw e; });
  if (!job) throw notFound('Booking');
  if (!ownsJob(job, user.urableCustomerId)) {
    const [link] = await c.deps.sql`SELECT 1 FROM job_sync WHERE user_id = ${user.id} AND urable_job_id = ${id}`;
    if (!link) throw notFound('Booking');
  }
  return job;
}

export function customerRoutes(app: Router) {
  app.get('/services', async ({ req, deps }) => {
    await requireCustomer(req, deps);
    return (await deps.urable().listServices()).map((p) => ({ id: p.id, name: p.name, category: p.categoryName || 'Services', description: undefined, priceCents: p.prices?.[0]?.value, durationMinutes: undefined }));
  });
  app.get('/services/:id', async ({ req, deps, params }) => {
    await requireCustomer(req, deps);
    const p = (await deps.urable().listServices()).find((x) => x.id === params.id);
    if (!p) throw notFound('Service');
    return { id: p.id, name: p.name, category: p.categoryName || 'Services', priceCents: p.prices?.[0]?.value };
  });

  app.get('/vehicles', async ({ req, deps }) => (await deps.urable().listVehicles((await requireCustomer(req, deps)).urableCustomerId)).map(simpleVehicle));
  app.post('/vehicles', async ({ req, deps, json }) => {
    const user = await requireCustomer(req, deps); const input = vehicleSchema.parse(await json());
    const name = `${input.year} ${input.make} ${input.model}`;
    const id = await deps.urable().createVehicle({ customerId: user.urableCustomerId, name, notes: notes(input) });
    return reply({ id, name, year: input.year, color: input.color }, 201);
  });
  app.patch('/vehicles/:id', async ({ req, deps, params, json }) => {
    const user = await requireCustomer(req, deps); const { id } = idParam.parse(params); const input = vehicleSchema.parse(await json());
    if (!(await deps.urable().listVehicles(user.urableCustomerId)).some((v) => v.id === id)) throw notFound('Vehicle');
    const name = `${input.year} ${input.make} ${input.model}`;
    await deps.urable().updateVehicle(id, { name, notes: notes(input) });
    return { id, name, year: input.year, color: input.color };
  });
  app.delete('/vehicles/:id', async ({ req, deps, params }) => {
    const user = await requireCustomer(req, deps); const { id } = idParam.parse(params);
    const urable = deps.urable();
    const [vehicles, jobs] = await Promise.all([urable.listVehicles(user.urableCustomerId), urable.listJobs(user.urableCustomerId)]);
    if (!vehicles.some((v) => v.id === id)) throw notFound('Vehicle');
    if (jobs.some((j) => j.itemRefs?.some((ref) => refMatches(ref, id)) && !isDoneStatus(j.status))) throw new HttpError(409, 'VEHICLE_HAS_BOOKING', 'This vehicle has an upcoming booking.');
    await urable.deleteVehicle(id);
    return { ok: true };
  });

  app.post('/bookings/handoff', async ({ req, deps }) => {
    const user = await requireCustomer(req, deps);
    const identity = await identify(req, deps);
    if (!identity.emailConfirmed || identity.email.toLowerCase() !== user.email.toLowerCase())
      throw new HttpError(403, 'EMAIL_NOT_VERIFIED', 'Verify your account email before booking.');
    const urable = deps.urable();
    const customers = await urable.findCustomersByEmail(user.email);
    const customerIds = new Set([user.urableCustomerId, ...customers.filter((c) =>
      c.email?.trim().toLowerCase() === user.email.toLowerCase() ||
      c.emails?.some((e) => e.value.trim().toLowerCase() === user.email.toLowerCase())
    ).map((c) => c.id)]);
    const existing = new Set<string>();
    for (const id of customerIds) for (const job of await urable.listJobs(id)) existing.add(job.id);
    const [attempt] = await deps.sql`INSERT INTO booking_handoffs (user_id, existing_job_ids)
      VALUES (${user.id}, ${[...existing]}) RETURNING id, expires_at AS "expiresAt"`;
    return reply({ attemptId: attempt.id, expiresAt: attempt.expiresAt }, 201);
  });
  app.get('/bookings/handoff/:id', async ({ req, deps, params, url }) => {
    const user = await requireCustomer(req, deps);
    const identity = await identify(req, deps);
    if (!identity.emailConfirmed || identity.email.toLowerCase() !== user.email.toLowerCase())
      throw new HttpError(403, 'EMAIL_NOT_VERIFIED', 'Verify your account email before checking a booking.');
    const { id } = z.object({ id: z.uuid() }).parse(params);
    const [attempt] = await deps.sql`SELECT id, started_at AS "startedAt", expires_at AS "expiresAt",
      existing_job_ids AS "existingJobIds", matched_job_id AS "matchedJobId"
      FROM booking_handoffs WHERE id = ${id} AND user_id = ${user.id}`;
    if (!attempt) throw notFound('Booking check');
    if (attempt.matchedJobId) {
      const job = await ownedJob({ deps }, user, attempt.matchedJobId as string);
      return { state: 'matched', booking: booking(job, await deps.urable().listVehicles(user.urableCustomerId)) };
    }
    if (new Date(attempt.expiresAt as string).getTime() < Date.now()) return { state: 'expired' };
    const number = url.searchParams.get('confirmationNumber');
    const confirmationNumber = number === null ? undefined : z.coerce.number().int().positive().parse(number);
    const result = await findBookingHandoff(deps.urable(), {
      verifiedEmail: user.email,
      originalCustomerId: user.urableCustomerId,
      startedAt: new Date(attempt.startedAt as string).getTime(),
      existingJobIds: new Set(attempt.existingJobIds as string[]), confirmationNumber,
    });
    if (result.state === 'none') return { state: 'pending' };
    if (result.state === 'ambiguous') return { state: 'ambiguous' };
    const job = await deps.urable().getJob(result.candidate.jobId);
    if (!jobVehicleId(job)) return { state: 'pending' };
    await recordJob(deps, user.id, job);
    const [link] = await deps.sql`SELECT 1 FROM job_sync WHERE user_id = ${user.id} AND urable_job_id = ${job.id}`;
    if (!link) return { state: 'ambiguous' };
    await deps.sql`UPDATE booking_handoffs SET matched_job_id = ${job.id} WHERE id = ${id} AND user_id = ${user.id} AND matched_job_id IS NULL`;
    return { state: 'matched', booking: booking(job, await deps.urable().listVehicles(user.urableCustomerId)) };
  });
  app.get('/bookings', async ({ req, deps }) => {
    const user = await requireCustomer(req, deps); const urable = deps.urable();
    const [jobs, vehicles, links] = await Promise.all([
      urable.listJobs(user.urableCustomerId), urable.listVehicles(user.urableCustomerId),
      deps.sql`SELECT urable_job_id FROM job_sync WHERE user_id = ${user.id}`,
    ]);
    const owned = jobs.filter((j) => ownsJob(j, user.urableCustomerId));
    const seen = new Set(owned.map((j) => j.id));
    for (const link of links) {
      const id = link.urable_job_id as string;
      if (!seen.has(id)) {
        const job = await urable.getJob(id).catch((e) => { if ((e as { status?: number }).status === 404) return null; throw e; });
        if (job) { owned.push(job); seen.add(id); }
      }
    }
    return owned.map((j) => booking(j, vehicles));
  });
  app.get('/bookings/:id', async (c) => {
    const user = await requireCustomer(c.req, c.deps); const { id } = idParam.parse(c.params);
    const [job, vehicles] = await Promise.all([ownedJob(c, user, id), c.deps.urable().listVehicles(user.urableCustomerId)]);
    return booking(job, vehicles);
  });
  app.post('/bookings/:id/cancel', async (c) => {
    const user = await requireCustomer(c.req, c.deps); const { id } = idParam.parse(c.params);
    const job = await ownedJob(c, user, id);
    if (isDoneStatus(job.status)) throw new HttpError(409, 'CANCEL_NOT_ALLOWED', 'This booking cannot be cancelled in the app.');
    await c.deps.urable().cancelJob(id);
    return { ok: true };
  });
  app.post('/bookings/:id/review', async (c) => {
    const user = await requireCustomer(c.req, c.deps); const { id } = idParam.parse(c.params);
    const input = z.object({ rating: z.number().int().min(1).max(5), body: z.string().trim().max(1000).optional() }).parse(await c.json());
    const job = await ownedJob(c, user, id);
    if (job.status.toLowerCase() !== 'completed') throw new HttpError(409, 'REVIEW_NOT_ALLOWED', 'You can review a completed service.');
    const body = input.body?.replace(/<[^>]*>/g, '') ?? null;
    const [row] = await c.deps.sql`INSERT INTO reviews (user_id, urable_job_id, rating, body) VALUES (${user.id}, ${id}, ${input.rating}, ${body}) ON CONFLICT (urable_job_id) DO NOTHING RETURNING id`;
    if (!row) throw new HttpError(409, 'REVIEW_EXISTS', 'This service already has a review.');
    return reply(row, 201);
  });

  app.get('/payments', async ({ req, deps }) => {
    const user = await requireCustomer(req, deps);
    const urable = deps.urable();
    const payments = (await urable.listPayments(user.urableCustomerId))
      .filter((p) => p.customerRef === user.urableCustomerId || p.customerRef?.endsWith('/' + user.urableCustomerId));
    const links = await deps.sql`SELECT urable_job_id FROM job_sync WHERE user_id = ${user.id}`;
    const linkedIds = new Set(links.map((x) => x.urable_job_id as string));
    const duplicateCustomers = new Set<string>();
    for (const id of linkedIds) {
      const job = await urable.getJob(id).catch((e) => { if ((e as { status?: number }).status === 404) return null; throw e; });
      if (job?.customerRef && !ownsJob(job, user.urableCustomerId)) duplicateCustomers.add(job.customerRef.split('/').at(-1)!);
    }
    for (const customerId of duplicateCustomers) {
      for (const p of await urable.listPayments(customerId)) {
        if (p.jobOrderRefs?.some((ref) => [...linkedIds].some((id) => refMatches(ref, id)))) payments.push(p);
      }
    }
    return [...new Map(payments.map((p) => [p.id, p])).values()]
      .map((p) => ({ id: p.id, status: p.status, totalCents: p.total, jobIds: p.jobOrderRefs }));
  });

  app.get('/rewards', async ({ req, deps }) => {
    const user = await requireCustomer(req, deps); const { sql } = deps;
    const [points, rewards, activity, redemptions] = await Promise.all([
      balance(deps, user.id),
      sql`SELECT id, name, description, points_cost AS "pointsCost" FROM rewards WHERE active = true ORDER BY points_cost`,
      sql`SELECT id, reason AS label, delta, created_at AS "createdAt" FROM points_ledger WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 100`,
      sql`SELECT rr.id, rr.code, rr.status, r.name FROM reward_redemptions rr JOIN rewards r ON r.id = rr.reward_id WHERE rr.user_id = ${user.id} ORDER BY rr.created_at DESC`,
    ]);
    return { points, rewards, activity, redemptions, referralCode: user.referralCode };
  });
  app.post('/rewards/:id/redeem', async ({ req, deps, params }) => {
    const user = await requireCustomer(req, deps); const { id } = z.object({ id: z.uuid() }).parse(params);
    try {
      const [r] = await deps.sql`SELECT * FROM soflo_private.redeem_reward(${user.id}, ${id})`;
      return { id: r.id, code: r.code, status: r.status, rewardName: r.reward_name };
    } catch (e) {
      const m = String((e as Error).message);
      if (m.includes('NOT_FOUND')) throw notFound('Reward');
      if (m.includes('INSUFFICIENT_POINTS')) throw new HttpError(409, 'INSUFFICIENT_POINTS', 'More points are needed to redeem this reward.');
      throw e;
    }
  });

  app.get('/protection', async ({ req, deps, url }) => {
    const user = await requireCustomer(req, deps);
    const { vehicleId } = z.object({ vehicleId: z.string().optional() }).parse(Object.fromEntries(url.searchParams));
    const urable = deps.urable();
    const [vehicles, jobs, services, warranties, categories] = await Promise.all([
      urable.listVehicles(user.urableCustomerId), urable.listJobs(user.urableCustomerId), urable.listAllServices(),
      deps.sql`SELECT id, urable_vehicle_id, urable_job_id, product, coverage, applied_on::text AS "appliedOn", expires_on::text AS "expiresOn" FROM warranties WHERE urable_customer_id = ${user.urableCustomerId}`,
      deps.sql`SELECT value FROM settings WHERE key = 'protection_categories'`,
    ]);
    const allowed = new Set(vehicles.map((v) => v.id));
    if (vehicleId && !allowed.has(vehicleId)) return [];
    const names: string[] = Array.isArray(categories[0]?.value) ? categories[0].value.map((x: unknown) => String(x).toLowerCase()) : [];
    const productMap = new Map(services.map((x) => [x.id, x]));
    const records: Array<{ id: string; vehicleId: string; vehicleName: string; serviceName: string; appliedOn: string; product?: string; coverage?: string; expiresOn?: string }> = [];
    const used = new Set<string>();
    for (const job of jobs) {
      if (job.status.toLowerCase() !== 'completed' || !ownsJob(job, user.urableCustomerId)) continue;
      for (const [itemRef, lines] of Object.entries(job.invoice?.items ?? {})) {
        const itemId = itemRef.split('/').at(-1) ?? '';
        if (!allowed.has(itemId) || (vehicleId && itemId !== vehicleId)) continue;
        for (const line of lines) {
          const raw = line.service?.id ?? line.product?.id ?? line.productServiceId ?? line.productServiceRef ?? line.productRef;
          const productId = typeof raw === 'string' ? raw.split('/').at(-1) ?? '' : '';
          const service = productMap.get(productId);
          if (!service) continue;
          const text = (service.categoryName ?? service.name).toLowerCase();
          if (!names.some((n) => text.includes(n))) continue;
          const w = warranties.find((x) => x.urable_job_id === job.id && x.urable_vehicle_id === itemId);
          if (w) used.add(w.id as string);
          const ts = job.completedAt ?? job.start;
          const appliedOn = (w?.appliedOn as string | undefined) ?? (ts !== undefined ? new Date(ts).toISOString() : null);
          if (!appliedOn) continue;
          records.push({ id: `${job.id}:${productId}:${itemId}`, vehicleId: itemId, vehicleName: vehicles.find((v) => v.id === itemId)?.name ?? 'Vehicle', serviceName: service.name, appliedOn, product: w?.product ?? undefined, coverage: w?.coverage ?? undefined, expiresOn: w?.expiresOn ?? undefined });
        }
      }
    }
    for (const w of warranties) {
      if (used.has(w.id as string) || !allowed.has(w.urable_vehicle_id as string) || (vehicleId && w.urable_vehicle_id !== vehicleId)) continue;
      records.push({ id: w.id as string, vehicleId: w.urable_vehicle_id as string, vehicleName: vehicles.find((v) => v.id === w.urable_vehicle_id)?.name ?? 'Vehicle', serviceName: 'Protection record', appliedOn: w.appliedOn as string, product: w.product ?? undefined, coverage: w.coverage ?? undefined, expiresOn: w.expiresOn ?? undefined });
    }
    return records.sort((a, b) => new Date(b.appliedOn).getTime() - new Date(a.appliedOn).getTime());
  });

  app.get('/shop/products', async ({ req, deps }) => {
    await requireCustomer(req, deps);
    const products = (await deps.urable().listShopProducts()).filter((x) => !/gift\s*cards?/i.test(x.name));
    if (products.length) return products.map((x) => ({ id: x.id, name: x.name, category: x.categoryName, priceCents: x.prices?.[0]?.value }));
    return await deps.sql`SELECT id, name, brand, category, description, price_cents AS "priceCents" FROM shop_products WHERE active = true ORDER BY name`;
  });
  app.get('/gallery', async ({ req, deps }) => {
    await requireCustomer(req, deps);
    return await deps.sql`SELECT id, title, caption, tag, before_path AS "beforeUrl", after_path AS "afterUrl" FROM gallery WHERE published = true ORDER BY display_order, created_at DESC`;
  });
  app.get('/reviews', async ({ req, deps }) => {
    await requireCustomer(req, deps);
    return await deps.sql`SELECT r.id, r.rating, r.body, r.created_at AS "createdAt", u.name AS "customerName" FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.visible = true ORDER BY r.created_at DESC LIMIT 100`;
  });
}
