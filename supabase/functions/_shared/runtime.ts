import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import type { Deps, PushMessage } from './deps.ts';
import { UrableClient } from './urable.ts';

const need = (name: string) => { const v = Deno.env.get(name); if (!v) throw new Error(`${name} is not set`); return v; };

/** Production wiring. Secrets come from the platform-injected function environment only. */
export function productionDeps(): Deps {
  const url = need('SUPABASE_URL');
  const admin = createClient(url, need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  // Direct pooled connection (transaction mode => prepare:false). Bypasses RLS, so every
  // handler must resolve ownership/role itself (see _shared/session.ts).
  const sql = postgres(need('SUPABASE_DB_URL'), { max: 5, prepare: false, idle_timeout: 20, connect_timeout: 10 });
  return {
    sql,
    urable: () => new UrableClient(need('URABLE_API_KEY'), Deno.env.get('URABLE_BASE_URL') ?? undefined),
    verifyToken: async (token) => {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return null;
      const u = data.user;
      return { id: u.id, email: u.email ?? '', emailConfirmed: !!u.email_confirmed_at, appMetadata: u.app_metadata ?? {}, userMetadata: u.user_metadata ?? {} };
    },
    auth: {
      setAppMetadata: async (id, meta) => { const { error } = await admin.auth.admin.updateUserById(id, { app_metadata: meta }); if (error) throw new Error('auth metadata update failed'); },
      deleteUser: async (id) => { const { error } = await admin.auth.admin.deleteUser(id); if (error) throw new Error('auth delete failed'); },
      signIn: async (email, password) => {
        const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? need('SUPABASE_PUBLISHABLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error || !data.session) return { error: { code: error?.code ?? 'unknown' } };
        const s = data.session;
        return { session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in, expires_at: s.expires_at, token_type: s.token_type } };
      },
    },
    storage: {
      uploadGallery: async (path, bytes, contentType) => {
        const bucket = admin.storage.from('gallery');
        const { error } = await bucket.upload(path, bytes, { contentType, upsert: false });
        if (error) throw new Error('storage upload failed');
        return bucket.getPublicUrl(path).data.publicUrl;
      },
    },
    push: async (messages: PushMessage[]) => {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(Deno.env.get('EXPO_ACCESS_TOKEN') ? { Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` } : {}) },
        body: JSON.stringify(messages.map((m) => ({ ...m, sound: 'default', data: m.data ?? {} }))), signal: AbortSignal.timeout(15_000),
      });
      const body = await res.json() as { data?: Array<{ status: string; id?: string; details?: { error?: string } }> };
      if (!res.ok || !body.data) throw new Error('expo push failed');
      return body.data;
    },
    adminOrigins: (Deno.env.get('ADMIN_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  };
}

export async function expoReceipts(ids: string[]) {
  const res = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }), signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json() as { data?: Record<string, { status: string; details?: { error?: string } }> };
  return res.ok && body.data ? body.data : {};
}
