export const BFF_BASE = import.meta.env.VITE_BFF_URL ?? "";

/** Full-page OAuth redirects hit the BFF directly (Set-Cookie + Keycloak 302). */
export const BFF_LOGIN_ORIGIN =
  import.meta.env.VITE_BFF_LOGIN_URL ??
  import.meta.env.VITE_BFF_URL ??
  (import.meta.env.DEV ? "http://localhost:8084" : "");

export type { BffErrorBody, DuplicateMatch } from "./errors";
export { BffError } from "./errors";

import { BffError, type BffErrorBody } from "./errors";

export type SessionInfo = {
  authenticated: boolean;
  sub?: string;
  name?: string;
  email?: string;
  practitioner_id?: string;
  personas?: string[];
  permissions?: string[];
  authz_org_id?: string;
  tenant_id?: string;
  hospital_id?: string;
  /** Admin-assigned department/ward scope code, when set. */
  scope_org_unit_code?: string;
  /** Ward ids for bed-board filter. Omitted = org-wide unrestricted; `[]` = no wards; non-empty = allow-list. */
  accessible_wards?: string[];
  landing_path?: string;
};

async function parseErrorBody(res: Response): Promise<BffErrorBody> {
  const text = await res.text();
  if (!text) {
    return { error: res.statusText || "Request failed" };
  }
  try {
    return JSON.parse(text) as BffErrorBody;
  } catch {
    return { error: text };
  }
}

export async function bffFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${BFF_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new BffError(res.status, body);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function getSession(): Promise<SessionInfo> {
  return bffFetch("/bff/session");
}

export function staffLoginUrl(spa: "admin" | "clinical", returnTo = "/"): string {
  const params = new URLSearchParams({ spa, return_to: returnTo });
  const origin = (BFF_LOGIN_ORIGIN || BFF_BASE).replace(/\/$/, "");
  return `${origin}/bff/login?${params}`;
}

export function staffStepUpUrl(spa: "admin" | "clinical", returnTo: string): string {
  const params = new URLSearchParams({ spa, return_to: returnTo });
  const origin = (BFF_LOGIN_ORIGIN || BFF_BASE).replace(/\/$/, "");
  return `${origin}/bff/auth/step-up?${params}`;
}

export async function staffDevLogin(username: string, password: string): Promise<SessionInfo> {
  return bffFetch("/bff/staff/dev-login", {
    method: "POST",
    body: JSON.stringify({ username, password, spa: "admin" }),
  });
}

export async function logout(spa: "admin" | "clinical" = "admin"): Promise<{ logout_url?: string }> {
  return bffFetch("/bff/logout", {
    method: "POST",
    body: JSON.stringify({ spa }),
  });
}

export async function hisFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const normalized = path.startsWith("/") ? path.slice(1) : path;
  return bffFetch(`/bff/his/${normalized}`, init) as Promise<T>;
}
