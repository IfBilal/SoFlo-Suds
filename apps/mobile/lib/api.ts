import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';
const tokenKey = 'soflo_access_token';
const refreshKey = 'soflo_refresh_token';

export interface SessionUser { id: string; name: string; email: string; phone?: string; points?: number; notificationAppointments?: boolean; notificationPromos?: boolean }
export interface SessionResult { user: SessionUser; accessToken: string; refreshToken: string }
export interface Service { id: string; name: string; category: string; description?: string; priceCents?: number; durationMinutes?: number; imageUrl?: string }
export interface Booking { id: string; serviceId?: string; vehicleId?: string; serviceName: string; vehicleName: string; scheduledAt: string; status: string; location?: string; paymentStatus?: string }
export interface Vehicle { id: string; name: string; year?: number; make?: string; model?: string; color?: string; plate?: string }
export interface RewardSummary { points: number; rewards: Array<{ id: string; name: string; pointsCost: number; description?: string }>; activity: Array<{ id: string; label: string; delta: number; createdAt: string }>; redemptions: Array<{ id: string; code: string; status: string; name: string }>; referralCode?: string }
export interface ProtectionRecord { id: string; vehicleId: string; vehicleName: string; serviceName: string; appliedOn: string; product?: string; coverage?: string; expiresOn?: string }
export interface ShopProduct { id: string; name: string; brand?: string; category?: string; description?: string; priceCents?: number; imageUrl?: string }
export interface GalleryProject { id: string; title: string; caption?: string; tag?: string; beforeUrl: string; afterUrl: string }
export interface Review { id: string; rating: number; body?: string; customerName: string; createdAt: string }
export interface ShopConfig { shopAddress?: string | null; shopPhone?: string | null; shopEmail?: string | null; mobileAreaText?: string | null }

let accessToken: string | null = null;

async function read(key: string) {
  if (Platform.OS === 'web') return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}
async function write(key: string, value: string | null) {
  if (Platform.OS === 'web') { if (typeof localStorage !== 'undefined') value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); return; }
  if (value === null) await SecureStore.deleteItemAsync(key); else await SecureStore.setItemAsync(key, value);
}
export async function restoreAccessToken() { accessToken = await read(tokenKey); return accessToken; }
export async function saveSession(session: SessionResult) { accessToken = session.accessToken; await Promise.all([write(tokenKey, session.accessToken), write(refreshKey, session.refreshToken)]); }
export async function clearSession() { accessToken = null; await Promise.all([write(tokenKey, null), write(refreshKey, null)]); }

export class ApiError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }

let refreshPromise: Promise<boolean> | null = null;
async function refreshSession(): Promise<boolean> {
  refreshPromise ??= (async () => {
    const token = await read(refreshKey);
    if (!token) return false;
    const response = await fetch(`${baseUrl}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: token }) });
    if (!response.ok) { await clearSession(); return false; }
    await saveSession(await response.json() as SessionResult);
    return true;
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}
export async function restoreSession(): Promise<boolean> { await restoreAccessToken(); return accessToken ? true : refreshSession(); }

export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...options.headers } });
  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return api<T>(path, options, false);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload ? (payload as { error: { code?: string; message?: string } }).error : undefined;
    throw new ApiError(response.status, error?.code ?? 'REQUEST_FAILED', error?.message ?? 'Something went wrong. Please try again.');
  }
  return payload as T;
}

export const endpoints = {
  me: () => api<SessionUser>('/me'),
  config: () => api<ShopConfig>('/config'),
  login: (email: string, password: string) => api<SessionResult>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  signup: (input: { name: string; email: string; phone: string; password: string; referralCode?: string }) => api<SessionResult>('/auth/signup', { method: 'POST', body: JSON.stringify(input) }),
  forgot: (email: string) => api<{ ok: boolean }>('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  reset: (token: string, password: string) => api<{ ok: boolean }>('/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) }),
  logout: async () => { const refreshToken = await read(refreshKey); if (refreshToken) await api('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }); },
  services: () => api<Service[]>('/services'),
  bookings: () => api<Booking[]>('/bookings'),
  vehicles: () => api<Vehicle[]>('/vehicles'),
  rewards: () => api<RewardSummary>('/rewards'),
  protection: () => api<ProtectionRecord[]>('/protection'),
  shopProducts: () => api<ShopProduct[]>('/shop/products'),
  gallery: () => api<GalleryProject[]>('/gallery'),
  reviews: () => api<Review[]>('/reviews'),
};
