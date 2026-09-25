export interface CspOptions {
  readonly nonce: string;
  readonly isDevelopment: boolean;
  /** true when the app is served over HTTPS (adds upgrade-insecure-requests). */
  readonly secure: boolean;
  /** Extra origins images load from (the media CDN or bucket, ADR-0015). */
  readonly imageOrigins?: readonly string[];
  /** Extra origins the browser uploads to directly (the media bucket). */
  readonly uploadOrigins?: readonly string[];
}

/** An http(s) origin, or null for anything else (never a wildcard or a path). */
export function cspOrigin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

/** Nonce-based CSP for the dashboard and platform-admin (threat-model §5). */
export function contentSecurityPolicy({
  nonce,
  isDevelopment,
  secure,
  imageOrigins = [],
  uploadOrigins = [],
}: CspOptions): string {
  const origins = (list: readonly string[]) =>
    list.map((o) => cspOrigin(o)).filter((o): o is string => o !== null);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", ...origins(imageOrigins)],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...origins(uploadOrigins), ...(isDevelopment ? ["ws:"] : [])],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };
  if (secure) directives["upgrade-insecure-requests"] = [];
  return Object.entries(directives)
    .map(([key, values]) => [key, ...values].join(" "))
    .join("; ");
}

/** Headers applied to every dashboard / platform-admin response. */
export function baseSecurityHeaders(secure: boolean): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    ...(secure
      ? { "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload" }
      : {}),
  };
}
