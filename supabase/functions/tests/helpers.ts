import postgres from 'postgres';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { freshDb, ids, seed } from '../../tests/harness.ts';
import type { Deps, AuthIdentity, PushMessage } from '../_shared/deps.ts';
import type { UrableClient, UrableCustomer, UrableJob, UrablePayment, UrableVehicle } from '../_shared/urable.ts';
import { customerHasEmail } from '../_shared/booking-handoff.ts';
import { buildRouter } from '../soflo-api/app.ts';

export { ids };
export const A = '11111111-1111-4111-8111-111111111111';
export const B = '22222222-2222-4222-8222-222222222222';
export const ORIGIN = 'https://admin.example.test';

export class FakeUrable {
  calls: string[] = [];
  failFor = new Set<string>();
  createdCustomers = 0;
  failCreateOnce = false;
  customers: UrableCustomer[] = [];
  vehicles: Record<string, UrableVehicle[]> = {
    uA: [{ id: 'vA', name: '2020 Honda Civic', customerRef: 'uA', notes: 'Color: Blue' }],
    uB: [{ id: 'vB', name: '2019 Ford F150', customerRef: 'uB' }],
  };
  jobs: UrableJob[] = [
    { id: 'jobA', customerRef: 'uA', itemRefs: ['vA'], status: 'completed', paymentStatus: 'paid', start: 1_800_000_000_000, invoice: { amountPaid: 10000, items: {} } },
    { id: 'jobB', customerRef: 'uB', itemRefs: ['vB'], status: 'scheduled', paymentStatus: 'unpaid', start: 1_900_000_000_000 },
  ];
  payments: UrablePayment[] = [{ id: 'p1', customerRef: 'uA', total: 100, status: 'paid' }, { id: 'pX', customerRef: 'uB', total: 5 }];
  listServices() { return Promise.resolve([{ id: 's1', name: 'Wash', type: 'service' as const, categoryName: 'Washes', description: '<p>Hand wash &amp; dry</p><p>Includes:&#8226; wheels</p>', prices: [{ value: 5000, label: 'Sedan' }, { value: 6000, label: 'SUV', duration: 90 }], virtualShop: true }, { id: 'sAdd', name: 'Air Freshener', type: 'service' as const, categoryName: 'Add-On Services', prices: [{ value: 1500 }], virtualShop: true }]); }
  listAllServices() { return this.listServices(); }
  listShopProducts() { return Promise.resolve([]); }
  listVehicles(c: string) { return Promise.resolve(this.vehicles[c] ?? []); }
  createVehicle(i: { customerId: string; name: string }) { this.calls.push('createVehicle:' + i.customerId); return Promise.resolve('vNew'); }
  updateVehicle(id: string) { this.calls.push('updateVehicle:' + id); return Promise.resolve(); }
  deleteVehicle(id: string) { this.calls.push('deleteVehicle:' + id); return Promise.resolve(); }
  listPayments(c: string) { return Promise.resolve(this.payments.filter((p) => p.customerRef === c)); }
  listJobs(c: string) { if (this.failFor.has(c)) throw new Error('urable down'); return Promise.resolve(this.jobs.filter((j) => j.customerRef === c).concat(c === 'uA' ? [{ id: 'foreign', customerRef: 'uB', itemRefs: ['vB'], status: 'scheduled' }] : [])); }
  getJob(id: string) { const j = this.jobs.find((x) => x.id === id); return j ? Promise.resolve(j) : Promise.reject(Object.assign(new Error('nf'), { status: 404 })); }
  createCustomer() { if (this.failCreateOnce) { this.failCreateOnce = false; throw new Error('urable down'); } this.createdCustomers++; return Promise.resolve('uNew' + this.createdCustomers); }
  failDiscount = false;
  applyDiscount(job: UrableJob, d: { percent: boolean; value: number }) {
    this.calls.push(`discount:${job.id}:${d.percent ? 'pct' : 'fix'}:${d.value}`);
    if (this.failDiscount) return Promise.reject(Object.assign(new Error('urable down'), { status: 503 }));
    const sub = job.invoice?.subtotal ?? 0; const off = d.percent ? Math.round(sub * d.value / 100) : d.value;
    return Promise.resolve({ ...job, invoice: { ...job.invoice, total: sub - off } });
  }
  failNote = false;
  updateCustomer(id: string, i: unknown) { this.calls.push('updateCustomer:' + id + ':' + JSON.stringify(i)); return Promise.resolve(); }
  appendNote(job: UrableJob, line: string) {
    this.calls.push(`note:${job.id}:${line.split(':')[0]}`);
    if (this.failNote) return Promise.reject(Object.assign(new Error('urable down'), { status: 503 }));
    job.notes = [job.notes, line].filter(Boolean).join('\n'); return Promise.resolve(job);
  }
  addLineItem(job: UrableJob, productServiceId: string, quantity: number) { this.calls.push(`line:${job.id}:${productServiceId}:${quantity}`); return Promise.resolve(job); }
  cancelJob(id: string) { this.calls.push('cancelJob:' + id); return Promise.resolve(); }
  findCustomersByEmail(email: string) { return Promise.resolve(this.customers.filter((c) => customerHasEmail(c, email))); }
}

export const identities: Record<string, AuthIdentity> = {
  tokA: { id: ids.authA, email: 'a@t.test', emailConfirmed: true, appMetadata: {}, userMetadata: {} },
  tokB: { id: ids.authB, email: 'b@t.test', emailConfirmed: true, appMetadata: {}, userMetadata: {} },
  tokAdmin: { id: ids.authAdmin, email: 'admin@t.test', emailConfirmed: true, appMetadata: {}, userMetadata: {} },
  tokDeleted: { id: ids.authDeleted, email: 'gone@t.test', emailConfirmed: true, appMetadata: {}, userMetadata: {} },
};

export async function setup() {
  const db = await freshDb(); await seed(db);
  const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  const addr = (server as unknown as { server: { address(): { port: number } } }).server.address();
  const sql = postgres(`postgres://postgres@127.0.0.1:${addr.port}/postgres`, { max: 1, prepare: false, onnotice: () => {} });
  const urable = new FakeUrable();
  const pushed: PushMessage[][] = [];
  const authCalls: string[] = [];
  const state = { pushFails: false };
  const deps: Deps = {
    sql, urable: () => urable as unknown as UrableClient,
    verifyToken: (t) => Promise.resolve(identities[t] ?? null),
    auth: {
      setAppMetadata: (id, meta) => { authCalls.push('meta:' + id); for (const i of Object.values(identities)) if (i.id === id) Object.assign(i.appMetadata, meta); return Promise.resolve(); },
      deleteUser: (id) => { authCalls.push('delete:' + id); return Promise.resolve(); },
      signIn: (email, password) => {
        authCalls.push('signin:' + email);
        if (email === 'unconfirmed@t.test') return Promise.resolve({ error: { code: 'email_not_confirmed' } });
        if (email === 'broken@t.test') return Promise.resolve({ error: { code: 'unexpected_failure' } });
        return Promise.resolve(email === 'a@t.test' && password === 'right-password'
          ? { session: { access_token: 'acc', refresh_token: 'ref', expires_in: 900, token_type: 'bearer' } }
          : { error: { code: 'invalid_credentials' } });
      },
    },
    storage: { uploadGallery: (path) => Promise.resolve(`https://storage.example.test/gallery/${path}`) },
    push: (m) => { if (state.pushFails) return Promise.reject(new Error('down')); pushed.push(m); return Promise.resolve(m.map((_x, i) => ({ status: 'ok', id: `tk${pushed.length}-${i}` }))); },
    adminOrigins: [ORIGIN],
  };
  const router = buildRouter();
  const call = async (method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    let body: BodyInit | undefined;
    if (opts.body instanceof FormData) body = opts.body;
    else if (opts.body !== undefined) { body = JSON.stringify(opts.body); headers['content-type'] = 'application/json'; }
    const res = await router.handle(new Request('https://x.test/functions/v1/soflo-api' + path, { method, headers, body }), deps, path.split('?')[0]);
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null, headers: res.headers, text };
  };
  return { db, sql, deps, urable, call, pushed, authCalls, state, stop: async () => { await sql.end(); await server.stop(); await db.close(); } };
}
