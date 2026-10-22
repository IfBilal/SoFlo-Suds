import { UrableClient, type UrableCustomer, type UrableJob } from './client.js';

export interface BookingHandoffAttempt {
  verifiedEmail: string;
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

function customerHasEmail(customer: UrableCustomer, email: string): boolean {
  const emails = [customer.email, ...(customer.emails ?? []).map((entry) => entry.value)];
  return emails.some((value) => value?.trim().toLowerCase() === email);
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
      if (seenJobs.has(job.id) || attempt.existingJobIds.has(job.id)) continue;
      if (typeof job.created !== 'number' || job.created < earliestCreated) continue;
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
  const jobsByCustomer = new Map<string, UrableJob[]>();
  await Promise.all(customers.map(async (customer) => {
    if (customerHasEmail(customer, attempt.verifiedEmail.trim().toLowerCase())) {
      jobsByCustomer.set(customer.id, await urable.listJobs(customer.id));
    }
  }));
  return selectBookingHandoff(customers, jobsByCustomer, attempt);
}
