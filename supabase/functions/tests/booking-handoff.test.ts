import assert from 'node:assert/strict';
import test from 'node:test';

import { selectBookingHandoff } from '../_shared/booking-handoff.ts';
import type { UrableCustomer, UrableJob } from '../_shared/urable.ts';

const startedAt = 1_800_000_000_000;
const customers: UrableCustomer[] = [
  { id: 'original', emails: [{ label: 'Email', value: 'customer@example.test' }] },
  { id: 'duplicate', email: 'customer@example.test' },
  { id: 'other', email: 'other@example.test' },
];

function job(id: string, num: number, created = startedAt + 1_000, customerRef = 'original'): UrableJob {
  return { id, num, created, customerRef, status: 'scheduled', paymentStatus: 'unpaid' };
}

test('matches a new virtual-shop job even when Urable created a duplicate customer', () => {
  const jobs = new Map<string, UrableJob[]>([
    ['original', [job('old', 1, startedAt - 86_400_000)]],
    ['duplicate', [job('new', 2, startedAt + 1_000, 'duplicate')]],
    ['other', [job('someone-else', 3, startedAt + 1_000, 'other')]],
  ]);
  assert.deepEqual(selectBookingHandoff(customers, jobs, {
    verifiedEmail: 'Customer@Example.Test',
    startedAt,
    existingJobIds: new Set(['old']),
  }), {
    state: 'matched',
    candidate: { jobId: 'new', jobNumber: 2, customerId: 'duplicate', status: 'scheduled', paymentStatus: 'unpaid' },
  });
});

test('does not attach an ambiguous booking without its confirmation number', () => {
  const jobs = new Map<string, UrableJob[]>([['original', [job('a', 10), job('b', 11)]]]);
  const attempt = { verifiedEmail: 'customer@example.test', startedAt, existingJobIds: new Set<string>() };
  assert.equal(selectBookingHandoff(customers, jobs, attempt).state, 'ambiguous');
  assert.deepEqual(selectBookingHandoff(customers, jobs, { ...attempt, confirmationNumber: 11 }), {
    state: 'matched',
    candidate: { jobId: 'b', jobNumber: 11, customerId: 'original', status: 'scheduled', paymentStatus: 'unpaid' },
  });
});

test('does not attach an old, cancelled, or different-email job', () => {
  const jobs = new Map<string, UrableJob[]>([
    ['original', [job('old', 1, startedAt - 86_400_000), { ...job('cancelled', 2), status: 'canceled' }]],
    ['other', [job('other-new', 3, startedAt + 1_000, 'other')]],
  ]);
  assert.deepEqual(selectBookingHandoff(customers, jobs, {
    verifiedEmail: 'customer@example.test',
    startedAt,
    existingJobIds: new Set<string>(),
  }), { state: 'none', candidates: [] });
});

test('a Urable timeout or connection failure becomes a 503 UrableError, not an unhandled error', async () => {
  const { UrableClient, UrableError } = await import('../_shared/urable.ts');
  for (const failure of [new DOMException('timed out', 'TimeoutError'), new TypeError('fetch failed')]) {
    const client = new UrableClient('key', 'https://urable.example/api', () => Promise.reject(failure));
    await assert.rejects(() => client.getJob('x'), (e: unknown) => e instanceof UrableError && e.status === 503);
  }
});
