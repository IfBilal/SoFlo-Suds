const DEFAULT_BASE_URL = 'https://app.urable.com/api';

export type UrableList<T> = { success: true; data: T[] };
export type UrableItem<T> = { success: true; data: T };
export type UrableCreated = { success: true; data: { id: string; num?: number } };

export interface UrableCustomer {
  id: string;
  email?: unknown; // not reliably a string in live Urable data
  firstName?: string;
  lastName?: string;
  emails?: Array<{ label: string; value: string }>;
}

export interface UrableVehicle {
  id: string;
  name: string;
  customerRef?: string;
  notes?: string;
}

export interface UrablePayment {
  id: string;
  status?: string;
  total?: number;
  customerRef?: string;
  jobOrderRefs?: string[];
  paymentMethod?: string;
}

export interface UrablePrice {
  value: number; // cents
  label?: string;
  sku?: string;
  duration?: number | null; // minutes when the shop sets one
}

export interface UrableProduct {
  id: string;
  name: string;
  type: 'product' | 'service';
  industry?: string;
  categoryName?: string;
  description?: string;
  prices?: UrablePrice[];
  virtualShop?: boolean;
}

export interface UrableJob {
  id: string;
  num?: number;
  name?: string;
  type?: 'shop' | 'field';
  customerRef?: string;
  itemRefs?: string[];
  status: string;
  paymentStatus?: string;
  notes?: string;
  start?: number; // Unix milliseconds
  completedAt?: number; // Unix milliseconds
  created?: number | { timestamp?: number; uid?: string | null }; // live Urable sends the object form; ms either way
  invoice?: {
    subtotal?: number; // cents
    total?: number; // cents
    amountPaid?: number; // cents
    adjustments?: unknown[];
    items?: Record<string, Array<{
      service?: UrableProduct;
      product?: UrableProduct;
      productServiceId?: string;
      productServiceRef?: string;
      productRef?: string;
      quantity?: number;
    }>>;
  };
}

/** Creation time in Unix ms from either Urable shape, or undefined. */
export function jobCreatedMs(job: { created?: unknown }): number | undefined {
  const c = job.created;
  if (typeof c === 'number' && Number.isFinite(c)) return c;
  const t = c && typeof c === 'object' ? (c as { timestamp?: unknown }).timestamp : undefined;
  return typeof t === 'number' && Number.isFinite(t) ? t : undefined;
}

export interface CreateJobInput {
  customerId: string;
  industry: 'vehicleCare';
  itemIds: string[];
  lineItems: Array<{ productServiceId: string; quantity: number; priceSku?: string }>;
  type: 'shop' | 'field';
  status: 'scheduled';
  start: number;
  end: number;
  location?: {
    label: string;
    value: {
      address: {
        line1: string;
        city: string;
        state: string;
        postalCode: string;
        country: string;
      };
    };
  };
  notes?: string;
  deployScheduledMessage?: boolean;
}

export class UrableError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'UrableError';
  }
}

export class UrableClient {
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    baseUrl = DEFAULT_BASE_URL,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!apiKey) throw new UrableError(503, 'Urable is not configured');
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/v1${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      // Timeouts and connection failures are "Urable unavailable" (503, retryable), never an opaque 500.
      throw new UrableError(503, 'Urable is unreachable');
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new UrableError(response.status, 'Urable returned an invalid response');
    }
    if (!response.ok || !payload || typeof payload !== 'object' || !('success' in payload) || payload.success !== true) {
      const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'Urable request failed';
      throw new UrableError(response.status, message);
    }
    return payload as T;
  }

  private async listPaginated<T extends { id: string }>(path: string): Promise<T[]> {
    const all: T[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 50; page++) {
      const separator = path.includes('?') ? '&' : '?';
      const result = await this.request<UrableList<T>>('GET', `${path}${separator}limit=100${cursor ? `&startAfter=${encodeURIComponent(cursor)}` : ''}`);
      all.push(...result.data);
      if (result.data.length < 100) return all;
      const next = result.data.at(-1)?.id;
      if (!next || next === cursor) break;
      cursor = next;
    }
    return all;
  }

  async listServices(): Promise<UrableProduct[]> {
    return (await this.listAllServices()).filter((product) => product.virtualShop === true);
  }

  async listAllServices(): Promise<UrableProduct[]> {
    return this.listPaginated<UrableProduct>('/products?type=service&industry=vehicleCare');
  }

  async listShopProducts(): Promise<UrableProduct[]> {
    return this.listPaginated<UrableProduct>('/products?type=product&industry=vehicleCare');
  }

  async findCustomersByEmail(email: string): Promise<UrableCustomer[]> {
    const result = await this.request<UrableList<UrableCustomer>>('GET', `/customers?email=${encodeURIComponent(email)}`);
    return result.data;
  }

  async listVehicles(customerId: string): Promise<UrableVehicle[]> {
    return this.listPaginated<UrableVehicle>(`/items?customerId=${encodeURIComponent(customerId)}`);
  }

  async updateVehicle(id: string, input: { name: string; notes?: string }): Promise<void> {
    await this.request<UrableItem<UrableVehicle>>('PATCH', `/items/${encodeURIComponent(id)}`, input);
  }

  async deleteVehicle(id: string): Promise<void> {
    await this.request<UrableItem<UrableVehicle>>('DELETE', `/items/${encodeURIComponent(id)}`);
  }

  async listPayments(customerId: string): Promise<UrablePayment[]> {
    const result = await this.request<UrableList<UrablePayment>>('GET', `/payments?customerId=${encodeURIComponent(customerId)}&limit=100`);
    return result.data;
  }

  async listJobs(customerId: string): Promise<UrableJob[]> {
    return this.listPaginated<UrableJob>(`/jobs?customerId=${encodeURIComponent(customerId)}`);
  }

  async getJob(jobId: string): Promise<UrableJob> {
    const result = await this.request<UrableItem<UrableJob>>('GET', `/jobs/${encodeURIComponent(jobId)}`);
    return result.data;
  }

  async createCustomer(input: { firstName: string; lastName?: string; email?: string; phone?: string }): Promise<string> {
    const result = await this.request<UrableCreated>('POST', '/customers', {
      firstName: input.firstName,
      lastName: input.lastName,
      ...(input.email ? { emails: [{ label: 'Email', value: input.email }] } : {}),
      ...(input.phone ? { phoneNumbers: [{ label: 'Mobile', value: input.phone }] } : {}),
      origin: 'SoFlo Suds customer app',
    });
    return result.data.id;
  }

  async updateCustomer(id: string, input: { firstName?: string; lastName?: string; phone?: string }): Promise<void> {
    await this.request<UrableCreated>('PATCH', `/customers/${encodeURIComponent(id)}`, {
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.phone ? { phoneNumbers: [{ label: 'Mobile', value: input.phone }] } : {}),
    });
  }

  async createVehicle(input: { customerId: string; name: string; notes?: string }): Promise<string> {
    const result = await this.request<UrableCreated>('POST', '/items', {
      customerId: input.customerId,
      industry: 'vehicleCare',
      type: 'automotive',
      name: input.name,
      notes: input.notes,
    });
    return result.data.id;
  }

  async createJob(input: CreateJobInput): Promise<string> {
    const result = await this.request<UrableCreated>('POST', '/jobs', input);
    return result.data.id;
  }

  /** PATCHing adjustments alone is ignored by Urable; the line items must be sent with them (verified live). */
  async applyDiscount(job: UrableJob, discount: { percent: boolean; value: number }): Promise<UrableJob> {
    const lineItems = Object.values(job.invoice?.items ?? {}).flat().map((i) => ({
      productServiceId: i.productServiceId ?? i.productServiceRef ?? i.service?.id ?? i.product?.id ?? i.productRef ?? '', quantity: i.quantity ?? 1,
    })).filter((i) => i.productServiceId);
    if (!lineItems.length) throw new UrableError(422, 'Job has no line items to discount');
    const result = await this.request<UrableItem<UrableJob>>('PATCH', `/jobs/${encodeURIComponent(job.id)}`, {
      lineItems, adjustments: [...(job.invoice?.adjustments ?? []), { type: 'discount', value: discount.value, percent: discount.percent }],
    });
    return result.data;
  }

  /** Append a line to the job notes (Handbook Fallback C: the shop sees it on the job). */
  async appendNote(job: UrableJob, line: string): Promise<UrableJob> {
    const notes = [job.notes?.trim(), line].filter(Boolean).join('\n');
    const result = await this.request<UrableItem<UrableJob>>('PATCH', `/jobs/${encodeURIComponent(job.id)}`, { notes });
    return result.data;
  }

  /** Add a Urable product/service to an existing job, keeping its lines and any discount. */
  async addLineItem(job: UrableJob, productServiceId: string, quantity: number): Promise<UrableJob> {
    const current = Object.values(job.invoice?.items ?? {}).flat().map((i) => ({
      productServiceId: i.productServiceId ?? i.productServiceRef ?? i.service?.id ?? i.product?.id ?? i.productRef ?? '', quantity: i.quantity ?? 1,
    })).filter((i) => i.productServiceId);
    if (!current.length) throw new UrableError(422, 'Job has no line items to extend');
    const result = await this.request<UrableItem<UrableJob>>('PATCH', `/jobs/${encodeURIComponent(job.id)}`, {
      lineItems: [...current, { productServiceId, quantity }], adjustments: job.invoice?.adjustments ?? [],
    });
    return result.data;
  }

  async cancelJob(jobId: string): Promise<void> {
    await this.request<UrableItem<UrableJob>>('PATCH', `/jobs/${encodeURIComponent(jobId)}`, {
      status: 'canceled',
      canceledAt: Date.now(),
    });
  }
}
