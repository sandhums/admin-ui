import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { hasPermission } from "./RequirePermission";
import { useAuth } from "../context/AuthContext";

function usernameLabel(session: { sub?: string; email?: string } | null) {
  if (!session) return null;
  if (session.email) return session.email;
  if (session.sub && session.sub !== "unknown") return session.sub;
  return null;
}

type AdminLayoutProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export default function AdminLayout({ title, subtitle, children }: AdminLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, signOut } = useAuth();

  const navItems = [
    { path: "/", label: "OPD front desk" },
    { path: "/scheduling", label: "Scheduling board" },
    { path: "/beds", label: "Bed board" },
    { path: "/census", label: "Ops census" },
    ...(hasPermission(session, "billing:read")
      ? [
          { path: "/billing", label: "Billing desk" },
          { path: "/claims", label: "Claims desk" },
        ]
      : []),
    ...(hasPermission(session, "billing:write")
      ? [{ path: "/admin/masters", label: "Masters" }]
      : []),
    ...(hasPermission(session, "config:read")
      ? [{ path: "/admin", label: "Configuration" }]
      : []),
    ...(hasPermission(session, "user:manage")
      ? [
          { path: "/admin/users", label: "Users & roles" },
          { path: "/admin/roles", label: "Roles & permissions" },
        ]
      : []),
  ];

  return (
    <div className="page">
      <header className="page-header">
        <div className="brand-row">
          <div>
            <p className="brand-label">Atrius Front Desk</p>
            <h1>{title}</h1>
            {subtitle ? <p className="muted">{subtitle}</p> : null}
          </div>
          <div className="row actions">
            {session?.authenticated ? (
              <span className="badge">{session.name ?? usernameLabel(session) ?? "Signed in"}</span>
            ) : (
              <Link to="/login" className="link-button">
                Sign in
              </Link>
            )}
            {session?.authenticated ? (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  void signOut().then(() => navigate("/login", { replace: true }));
                }}
              >
                Sign out
              </button>
            ) : null}
          </div>
        </div>
        <nav className="admin-nav" aria-label="Admin sections">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`admin-nav-link${location.pathname === item.path ? " active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
