import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type RequirePermissionProps = {
  permission: string;
  children: ReactNode;
};

export default function RequirePermission({ permission, children }: RequirePermissionProps) {
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

  if (!session.permissions?.includes(permission)) {
    return (
      <div className="page">
        <header className="page-header">
          <h1>Access denied</h1>
          <p className="muted">
            Your account does not have the <code>{permission}</code> permission. Organization
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
