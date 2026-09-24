/**
 * Accepts only same-origin relative paths ("/stores/x"), so user-supplied
 * `next`/`returnTo` parameters can never become open redirects. The checks run
 * on the NORMALISED path: dot segments like "/.//evil.com" normalise to
 * "//evil.com", which browsers treat as protocol-relative.
 */
export function safeRedirectPath(candidate: string | null | undefined, fallback = "/"): string {
  if (!candidate || candidate.length > 2048) return fallback;
  if (!candidate.startsWith("/")) return fallback;
  for (let i = 0; i < candidate.length; i++) {
    const code = candidate.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return fallback; // control characters
  }
  if (candidate.includes("\\")) return fallback;
  let url: URL;
  try {
    url = new URL(candidate, "http://storevia.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://storevia.invalid") return fallback;
  const path = url.pathname;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return fallback;
  }
  if (decoded.startsWith("//") || decoded.includes("\\")) return fallback;
  return `${path}${url.search}${url.hash}`;
}
