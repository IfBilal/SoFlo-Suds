import { UrableClient, jobCreatedMs, type UrableCustomer, type UrableJob } from './urable.ts';

export interface BookingHandoffAttempt {
  verifiedEmail: string;
  originalCustomerId?: string;
  startedAt: number;
  existingJobIds: ReadonlySet<string>;
  confirmationNumber?: number;
}

export interface BookingCandidate {
  jobId: string;
  jobNumber?: number;
  customerId: string;
  status: string;
  paymentStatus?: string;
}

export type BookingHandoffResult =
  | { state: 'none'; candidates: [] }
  | { state: 'ambiguous'; candidates: BookingCandidate[] }
  | { state: 'matched'; candidate: BookingCandidate };

/** Urable's `email` field is not reliably a string; accept strings, objects with `value`, and the `emails` list. */
export function customerHasEmail(c: { email?: unknown; emails?: unknown }, email: string): boolean {
  const want = email.trim().toLowerCase();
  const norm = (v: unknown) => typeof v === 'string' ? v.trim().toLowerCase() : v && typeof v === 'object' && typeof (v as { value?: unknown }).value === 'string' ? (v as { value: string }).value.trim().toLowerCase() : '';
  return norm(c.email) === want || (Array.isArray(c.emails) && c.emails.some((e) => norm(e) === want));
}

export function selectBookingHandoff(
  customers: UrableCustomer[],
  jobsByCustomer: ReadonlyMap<string, UrableJob[]>,
  attempt: BookingHandoffAttempt,
): BookingHandoffResult {
  const email = attempt.verifiedEmail.trim().toLowerCase();
  if (!email || !Number.isFinite(attempt.startedAt)) return { state: 'none', candidates: [] };

  const earliestCreated = attempt.startedAt - 2 * 60_000;
  const candidates: BookingCandidate[] = [];
  const seenJobs = new Set<string>();

  for (const customer of customers) {
    if (!customerHasEmail(customer, email)) continue;
    for (const job of jobsByCustomer.get(customer.id) ?? []) {
      if (job.customerRef !== customer.id && !job.customerRef?.endsWith('/' + customer.id)) continue;
      if (seenJobs.has(job.id) || attempt.existingJobIds.has(job.id)) continue;
      const created = jobCreatedMs(job);
      if (created === undefined || created < earliestCreated) continue;
      if (!['scheduled', 'in progress', 'completed'].includes(job.status)) continue;
      if (attempt.confirmationNumber !== undefined && job.num !== attempt.confirmationNumber) continue;
      seenJobs.add(job.id);
      candidates.push({
        jobId: job.id,
        jobNumber: job.num,
        customerId: customer.id,
        status: job.status,
        paymentStatus: job.paymentStatus,
      });
    }
  }

  if (candidates.length === 0) return { state: 'none', candidates: [] };
  if (candidates.length > 1) return { state: 'ambiguous', candidates };
  return { state: 'matched', candidate: candidates[0] };
}

export async function findBookingHandoff(
  urable: UrableClient,
  attempt: BookingHandoffAttempt,
): Promise<BookingHandoffResult> {
  const customers = await urable.findCustomersByEmail(attempt.verifiedEmail);
  if (attempt.originalCustomerId && !customers.some((c) => c.id === attempt.originalCustomerId)) {
    customers.push({ id: attempt.originalCustomerId, email: attempt.verifiedEmail });
  }
  const jobsByCustomer = new Map<string, UrableJob[]>();
  await Promise.all(customers.map(async (customer) => {
    if (customerHasEmail(customer, attempt.verifiedEmail.trim().toLowerCase())) {
      jobsByCustomer.set(customer.id, await urable.listJobs(customer.id));
    }
  }));
  return selectBookingHandoff(customers, jobsByCustomer, attempt);
}
