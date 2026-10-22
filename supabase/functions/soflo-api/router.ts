import type { Deps } from '../_shared/deps.ts';
import { HttpError, errorResponse } from '../_shared/errors.ts';

export interface Ctx { req: Request; deps: Deps; url: URL; params: Record<string, string>; json: () => Promise<unknown> }
export type Handler = (c: Ctx) => Promise<unknown>;
export class Reply { constructor(readonly body: unknown, readonly status = 200) {} }
export const reply = (body: unknown, status = 200) => new Reply(body, status);

interface Route { method: string; re: RegExp; keys: string[]; handler: Handler }
export class Router {
  private routes: Route[] = [];
  add(method: string, pattern: string, handler: Handler) {
    const keys: string[] = [];
    const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_m, k: string) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handler });
  }
  get = (p: string, h: Handler) => this.add('GET', p, h);
  post = (p: string, h: Handler) => this.add('POST', p, h);
  put = (p: string, h: Handler) => this.add('PUT', p, h);
  patch = (p: string, h: Handler) => this.add('PATCH', p, h);
  delete = (p: string, h: Handler) => this.add('DELETE', p, h);

  async handle(req: Request, deps: Deps, path: string): Promise<Response> {
    const origin = req.headers.get('origin');
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Vary: 'Origin' };
    if (origin && deps.adminOrigins.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
      headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
    }
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      const url = new URL(req.url);
      let matchedPath = false;
      for (const r of this.routes) {
        const m = r.re.exec(path);
        if (!m) continue;
        matchedPath = true;
        if (r.method !== req.method) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        const out = await r.handler({ req, deps, url, params, json: () => req.json().catch(() => { throw new HttpError(400, 'VALIDATION_FAILED', 'Invalid request body.'); }) });
        const res = out instanceof Reply ? out : new Reply(out);
        return Response.json(res.body, { status: res.status, headers });
      }
      throw matchedPath ? new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.') : new HttpError(404, 'NOT_FOUND', 'Not found.');
    } catch (error) { return errorResponse(error, headers); }
  }
}
