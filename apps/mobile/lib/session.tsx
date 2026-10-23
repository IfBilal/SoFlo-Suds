import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, clearSession, endpoints, type SessionUser } from './api';
import { supabase } from './supabase';

type SignUpInput = { name: string; email: string; phone: string; password: string; referralCode?: string };
interface SessionContextValue {
  user: SessionUser | null; loading: boolean; refreshUser: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  /** 'verify-email' when the project requires confirmation and no session exists yet. */
  signUp: (input: SignUpInput) => Promise<'signed-in' | 'verify-email'>;
  signOut: () => Promise<void>;
  /** Pick up a session that was just created outside signIn (e.g. email confirmation) and finish the profile. */
  adoptSession: () => Promise<void>;
}
const SessionContext = createContext<SessionContextValue | null>(null);

/** Load the app profile; if the Auth identity has none yet (first login after signup/confirmation), complete it. */
async function loadProfile(): Promise<SessionUser> {
  try { return await endpoints.me(); } catch (e) {
    if (e instanceof ApiError && e.code === 'PROFILE_INCOMPLETE') return endpoints.completeProfile();
    throw e;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const loadId = useRef(0);

  async function hydrate() {
    const id = ++loadId.current;
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { if (id === loadId.current) setUser(null); return; }
      const me = await loadProfile();
      if (id === loadId.current) setUser(me);
    } catch (e) {
      // A dead or disabled account must not leave the app half signed-in; a network blip must not sign anyone out.
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { await clearSession(); if (id === loadId.current) setUser(null); }
    } finally { if (id === loadId.current) setLoading(false); }
  }

  useEffect(() => {
    hydrate();
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') { loadId.current++; setUser(null); } });
    return () => data.subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={{
    user, loading,
    refreshUser: async () => setUser(await endpoints.me()),
    signIn: async (email, password) => { await endpoints.login(email, password); setUser(await loadProfile()); },
    signUp: async (input) => {
      if (!(await endpoints.signup(input))) return 'verify-email';
      setUser(await endpoints.completeProfile());
      return 'signed-in';
    },
    adoptSession: async () => setUser(await loadProfile()),
    signOut: async () => { try { await endpoints.logout(); } finally { await clearSession(); setUser(null); } },
  }}>{children}</SessionContext.Provider>;
}
export function useSession() { const value = useContext(SessionContext); if (!value) throw new Error('SessionProvider missing'); return value; }
