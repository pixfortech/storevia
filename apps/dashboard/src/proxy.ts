import { baseSecurityHeaders, contentSecurityPolicy, safeRedirectPath } from "@storevia/security";
import { NextResponse, type NextRequest } from "next/server";
import { dashboardAuth } from "./lib/auth";
import { MEDIA_RESPONSE_CSP, mediaOrigins } from "./lib/media-origins";

// Runs before every page and server action (Next.js request proxy, Node runtime).
// 1. request ID + nonce-based CSP + security headers on every response;
// 2. protected routes: redirect when there is no valid session, and extend
//    the sliding session expiry (cookies can be written here, not in RSC).
// Pages and actions still verify the session and tenant access themselves;
// this is an early, optimistic check (defence in depth).

const PUBLIC_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/verify-email",
  "/check-email",
  "/forgot-password",
  "/reset-password",
  "/invitations/",
  "/api/health",
  // Provider webhooks authenticate by signature, not session (docs 05 §4).
  "/api/webhooks/",
  // Local media storage (development): uploads authenticate with a signed,
  // single-key token; served files are public by unguessable key, like the
  // production CDN (ADR-0027 §9).
  "/api/media/upload",
  "/media/",
];

const isPublic = (pathname: string) =>
  PUBLIC_PREFIXES.some((prefix) =>
    prefix.endsWith("/")
      ? pathname.startsWith(prefix)
      : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

const secure = () => (process.env["DASHBOARD_URL"] ?? "").startsWith("https://");

function withSecurityHeaders(response: NextResponse, csp: string, requestId: string): NextResponse {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-request-id", requestId);
  for (const [key, value] of Object.entries(baseSecurityHeaders(secure()))) {
    response.headers.set(key, value);
  }
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const requestId = crypto.randomUUID();
  const { pathname, search } = request.nextUrl;
  const csp = pathname.startsWith("/media/")
    ? MEDIA_RESPONSE_CSP
    : contentSecurityPolicy({
        nonce,
        isDevelopment: process.env.NODE_ENV !== "production",
        secure: secure(),
        ...mediaOrigins(),
      });

  const forwarded = new Headers(request.headers);
  forwarded.set("x-nonce", nonce);
  forwarded.set("x-request-id", requestId);
  // Next.js reads the nonce from the request's CSP header for its own scripts.
  forwarded.set("Content-Security-Policy", csp);

  if (isPublic(pathname)) {
    return withSecurityHeaders(
      NextResponse.next({ request: { headers: forwarded } }),
      csp,
      requestId,
    );
  }

  const { valid, setCookies } = await dashboardAuth().refreshSession(request.headers);
  if (!valid) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search =
      pathname === "/"
        ? ""
        : `?next=${encodeURIComponent(safeRedirectPath(`${pathname}${search}`))}`;
    return withSecurityHeaders(NextResponse.redirect(url), csp, requestId);
  }

  const response = NextResponse.next({ request: { headers: forwarded } });
  for (const cookie of setCookies) response.headers.append("Set-Cookie", cookie);
  return withSecurityHeaders(response, csp, requestId);
}

export const config = {
  matcher: [
    // Everything except static assets and image optimisation.
    "/((?!_next/static|_next/image|favicon.ico|icon1.svg|icon2.png|apple-icon.png|robots.txt).*)",
  ],
};
