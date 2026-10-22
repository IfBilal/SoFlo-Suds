import type { Sql } from 'postgres';
import type { UrableClient } from './urable.ts';

export interface AuthIdentity {
  id: string; email: string; emailConfirmed: boolean;
  appMetadata: Record<string, unknown>; userMetadata: Record<string, unknown>;
}
export interface PushMessage { to: string; title: string; body: string; data?: Record<string, string> }
export interface PushTicket { status: string; id?: string; details?: { error?: string } }

/** Everything the handlers touch outside their own logic; tests substitute fakes. */
export interface Deps {
  sql: Sql;
  urable: () => UrableClient;
  /** Server-side verification of a user access token (revoked/banned sessions fail). */
  verifyToken: (token: string) => Promise<AuthIdentity | null>;
  auth: {
    setAppMetadata: (id: string, meta: Record<string, unknown>) => Promise<void>;
    deleteUser: (id: string) => Promise<void>;
  };
  storage: { uploadGallery: (path: string, bytes: Uint8Array, contentType: string) => Promise<string> };
  push: (messages: PushMessage[]) => Promise<PushTicket[]>;
  adminOrigins: string[];
}
