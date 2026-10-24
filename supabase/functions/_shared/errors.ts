import { ZodError } from 'zod';
import { UrableError } from './urable.ts';

/** Typed error carrying the `{ error: { code, message } }` contract the apps already parse. */
export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
export const notFound = (what: string) => new HttpError(404, 'NOT_FOUND', `${what} not found.`);

const label = (path: PropertyKey[]) => {
  const k = String(path.filter((x) => typeof x === 'string').at(-1) ?? 'This field');
  const words = k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
/** One plain-English sentence per validation issue, so the app can tell people which field to fix. */
export function describeIssue(issue: ZodError['issues'][number]): string {
  const name = label(issue.path);
  const i = issue as unknown as { code: string; origin?: string; minimum?: number | bigint; maximum?: number | bigint };
  if (i.code === 'too_small') return i.origin === 'string' && Number(i.minimum) <= 1 ? `${name} is required.` : i.origin === 'string' ? `${name} must be at least ${i.minimum} characters.` : `${name} must be at least ${i.minimum}.`;
  if (i.code === 'too_big') return i.origin === 'string' ? `${name} is too long (max ${i.maximum} characters).` : `${name} must be at most ${i.maximum}.`;
  if (i.code === 'invalid_type') return `${name} is required.`;
  if (i.code === 'invalid_format') return `${name} is not valid.`;
  return `${name}: ${issue.message}`;
}

export function errorResponse(error: unknown, headers: HeadersInit): Response {
  const send = (status: number, code: string, message: string, extra?: unknown) =>
    Response.json({ error: { code, message, ...(extra ? { details: extra } : {}) } }, { status, headers });
  if (error instanceof HttpError) return send(error.status, error.code, error.message);
  if (error instanceof ZodError) return send(400, 'VALIDATION_FAILED', error.issues.slice(0, 2).map(describeIssue).join(' '), error.flatten());
  if (error instanceof UrableError) return send(503, 'URABLE_UNAVAILABLE', 'SoFlo Suds services are temporarily unavailable. Please try again.');
  // Never echo raw database/Urable/Supabase messages, tokens or customer data.
  console.error('unhandled', error instanceof Error ? error.name : typeof error);
  return send(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
}
