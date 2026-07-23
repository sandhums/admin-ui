import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type RequirePermissionProps = {
  permission?: string;
  /** When set, session needs any one of these permissions. */
  anyOf?: string[];
  children: ReactNode;
};

export default function RequirePermission({
  permission,
  anyOf,
  children,
}: RequirePermissionProps) {
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
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const needed = anyOf?.length ? anyOf : permission ? [permission] : [];
  const allowed =
    needed.length === 0 || needed.some((p) => session.permissions?.includes(p));

  if (!allowed) {
    const label = needed.join(" or ");
    return (
      <div className="page">
        <header className="page-header">
          <h1>Access denied</h1>
          <p className="muted">
            Your account does not have the <code>{label}</code> permission. Organization
            configuration is limited to hospital administrators.
          </p>
        </header>
        <p>
          <Link to="/">Back to OPD front desk</Link>
        </p>
      </div>
    );
  }

  return children;
}

export function hasPermission(session: { permissions?: string[] } | null, permission: string) {
  return session?.permissions?.includes(permission) ?? false;
}

export function hasAnyPermission(
  session: { permissions?: string[] } | null,
  permissions: string[],
) {
  return permissions.some((p) => hasPermission(session, p));
}
