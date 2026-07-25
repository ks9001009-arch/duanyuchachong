import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { fetchMe, loginApi } from '@/api/auth';
import { resetLoginRedirectFlag } from '@/api/client';
import {
  clearAuthStorage,
  getAccessToken,
  getStoredAdmin,
  setAccessToken,
  setStoredAdmin,
  type StoredAdmin,
} from '@/utils/auth-storage';
type AuthContextValue = {
  admin: StoredAdmin | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<StoredAdmin | null>(() => getStoredAdmin());
  const [loading, setLoading] = useState(() => Boolean(getAccessToken()));
  const bootstrapped = useRef(false);

  const refreshMe = useCallback(async () => {
    const me = await fetchMe();
    const profile = {
      id: me.id,
      username: me.username,
      displayName: me.displayName,
    };
    setStoredAdmin(profile);
    setAdmin(profile);
  }, []);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    const token = getAccessToken();
    if (!token) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await refreshMe();
        resetLoginRedirectFlag();
      } catch {
        clearAuthStorage();
        if (!cancelled) setAdmin(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshMe]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await loginApi(username, password);
    setAccessToken(result.accessToken);
    const profile = {
      id: result.admin.id,
      username: result.admin.username,
      displayName: result.admin.displayName,
    };
    setStoredAdmin(profile);
    setAdmin(profile);
    resetLoginRedirectFlag();
  }, []);

  const logout = useCallback(() => {
    clearAuthStorage();
    setAdmin(null);
  }, []);

  const value = useMemo(
    () => ({
      admin,
      loading,
      isAuthenticated: Boolean(admin && getAccessToken()),
      login,
      logout,
      refreshMe,
    }),
    [admin, loading, login, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
