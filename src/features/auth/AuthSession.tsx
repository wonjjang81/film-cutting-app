import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { configuredCloudflareUrl } from '../library/libraryRepositoryFactory';

export type AuthUser = { id: string; email: string; role: 'owner' | 'member' };
type AuthState = 'loading' | 'local' | 'authenticated' | 'unauthenticated';
type AuthContextValue = { state: AuthState; user: AuthUser | null; login(): void; logout(): Promise<void>; refresh(): Promise<void> };

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthSessionProvider({ children }: PropsWithChildren) {
  const baseUrl = configuredCloudflareUrl();
  const [state, setState] = useState<AuthState>(baseUrl ? 'loading' : 'local');
  const [user, setUser] = useState<AuthUser | null>(null);
  const refresh = useCallback(async () => {
    if (!baseUrl) { setState('local'); setUser(null); return; }
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/auth/session`, { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) { setState('unauthenticated'); setUser(null); return; }
      const body = await response.json() as { user?: AuthUser };
      if (!body.user) throw new Error('missing user');
      setUser(body.user); setState('authenticated');
    } catch { setUser(null); setState('unauthenticated'); }
  }, [baseUrl]);
  useEffect(() => { void refresh(); }, [refresh]);
  const login = useCallback(() => {
    if (!baseUrl || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`${baseUrl.replace(/\/$/, '')}/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  }, [baseUrl]);
  const logout = useCallback(async () => {
    if (!baseUrl) return;
    await fetch(`${baseUrl.replace(/\/$/, '')}/api/auth/logout`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    setUser(null); setState('unauthenticated');
  }, [baseUrl]);
  const value = useMemo(() => ({ state, user, login, logout, refresh }), [state, user, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthSession(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthSessionProvider is missing.');
  return value;
}
