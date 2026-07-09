import type { NavigateFunction } from "react-router-dom";

/** Follow session landing_path — cross-SPA redirects use full URLs. */
export function navigateToLanding(navigate: NavigateFunction, landingPath?: string) {
  const target = landingPath ?? "/";
  if (target.startsWith("http://") || target.startsWith("https://")) {
    window.location.href = target;
    return;
  }
  navigate(target, { replace: true });
}
