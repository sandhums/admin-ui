import { useSearchParams, Link } from "react-router-dom";

export default function AuthErrorPage() {
  const [params] = useSearchParams();
  const error = params.get("error") ?? "unknown";
  const desc = params.get("error_description") ?? "";

  return (
    <div className="page">
      <header className="page-header">
        <h1>Authentication error</h1>
        <p className="error">
          {error}: {desc}
        </p>
      </header>
      <p>
        <Link to="/login">Back to sign in</Link>
      </p>
    </div>
  );
}
