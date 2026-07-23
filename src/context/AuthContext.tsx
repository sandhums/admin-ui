import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AUTH_REQUIRED_EVENT,
  getSession,
  logout,
  type SessionInfo,
} from "../api/bff";

type AuthContextValue = {
  session: SessionInfo | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const s = await getSession();
      setSession(s);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onAuthRequired = () => {
      setSession(null);
      const path = window.location.pathname;
      if (path.startsWith("/login") || path.startsWith("/auth/")) return;
      const returnTo = `${path}${window.location.search}`;
      // Keep path + query so desks like /billing?encounterId=… survive re-login.
      const params = new URLSearchParams({
        expired: "1",
        from: returnTo,
      });
      window.location.assign(`/login?${params}`);
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
  }, []);

  const signOut = useCallback(async () => {
    try {
      const result = await logout("admin");
      setSession(null);
      if (result?.logout_url) {
        window.location.href = result.logout_url;
      }
    } catch {
      setSession(null);
    }
  }, []);

  const value = useMemo(
    () => ({ session, loading, refresh, signOut }),
    [session, loading, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
