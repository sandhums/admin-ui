/** BFF / HIS / FHIR error shaping for operator-facing UI. */

export type DuplicateMatch = {
  patient_id: string;
  mrn?: string;
  name?: string;
  birth_date?: string;
  match_reason: string;
};

export type BffErrorBody = {
  error?: string;
  message?: string;
  code?: string;
  duplicates?: DuplicateMatch[];
  step_up_url?: string;
  /** FHIR OperationOutcome when HFS errors are proxied as-is */
  issue?: Array<{
    severity?: string;
    diagnostics?: string;
    details?: { text?: string };
  }>;
};

export const AUTH_REQUIRED_EVENT = "atrius:auth-required";

export type AuthRequiredDetail = {
  spa: "admin" | "clinical";
};

function diagnosticsFromOutcome(body: BffErrorBody & Record<string, unknown>): string | null {
  const issues = body.issue;
  if (!Array.isArray(issues) || issues.length === 0) return null;
  const parts = issues
    .map((issue) => {
      if (!issue || typeof issue !== "object") return null;
      const row = issue as {
        diagnostics?: string;
        details?: { text?: string };
      };
      return row.diagnostics ?? row.details?.text ?? null;
    })
    .filter((p): p is string => !!p && p.trim().length > 0);
  return parts.length ? parts.join("; ") : null;
}

function rawMessage(status: number, body: BffErrorBody): string {
  if (typeof body.message === "string" && body.message.trim()) return body.message;
  if (typeof body.error === "string" && body.error.trim()) return body.error;
  const fromOutcome = diagnosticsFromOutcome(body as BffErrorBody & Record<string, unknown>);
  if (fromOutcome) return fromOutcome;
  return `${status}`;
}

/** Humanize common BFF / HFS denial strings. */
export function humanizeApiMessage(raw: string, status?: number): string {
  const text = raw.trim();
  if (!text) {
    if (status === 401) return "Your session expired. Sign in again.";
    if (status === 403) return "You do not have permission for this action.";
    return "Request failed.";
  }

  const scopeMatch = text.match(/insufficient scope(?: for)?\s+(?:search|read|create|update|delete|write)?\s*on\s+(\w+)/i)
    ?? text.match(/Forbidden:\s*insufficient scope for (\w+)/i)
    ?? text.match(/insufficient scope for search on (\w+)/i);
  if (scopeMatch) {
    const resource = scopeMatch[1];
    return `Missing FHIR access for ${resource}. Sign out and sign in again after scopes are updated, or contact your administrator.`;
  }

  const missingPerm =
    text.match(/missing permission[:\s]+([a-z0-9_:-]+)/i)
    ?? text.match(/requires one of:\s*(.+)$/i)
    ?? text.match(/no policy.*permission[:\s]+([a-z0-9_:-]+)/i);
  if (missingPerm) {
    const perm = missingPerm[1].trim();
    return `Missing permission (${perm}). Ask an administrator to grant this on your role.`;
  }

  if (/hospital.?gstin|gstin not configured/i.test(text)) {
    return "Hospital GSTIN is not configured for this facility. Set Organization hospitalGstin or HIS_HOSPITAL_GSTIN_MAP, then retry.";
  }

  if (/patient_access_denied|patient access denied/i.test(text)) {
    return "You do not have access to this patient. Request break-glass access if clinically necessary.";
  }

  if (status === 401 || /unauthorized|session expired|not authenticated/i.test(text)) {
    return "Your session expired. Sign in again.";
  }

  return text;
}

export class BffError extends Error {
  status: number;
  body: BffErrorBody;

  constructor(status: number, body: BffErrorBody) {
    super(humanizeApiMessage(rawMessage(status, body), status));
    this.name = "BffError";
    this.status = status;
    this.body = body;
  }

  get isDuplicatePatient() {
    return this.status === 409 && this.body.error === "duplicate_patient";
  }

  get isInvalidRequest() {
    return this.status === 400 && this.body.error === "invalid_request";
  }

  get isStepUpRequired() {
    return this.status === 403 && this.body.code === "step_up_required";
  }

  get isUnauthorized() {
    return this.status === 401;
  }
}

/** Operator-facing message for any thrown value. */
export function formatApiError(err: unknown): string {
  if (err instanceof BffError) {
    return err.message;
  }
  if (err instanceof Error && err.message.trim()) {
    return humanizeApiMessage(err.message);
  }
  return humanizeApiMessage(String(err));
}

export type HandleApiErrorOptions = {
  spa: "admin" | "clinical";
  /** Path (+ search) to return to after step-up or re-login. */
  returnTo?: string;
  /** Build step-up URL when body omits step_up_url. */
  stepUpUrl?: (returnTo: string) => string;
  /** Build login URL for 401 (optional — global listener may already redirect). */
  loginUrl?: (returnTo: string) => string;
  /** When true, 401 triggers full-page login redirect from this call. Default false (global handler). */
  redirectOnUnauthorized?: boolean;
};

/**
 * Handle step-up / optional 401 redirects. Returns null if navigation started;
 * otherwise returns a display message.
 */
export function handleApiError(err: unknown, opts: HandleApiErrorOptions): string | null {
  if (err instanceof BffError && err.isStepUpRequired) {
    const returnTo =
      opts.returnTo ?? `${window.location.pathname}${window.location.search}`;
    const url = err.body.step_up_url ?? opts.stepUpUrl?.(returnTo);
    if (url) {
      window.location.href = url;
      return null;
    }
    return "Additional verification is required before this action. Sign in again with elevated access.";
  }

  if (
    opts.redirectOnUnauthorized &&
    err instanceof BffError &&
    err.isUnauthorized &&
    opts.loginUrl
  ) {
    const returnTo =
      opts.returnTo ?? `${window.location.pathname}${window.location.search}`;
    window.location.href = opts.loginUrl(returnTo);
    return null;
  }

  return formatApiError(err);
}

/** Map OAuth callback error codes to short operator copy. */
export function formatOAuthError(error: string, description: string): string {
  const code = error.toLowerCase();
  if (code === "access_denied") {
    return "Sign-in was cancelled or denied. Try again.";
  }
  if (code === "invalid_scope" || /invalid scopes/i.test(description)) {
    return "Sign-in failed because requested FHIR scopes are not configured in Keycloak. Contact IT, then try again.";
  }
  if (code === "login_required" || code === "session_expired") {
    return "Your session expired. Sign in again.";
  }
  if (description.trim()) {
    return `${error}: ${description}`;
  }
  return error === "unknown" ? "Authentication failed. Sign in again." : error;
}

export function notifyAuthRequired(spa: "admin" | "clinical") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AuthRequiredDetail>(AUTH_REQUIRED_EVENT, { detail: { spa } }),
  );
}
