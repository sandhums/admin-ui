import { Link, useSearchParams } from "react-router-dom";
import { formatOAuthError } from "../api/bff";

export default function AuthErrorPage() {
  const [params] = useSearchParams();
  const error = params.get("error") ?? "unknown";
  const desc = params.get("error_description") ?? "";
  const message = formatOAuthError(error, desc);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Authentication error</h1>
        <p className="error">{message}</p>
      </header>
      <p>
        <Link to="/login">Back to sign in</Link>
      </p>
    </div>
  );
}
