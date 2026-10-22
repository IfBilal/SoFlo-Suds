import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { clearSession, endpoints, restoreSession, saveSession, type SessionResult, type SessionUser } from './api';

interface SessionContextValue { user: SessionUser | null; loading: boolean; refreshUser: () => Promise<void>; signIn: (email: string, password: string) => Promise<void>; signUp: (input: { name: string; email: string; phone: string; password: string; referralCode?: string }) => Promise<void>; signOut: () => Promise<void> }
const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; (async () => { try { if (await restoreSession()) { const me = await endpoints.me(); if (active) setUser(me); } } catch { await clearSession(); } finally { if (active) setLoading(false); } })(); return () => { active = false; }; }, []);
  async function accept(result: SessionResult) { await saveSession(result); setUser(result.user); }
  return <SessionContext.Provider value={{ user, loading, refreshUser: async () => setUser(await endpoints.me()), signIn: async (email, password) => accept(await endpoints.login(email, password)), signUp: async input => accept(await endpoints.signup(input)), signOut: async () => { try { await endpoints.logout(); } finally { await clearSession(); setUser(null); } } }}>{children}</SessionContext.Provider>;
}
export function useSession() { const value = useContext(SessionContext); if (!value) throw new Error('SessionProvider missing'); return value; }
