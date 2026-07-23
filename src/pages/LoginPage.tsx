import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { formatApiError, getSession, staffDevLogin, staffLoginUrl } from "../api/bff";
import { safeReturnPath } from "../components/RequireAuth";
import { useAuth } from "../context/AuthContext";
import { navigateToLanding } from "../lib/navigateLanding";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { session, refresh } = useAuth();
  const [username, setUsername] = useState("frontdesk.demo");
  const [password, setPassword] = useState("demo");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDevLogin, setShowDevLogin] = useState(false);

  const returnTo = useMemo(() => {
    const fromQuery = searchParams.get("from");
    const fromState = (location.state as { from?: string } | null)?.from;
    return safeReturnPath(fromQuery ?? fromState ?? null, "/");
  }, [location.state, searchParams]);

  const sessionExpired = searchParams.get("expired") === "1";

  useEffect(() => {
    if (!session?.authenticated) return;
    if (returnTo && returnTo.startsWith("/")) {
      navigate(returnTo, { replace: true });
      return;
    }
    navigateToLanding(navigate, session.landing_path);
  }, [session?.authenticated, session?.landing_path, returnTo, navigate]);

  function signInWithHospitalAccount() {
    window.location.href = staffLoginUrl("admin", returnTo);
  }

  async function onDevSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await staffDevLogin(username, password);
      await refresh();
      const s = await getSession();
      if (returnTo && returnTo.startsWith("/")) {
        navigate(returnTo, { replace: true });
      } else {
        navigateToLanding(navigate, s.landing_path);
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Staff sign in</h1>
        <p className="muted">
          Sign in with your hospital account to use front desk and admin workflows.
        </p>
        {sessionExpired ? (
          <p className="error">Your session expired. Sign in again to continue.</p>
        ) : null}
      </header>
      <div className="card form">
        <button type="button" onClick={signInWithHospitalAccount}>
          Sign in with hospital account
        </button>
        {import.meta.env.DEV ? (
          <>
            <button type="button" className="muted" onClick={() => setShowDevLogin((v) => !v)}>
              {showDevLogin ? "Hide dev login" : "Dev login (password grant)"}
            </button>
            {showDevLogin ? (
              <form onSubmit={onDevSubmit}>
                <label>
                  Username
                  <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </label>
                {error ? <p className="error">{error}</p> : null}
                <button type="submit" disabled={busy}>
                  {busy ? "Signing in…" : "Dev sign in"}
                </button>
              </form>
            ) : null}
          </>
        ) : null}
      </div>
      {import.meta.env.DEV ? (
        <p className="muted">
          Demo: <code>frontdesk.demo</code> / <code>demo</code> (front desk) ·{" "}
          <code>admin.demo</code> / <code>demo</code> (configuration)
        </p>
      ) : null}
    </div>
  );
}
