/**
 * Accepts only same-origin relative paths ("/stores/x"), so user-supplied
 * `next`/`returnTo` parameters can never become open redirects.
 */
export function safeRedirectPath(candidate: string | null | undefined, fallback = "/"): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/\\")) {
    return fallback;
  }
  for (let i = 0; i < candidate.length; i++) {
    const code = candidate.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return fallback; // control characters
  }
  try {
    const url = new URL(candidate, "http://storevia.invalid");
    if (url.origin !== "http://storevia.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
