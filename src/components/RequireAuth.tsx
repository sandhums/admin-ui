import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/** Safe in-app return path (blocks open redirects like //evil.com). */
export function safeReturnPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Loading session…</p>
      </div>
    );
  }

  if (!session?.authenticated) {
    const from = `${location.pathname}${location.search}`;
    const params = new URLSearchParams({ from });
    return (
      <Navigate
        to={`/login?${params.toString()}`}
        replace
        state={{ from }}
      />
    );
  }

  return children;
}
