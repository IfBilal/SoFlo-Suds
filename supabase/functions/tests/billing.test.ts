import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { setup } from './helpers.ts';
import { earnedCents, recordJob } from '../_shared/sync.ts';

let t: Awaited<ReturnType<typeof setup>>;
let userA = '';
const paidJob = (id: string, over: Record<string, unknown> = {}) => ({ id, customerRef: 'uA', itemRefs: ['vA'], status: 'completed', paymentStatus: 'paid', start: 1_900_000_000_000, invoice: { total: 18724, amountPaid: 20724 }, ...over });
const points = async (job: string) => Number((await t.sql`SELECT COALESCE(sum(delta),0)::int AS n FROM points_ledger WHERE user_id = ${userA} AND source_key = ${job}`)[0].n);

before(async () => { t = await setup(); userA = (await t.sql`SELECT id FROM users WHERE urable_customer_id = 'uA'`)[0].id as string; });
after(async () => { await t.stop(); });

describe('what a paid job earns (handbook 4.5)', () => {
  test('tips are excluded and a deposit or overpayment never earns more than the invoice total', () => {
    assert.equal(earnedCents(paidJob('x') as never), 18724);                                    // $20.00 tip left out
    assert.equal(earnedCents({ invoice: { total: 10000, amountPaid: 4000 } } as never), 4000);  // deposit
    assert.equal(earnedCents({ invoice: { amountPaid: 5000 } } as never), 5000);                // no total reported
    assert.equal(earnedCents({} as never), 0);
  });
  test('the synced job credits points on the invoice total, once, and remembers only a hash of the card', async () => {
    t.urable.payments.push({ id: 'pay1', customerRef: 'uA', total: 20724, status: 'paid', paymentMethodDetails: 'VISA ****6236', jobOrderRefs: ['accounts/x/jobs/tip1'] } as never);
    const job = paidJob('tip1') as never; t.urable.jobs.push(job);
    await recordJob(t.deps, userA, job); await recordJob(t.deps, userA, job);
    assert.equal(await points('tip1'), 187);
    const [row] = await t.sql`SELECT payment_fingerprint AS f FROM job_sync WHERE urable_job_id = 'tip1'`;
    assert.match(String(row.f), /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(row).includes('6236'));
  });
  test('a job with no card on record still syncs (the extra abuse check is simply skipped)', async () => {
    const job = paidJob('nocard', { invoice: { total: 5000, amountPaid: 5000 } }) as never; t.urable.jobs.push(job);
    await recordJob(t.deps, userA, job);
    assert.equal(await points('nocard'), 50);
    assert.equal((await t.sql`SELECT payment_fingerprint AS f FROM job_sync WHERE urable_job_id = 'nocard'`)[0].f, null);
  });
});

describe('refund and cancellation after an award', () => {
  test('a refund reverses the points once; syncing again changes nothing', async () => {
    const job = paidJob('ref1', { invoice: { total: 10000, amountPaid: 10000 } }); t.urable.jobs.push(job as never);
    await recordJob(t.deps, userA, job as never); assert.equal(await points('ref1'), 100);
    const refunded = { ...job, paymentStatus: 'refunded' } as never;
    await recordJob(t.deps, userA, refunded); await recordJob(t.deps, userA, refunded);
    assert.equal(await points('ref1'), 0);
  });
  test('a cancellation after an award reverses it too', async () => {
    const job = paidJob('can1', { invoice: { total: 4000, amountPaid: 4000 } }); t.urable.jobs.push(job as never);
    await recordJob(t.deps, userA, job as never); assert.equal(await points('can1'), 40);
    await recordJob(t.deps, userA, { ...job, status: 'canceled' } as never);
    assert.equal(await points('can1'), 0);
  });
});
