import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? '';
/** Public configuration only; admin rights come from the signed-in user's active `admins` mapping, never from the client. */
export const configError = /^https?:\/\/[^/]+$/.test(url) && /^(sb_publishable_|eyJ)/.test(key) ? null : 'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set.';
export const functionsBase = `${url}/functions/v1/soflo-api`;
export const publicKey = key;
// sessionStorage (not localStorage): closing the tab signs an admin out, as the old admin panel did.
export const supabase = createClient(url || 'https://invalid.supabase.co', key || 'invalid', { auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
