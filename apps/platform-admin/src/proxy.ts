import { baseSecurityHeaders, contentSecurityPolicy, safeRedirectPath } from "@storevia/security";
import { NextResponse, type NextRequest } from "next/server";
import { platformAuth } from "./lib/auth";

// Platform-admin request proxy: request ID, nonce CSP and security headers on
// every response; no indexing; redirect to sign-in without a valid platform
// session and extend the (short) sliding session. Pages and actions still
// resolve the staff member themselves on every request.

const PUBLIC_PREFIXES = ["/sign-in", "/api/health"];

const isPublic = (pathname: string) =>
  PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

const secure = () => (process.env["PLATFORM_ADMIN_URL"] ?? "").startsWith("https://");

function withSecurityHeaders(response: NextResponse, csp: string, requestId: string): NextResponse {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-request-id", requestId);
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "private, no-store");
  for (const [key, value] of Object.entries(baseSecurityHeaders(secure()))) {
    response.headers.set(key, value);
  }
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const requestId = crypto.randomUUID();
  const csp = contentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV !== "production",
    secure: secure(),
  });

  const forwarded = new Headers(request.headers);
  forwarded.set("x-nonce", nonce);
  forwarded.set("x-request-id", requestId);
  forwarded.set("Content-Security-Policy", csp);

  const { pathname, search } = request.nextUrl;
  if (isPublic(pathname)) {
    return withSecurityHeaders(
      NextResponse.next({ request: { headers: forwarded } }),
      csp,
      requestId,
    );
  }

  const { valid, setCookies } = await platformAuth().refreshSession(request.headers);
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
    "/((?!_next/static|_next/image|favicon.ico|icon1.svg|icon2.png|apple-icon.png|robots.txt).*)",
  ],
};
