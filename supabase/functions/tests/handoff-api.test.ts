import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { identities, setup } from './helpers.ts';
import { syncJobsBatch } from '../_shared/sync.ts';

let t: Awaited<ReturnType<typeof setup>>;
before(async () => {
  t = await setup();
  t.urable.customers = [
    { id: 'uA', email: 'a@t.test' },
    { id: 'uDup', emails: [{ label: 'Email', value: 'a@t.test' }] },
  ];
  t.urable.vehicles.uDup = [{ id: 'vDup', name: '2020 Honda Civic', customerRef: 'uDup' }];
});
after(async () => { await t.stop(); });

test('handoff begins with a server-owned snapshot and links a duplicate-customer job once', async () => {
  const started = await t.call('POST', '/bookings/handoff', { token: 'tokA' });
  assert.equal(started.status, 201);
  assert.equal((await t.call('GET', '/bookings/handoff/latest', { token: 'tokA' })).json.attemptId, started.json.attemptId);
  assert.equal((await t.call('GET', '/bookings/handoff/latest', { token: 'tokB' })).json, null);
  const path = `/bookings/handoff/${started.json.attemptId}`;
  assert.equal((await t.call('GET', path, { token: 'tokA' })).json.state, 'pending');
  assert.equal((await t.call('GET', path, { token: 'tokB' })).status, 404);

  t.urable.jobs.push({
    id: 'jobDup', num: 1234, customerRef: 'uDup', itemRefs: ['vDup'],
    created: Date.now(), start: Date.now() + 86_400_000,
    status: 'scheduled', paymentStatus: 'unpaid',
  });
  const linked = await t.call('GET', path, { token: 'tokA' });
  assert.equal(linked.status, 200);
  assert.equal(linked.json.state, 'matched');
  assert.equal(linked.json.booking.id, 'jobDup');
  assert.equal(linked.json.booking.vehicleName, '2020 Honda Civic');
  assert.equal(linked.json.booking.paymentStatus, 'unpaid');
  assert.equal(t.pushed.flat().filter((m) => m.title === 'Booking confirmed').length, 0);
  assert.equal((await t.call('GET', path, { token: 'tokA' })).json.booking.id, 'jobDup');
  assert.equal((await t.call('GET', '/bookings/handoff/latest', { token: 'tokA' })).json, null);
  assert.equal((await t.sql`SELECT count(*)::int n FROM job_sync WHERE urable_job_id = 'jobDup'`)[0].n, 1);
  assert.ok((await t.call('GET', '/bookings', { token: 'tokA' })).json.some((b: { id: string }) => b.id === 'jobDup'));
  assert.equal((await t.call('GET', '/bookings/jobDup', { token: 'tokA' })).status, 200);
  assert.equal((await t.call('GET', '/bookings/jobDup', { token: 'tokB' })).status, 404);
  assert.equal((await t.call('GET', '/bookings', { token: 'tokB' })).json.some((b: { id: string }) => b.id === 'jobDup'), false);

  t.urable.payments.push({ id: 'pDup', customerRef: 'uDup', jobOrderRefs: ['jobs/jobDup'], status: 'paid', total: 10000 });
  t.urable.payments.push({ id: 'pOther', customerRef: 'uDup', jobOrderRefs: ['jobs/unrelated'], status: 'paid', total: 99999 });
  assert.deepEqual((await t.call('GET', '/payments', { token: 'tokA' })).json.map((p: { id: string }) => p.id), ['p1', 'pDup']);
  const job = t.urable.jobs.find((j) => j.id === 'jobDup')!;
  job.status = 'completed'; job.paymentStatus = 'paid'; job.invoice = { amountPaid: 10000 };
  await syncJobsBatch(t.deps, { batchSize: 10 });
  assert.equal((await t.sql`SELECT delta FROM points_ledger WHERE source_key = 'jobDup' AND reason = 'job_completed'`)[0].delta, 100);
});

test('ambiguous jobs need a confirmation number; expired attempts do not claim jobs', async () => {
  const started = await t.call('POST', '/bookings/handoff', { token: 'tokA' });
  const path = `/bookings/handoff/${started.json.attemptId}`;
  for (const num of [2001, 2002]) t.urable.jobs.push({
    id: `job${num}`, num, customerRef: 'uDup', itemRefs: ['vDup'],
    created: Date.now(), status: 'scheduled', paymentStatus: 'unpaid',
  });
  assert.equal((await t.call('GET', path, { token: 'tokA' })).json.state, 'ambiguous');
  assert.equal((await t.call('GET', `${path}?confirmationNumber=2002`, { token: 'tokA' })).json.booking.id, 'job2002');
  const expired = await t.call('POST', '/bookings/handoff', { token: 'tokA' });
  await t.sql`UPDATE booking_handoffs SET expires_at = now() - interval '1 minute' WHERE id = ${expired.json.attemptId}`;
  assert.equal((await t.call('GET', `/bookings/handoff/${expired.json.attemptId}`, { token: 'tokA' })).json.state, 'expired');
});

test('unverified or changed account email cannot claim a same-email Urable job', async () => {
  const original = identities.tokA;
  identities.tokA = { ...original, emailConfirmed: false };
  try {
    assert.equal((await t.call('POST', '/bookings/handoff', { token: 'tokA' })).json.error.code, 'EMAIL_NOT_VERIFIED');
    identities.tokA = { ...original, email: 'changed@example.test' };
    assert.equal((await t.call('POST', '/bookings/handoff', { token: 'tokA' })).json.error.code, 'EMAIL_NOT_VERIFIED');
  } finally { identities.tokA = original; }
});

test('a brand-new customer with no Urable jobs can start a handoff (empty snapshot)', async () => {
  const saved = t.urable.jobs; t.urable.jobs = [];
  try {
    const r = await t.call('POST', '/bookings/handoff', { token: 'tokB' });
    assert.equal(r.status, 201);
    const [row] = await t.sql`SELECT cardinality(existing_job_ids) AS n FROM booking_handoffs WHERE id = ${r.json.attemptId}`;
    assert.equal(row.n, 0);
  } finally { t.urable.jobs = saved; }
});

test('Urable customers with unusual email shapes never crash matching', async () => {
  const { customerHasEmail } = await import('../_shared/booking-handoff.ts');
  assert.equal(customerHasEmail({ email: ' A@T.test ' }, 'a@t.test'), true);
  assert.equal(customerHasEmail({ email: { label: 'Email', value: 'a@t.test' } }, 'a@t.test'), true);
  assert.equal(customerHasEmail({ email: 42, emails: [null, { value: 'a@t.test' }] }, 'a@t.test'), true);
  assert.equal(customerHasEmail({ email: ['a@t.test'], emails: 'x' }, 'a@t.test'), false);
  assert.equal(customerHasEmail({}, 'a@t.test'), false);
  const saved = t.urable.customers;
  t.urable.customers = [{ id: 'weird', email: { value: 'a@t.test' } as unknown }, { id: 'weird2', email: 7 as unknown }];
  try { assert.equal((await t.call('POST', '/bookings/handoff', { token: 'tokA' })).status, 201); } finally { t.urable.customers = saved; }
});

test('real Urable shapes: object `created` timestamp and object `email` still match a new job', async () => {
  const { selectBookingHandoff } = await import('../_shared/booking-handoff.ts');
  const now = Date.now();
  const customers = [{ id: 'cReal', email: { label: 'Email', value: 'A@T.test' } as unknown }];
  const job = { id: 'jReal', num: 77, customerRef: 'accounts/x/customers/cReal', status: 'scheduled', paymentStatus: 'unpaid', created: { uid: null, timestamp: now } };
  const attempt = { verifiedEmail: 'a@t.test', startedAt: now - 1000, existingJobIds: new Set<string>() };
  const hit = selectBookingHandoff(customers, new Map([['cReal', [job]]]), attempt);
  assert.equal(hit.state, 'matched');
  const old = selectBookingHandoff(customers, new Map([['cReal', [{ ...job, created: { timestamp: now - 3_600_000 } }]]]), attempt);
  assert.equal(old.state, 'none');
  const missing = selectBookingHandoff(customers, new Map([['cReal', [{ ...job, created: undefined }]]]), attempt);
  assert.equal(missing.state, 'none');
});
