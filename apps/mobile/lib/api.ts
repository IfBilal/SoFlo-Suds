import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { functionsBase, publicKey, supabase } from './supabase';

export interface SessionUser { id: string; name: string; email: string; phone?: string; points?: number; notificationAppointments?: boolean; notificationPromos?: boolean }
export interface Service { id: string; name: string; category: string; description?: string; priceCents?: number; durationMinutes?: number; imageUrl?: string; tiers?: Array<{ label?: string; priceCents: number; durationMinutes?: number }>; addOns?: Array<{ id: string; name: string; priceCents?: number }> }
export interface Booking { id: string; serviceId?: string; vehicleId?: string; serviceName: string; vehicleName: string; scheduledAt: string; status: string; location?: string; paymentStatus?: string; totalCents?: number; reward?: { id: string; code: string; name: string } | null; products?: Array<{ productId: string; name: string; quantity: number; priceCents: number }> }
export interface BookingHandoff { state: 'pending' | 'ambiguous' | 'expired' | 'matched'; booking?: Booking }
export interface Vehicle { id: string; name: string; year?: number; make?: string; model?: string; color?: string; plate?: string }
export interface RewardSummary { points: number; rewards: Array<{ id: string; name: string; pointsCost: number; description?: string }>; activity: Array<{ id: string; label: string; delta: number; createdAt: string }>; redemptions: Array<{ id: string; code: string; status: string; name: string; appliedJobId?: string | null }>; referralCode?: string }
export interface ProtectionRecord { id: string; vehicleId: string; vehicleName: string; serviceName: string; appliedOn: string; product?: string; coverage?: string; expiresOn?: string }
export interface ShopProduct { id: string; name: string; brand?: string; category?: string; description?: string; priceCents?: number; imageUrl?: string }
export interface GalleryProject { id: string; title: string; caption?: string; tag?: string; beforeUrl: string; afterUrl: string }
export interface Review { id: string; rating: number; body?: string; customerName: string; createdAt: string }
export interface ShopConfig { shopAddress?: string | null; shopPhone?: string | null; shopEmail?: string | null; mobileAreaText?: string | null; minAppVersion?: string | null; maintenanceMessage?: string | null; promoBannerText?: string | null }


let installIdCache: string | undefined;
/** A random id kept for the life of this app install. It only lets the server refuse a "referral" between accounts made on the same device. */
async function installId(): Promise<string> {
  if (installIdCache) return installIdCache;
  const fresh = () => Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 8)).join('');
  try {
    const stored = Platform.OS === 'web' ? globalThis.localStorage?.getItem('soflo_install_id') : await SecureStore.getItemAsync('soflo_install_id');
    if (stored) return (installIdCache = stored);
    const id = fresh();
    if (Platform.OS === 'web') globalThis.localStorage?.setItem('soflo_install_id', id); else await SecureStore.setItemAsync('soflo_install_id', id);
    return (installIdCache = id);
  } catch { return (installIdCache = fresh()); }
}

export class ApiError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }

/** Drop the local session (used after account deletion and on an unrecoverable 401). */
export async function clearSession() { await supabase.auth.signOut({ scope: 'local' }); }

async function currentToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Authenticated call to the soflo-api Edge Function; the user JWT goes in Authorization, the public key in apikey. */
export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const token = await currentToken();
  let response: Response;
  try {
    response = await fetch(`${functionsBase}${path}`, { ...options, headers: { Accept: 'application/json', apikey: publicKey, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach SoFlo Suds. Check your connection and try again.');
  }
  if (response.status === 401 && retry && token) {
    const { data } = await supabase.auth.refreshSession();
    if (data.session) return api<T>(path, options, false);
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload ? (payload as { error: { code?: string; message?: string } }).error : undefined;
    throw new ApiError(response.status, error?.code ?? 'REQUEST_FAILED', error?.message ?? 'Something went wrong. Please try again.');
  }
  return payload as T;
}

const authMessages: Record<string, string> = {
  invalid_credentials: 'Email or password is incorrect.',
  email_not_confirmed: 'Please confirm your email first. Check your inbox for the link.',
  user_already_exists: 'This email already has an account.',
  email_exists: 'This email already has an account.',
  weak_password: 'Choose a stronger password (at least 8 characters).',
  over_request_rate_limit: 'Too many attempts. Please wait a few minutes and try again.',
  over_email_send_rate_limit: 'Too many emails requested. Please wait a few minutes and try again.',
};
/** Never surface raw Supabase Auth messages. */
export function authError(error: { code?: string; status?: number } | null | undefined, fallback = 'Something went wrong. Please try again.'): ApiError {
  return new ApiError(error?.status ?? 400, error?.code ?? 'AUTH_FAILED', (error?.code && authMessages[error.code]) || fallback);
}

export const AUTH_REDIRECT = 'soflosuds://reset';
export const CONFIRM_REDIRECT = 'soflosuds://confirm';

export const endpoints = {
  me: () => api<SessionUser>('/me'),
  /** Public shop contact details, via a narrow RPC (no table access is granted to the app). */
  config: async (): Promise<ShopConfig> => {
    const { data, error } = await supabase.rpc('shop_config');
    if (error) throw new ApiError(500, 'CONFIG_FAILED', 'Could not load shop details.');
    const c = (data ?? {}) as Record<string, string | null>;
    return { shopAddress: c.shop_address ?? null, shopPhone: c.shop_phone ?? null, shopEmail: c.shop_email ?? null, mobileAreaText: c.mobile_area_text ?? null, minAppVersion: c.min_app_version ?? null, maintenanceMessage: c.maintenance_message ?? null, promoBannerText: c.promo_banner_text ?? null };
  },
  login: async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw authError(error, 'Email or password is incorrect.');
  },
  /** Creates the Auth identity. Resolves to true when a session exists (profile can be completed now). */
  signup: async (input: { name: string; email: string; phone: string; password: string; referralCode?: string }): Promise<boolean> => {
    const { data, error } = await supabase.auth.signUp({ email: input.email.toLowerCase(), password: input.password, options: { emailRedirectTo: CONFIRM_REDIRECT, data: { name: input.name, phone: input.phone, ...(input.referralCode ? { referralCode: input.referralCode } : {}) } } });
    if (error) throw authError(error, 'Could not create your account. Please try again.');
    // With email confirmation on, an existing address returns an obfuscated user with no identities.
    if (data.user && data.user.identities?.length === 0) throw new ApiError(409, 'EMAIL_TAKEN', 'This email already has an account.');
    return !!data.session;
  },
  completeProfile: async () => api<SessionUser>('/me/complete', { method: 'POST', body: JSON.stringify({}), headers: { 'x-device-id': await installId() } }),
  forgot: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase(), { redirectTo: AUTH_REDIRECT });
    if (error && error.status !== 400) throw authError(error, 'Password reset is temporarily unavailable. Please contact the shop.');
    return { ok: true };
  },
  /** Exchange the one-time code from the emailed link, then set the new password. */
  /** Trade the one-time code from the confirmation email for a session. Only works on the phone that started signup (PKCE). */
  confirmEmail: async (code: string) => {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw new ApiError(400, 'CONFIRM_FAILED', 'This confirmation link has expired or was opened on a different device. Log in, or sign up again.');
  },
  reset: async (code: string, password: string) => {
    if (code) { const { error } = await supabase.auth.exchangeCodeForSession(code); if (error) throw new ApiError(400, 'RESET_EXPIRED', 'This reset link has expired. Request a new one.'); }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error.code === 'same_password' ? new ApiError(400, 'SAME_PASSWORD', 'Choose a password you have not used before.') : error.status === 401 || error.code === 'session_not_found' ? new ApiError(400, 'RESET_EXPIRED', 'This reset link has expired. Request a new one.') : authError(error);
    return { ok: true };
  },
  logout: async () => { await supabase.auth.signOut(); },
  services: () => api<Service[]>('/services'),
  service: (id: string) => api<Service>(`/services/${encodeURIComponent(id)}`),
  bookings: () => api<Booking[]>('/bookings'),
  startBookingHandoff: () => api<{ attemptId: string; expiresAt: string }>('/bookings/handoff', { method: 'POST' }),
  latestBookingHandoff: () => api<{ attemptId: string; expiresAt: string } | null>('/bookings/handoff/latest'),
  checkBookingHandoff: (attemptId: string, confirmationNumber?: number) => api<BookingHandoff>(`/bookings/handoff/${encodeURIComponent(attemptId)}${confirmationNumber ? `?confirmationNumber=${confirmationNumber}` : ''}`),
  vehicles: () => api<Vehicle[]>('/vehicles'),
  rewards: () => api<RewardSummary>('/rewards'),
  protection: () => api<ProtectionRecord[]>('/protection'),
  shopProducts: () => api<ShopProduct[]>('/shop/products'),
  addProductToBooking: (bookingId: string, productId: string, quantity = 1) => api<{ name: string; asLineItem: boolean }>(`/bookings/${encodeURIComponent(bookingId)}/products`, { method: 'POST', body: JSON.stringify({ productId, quantity }) }),
  attachReward: (bookingId: string, redemptionId: string) => api<{ code: string; name: string }>(`/bookings/${encodeURIComponent(bookingId)}/reward`, { method: 'POST', body: JSON.stringify({ redemptionId }) }),
  nextBookingProducts: () => api<Array<{ productId: string; quantity: number }>>('/shop/next-booking'),
  addToNextBooking: (productId: string, quantity = 1) => api<{ ok: true }>('/shop/next-booking', { method: 'POST', body: JSON.stringify({ productId, quantity }) }),
  removeFromNextBooking: (productId: string) => api<{ ok: true }>(`/shop/next-booking/${encodeURIComponent(productId)}`, { method: 'DELETE' }),
  /** Published gallery rows straight from Postgres under RLS (column-limited grant). */
  gallery: async (): Promise<GalleryProject[]> => {
    const { data, error } = await supabase.from('gallery').select('id,title,caption,tag,before_path,after_path').order('display_order').order('id');
    if (error) throw new ApiError(500, 'GALLERY_FAILED', 'Could not load the gallery.');
    return (data ?? []).map((g) => ({ id: g.id, title: g.title, caption: g.caption ?? undefined, tag: g.tag ?? undefined, beforeUrl: g.before_path, afterUrl: g.after_path }));
  },
  reviews: () => api<Review[]>('/reviews'),
};
