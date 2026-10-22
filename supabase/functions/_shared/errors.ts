import { ZodError } from 'zod';
import { UrableError } from './urable.ts';

/** Typed error carrying the `{ error: { code, message } }` contract the apps already parse. */
export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
export const notFound = (what: string) => new HttpError(404, 'NOT_FOUND', `${what} not found.`);

export function errorResponse(error: unknown, headers: HeadersInit): Response {
  const send = (status: number, code: string, message: string, extra?: unknown) =>
    Response.json({ error: { code, message, ...(extra ? { details: extra } : {}) } }, { status, headers });
  if (error instanceof HttpError) return send(error.status, error.code, error.message);
  if (error instanceof ZodError) return send(400, 'VALIDATION_FAILED', 'Please check the highlighted fields.', error.flatten());
  if (error instanceof UrableError) return send(503, 'URABLE_UNAVAILABLE', 'SoFlo Suds services are temporarily unavailable. Please try again.');
  // Never echo raw database/Urable/Supabase messages, tokens or customer data.
  console.error('unhandled', error instanceof Error ? error.name : typeof error);
  return send(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
}
