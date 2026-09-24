import { baseSecurityHeaders, contentSecurityPolicy } from "@storevia/security";
import { NextResponse, type NextRequest } from "next/server";

// Marketing request proxy: request ID, nonce CSP and security headers on every
// response. The site has no sessions: nothing here reads or sets cookies.

const secure = () => (process.env["MARKETING_URL"] ?? "").startsWith("https://");

export function proxy(request: NextRequest): NextResponse {
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

  const response = NextResponse.next({ request: { headers: forwarded } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-request-id", requestId);
  for (const [key, value] of Object.entries(baseSecurityHeaders(secure()))) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon1.svg|icon2.png|apple-icon.png|robots.txt|sitemap.xml).*)",
  ],
};
