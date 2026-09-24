export interface CspOptions {
  readonly nonce: string;
  readonly isDevelopment: boolean;
  /** true when the app is served over HTTPS (adds upgrade-insecure-requests). */
  readonly secure: boolean;
}

/** Nonce-based CSP for the dashboard and platform-admin (threat-model §5). */
export function contentSecurityPolicy({ nonce, isDevelopment, secure }: CspOptions): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(isDevelopment ? ["ws:"] : [])],
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
