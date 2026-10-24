import 'react-native-url-polyfill/auto';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/** Release builds must not ship with a missing or malformed backend; fail loudly at startup. */
export const supabaseConfigError = !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost|10\.0\.2\.2|192\.168\.\d+\.\d+):\d+$/.test(url)
  ? 'EXPO_PUBLIC_SUPABASE_URL is missing or not a Supabase project URL.'
  : !/^(sb_publishable_|eyJ)/.test(key) ? 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing or malformed.' : null;
if (supabaseConfigError && !__DEV__) throw new Error(supabaseConfigError);

export const functionsBase = `${url}/functions/v1/soflo-api`;
export const authBase = `${url}/functions/v1/soflo-auth`;
export const publicKey = key;

// SecureStore refuses values over ~2 KB and a session JSON is larger, so values are stored in chunks.
const CHUNK = 1500;
const webStore = () => (typeof localStorage === 'undefined' ? null : localStorage);
const storage = {
  async getItem(name: string) {
    if (Platform.OS === 'web') return webStore()?.getItem(name) ?? null;
    const count = Number(await SecureStore.getItemAsync(`${name}.n`));
    if (!count) return null;
    const parts = await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${name}.${i}`)));
    return parts.some((p) => p === null) ? null : parts.join('');
  },
  async setItem(name: string, value: string) {
    if (Platform.OS === 'web') { webStore()?.setItem(name, value); return; }
    const chunks = value.match(new RegExp(`.{1,${CHUNK}}`, 'gs')) ?? [''];
    await this.removeItem(name);
    await Promise.all(chunks.map((c, i) => SecureStore.setItemAsync(`${name}.${i}`, c)));
    await SecureStore.setItemAsync(`${name}.n`, String(chunks.length));
  },
  async removeItem(name: string) {
    if (Platform.OS === 'web') { webStore()?.removeItem(name); return; }
    const count = Number(await SecureStore.getItemAsync(`${name}.n`)) || 0;
    await Promise.all([...Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${name}.${i}`)), SecureStore.deleteItemAsync(`${name}.n`)]);
  },
};

export const supabase = createClient(url || 'https://invalid.supabase.co', key || 'invalid', {
  auth: { storage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' },
});

// Refresh only while the app is in the foreground (official React Native guidance).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => { if (state === 'active') supabase.auth.startAutoRefresh(); else supabase.auth.stopAutoRefresh(); });
  supabase.auth.startAutoRefresh();
}
