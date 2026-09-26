import { normaliseHostname, storefrontOrigin, verifyPreviewToken } from "@storevia/domains";
import {
  canonicalRedirectHost,
  resolveStoreHost,
  storeAvailability,
} from "@storevia/domains/resolver";
import { mediaImageOrigin } from "@storevia/media/urls";
import { baseSecurityHeaders, contentSecurityPolicy } from "@storevia/security";
import { NextResponse, type NextRequest } from "next/server";
import { internalHeaderKey, isSecure, previewSecret } from "./lib/env";
import { unknownHostPage } from "./lib/pages-html";
import { STORE_HEADER, signStoreHeader, type Availability } from "./lib/store-header";

// The storefront request pipeline (06-storefront.md §2, ADR-0028 §3-§4):
//   Host → normalise → resolve (ACTIVE domains only) → canonical redirect →
//   preview exchange → status page, or rewrite to /sv/{storeId}{path}.
// Every store path is rewritten with the resolved store's id: nothing from
// the request (path, header, cookie) ever chooses the store, and a request
// for /sv/{other}/… lands on /sv/{this}/sv/{other}/… and 404s.

const INTERNAL_PATHS = new Set(["/api/internal/revalidate", "/api/health"]);
const PREVIEW_PARAM = "preview";
const previewCookie = (secure: boolean) => (secure ? "__Host-sv_preview" : "sv_preview");

function securityHeaders(
  response: NextResponse,
  csp: string,
  requestId: string,
  secure: boolean,
): NextResponse {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-request-id", requestId);
  for (const [key, value] of Object.entries(baseSecurityHeaders(false)))
    response.headers.set(key, value);
  // Merchant domains: no includeSubDomains or preload (it would bind their other hosts).
  if (secure) response.headers.set("Strict-Transport-Security", "max-age=31536000");
  return response;
}

function html(body: string, status: number): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const secure = isSecure();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const requestId = crypto.randomUUID();
  const imageOrigin = mediaImageOrigin();
  const csp = contentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV !== "production",
    secure,
    imageOrigins: imageOrigin ? [imageOrigin] : [],
  });
  const url = request.nextUrl;

  const forwarded = new Headers(request.headers);
  for (const name of [...forwarded.keys()]) {
    if (name.toLowerCase().startsWith("x-sv-")) forwarded.delete(name);
  }
  forwarded.set("x-nonce", nonce);
  forwarded.set("x-request-id", requestId);
  forwarded.set("Content-Security-Policy", csp);

  // Worker callbacks and health checks authenticate themselves; they aren't store pages.
  if (INTERNAL_PATHS.has(url.pathname)) {
    return securityHeaders(
      NextResponse.next({ request: { headers: forwarded } }),
      csp,
      requestId,
      secure,
    );
  }

  const hostname = normaliseHostname(request.headers.get("host"));
  const store = hostname ? await resolveStoreHost(hostname) : null;
  if (!store) return securityHeaders(html(unknownHostPage(nonce), 404), csp, requestId, secure);

  // One canonical host per store; the target comes from the database only.
  const redirectHost = canonicalRedirectHost(store);
  if (redirectHost) {
    const target = `${storefrontOrigin(redirectHost)}${url.pathname}${url.search}`;
    return securityHeaders(NextResponse.redirect(target, 301), csp, requestId, secure);
  }

  // Preview links carry a token once; it becomes a host-only cookie and leaves the URL.
  const previewParam = url.searchParams.get(PREVIEW_PARAM);
  if (previewParam !== null) {
    const clean = url.clone();
    clean.searchParams.delete(PREVIEW_PARAM);
    const response = NextResponse.redirect(clean, 303);
    const claims = verifyPreviewToken(previewParam, store.storeId, previewSecret());
    if (claims) {
      response.cookies.set(previewCookie(secure), previewParam, {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/",
        expires: new Date(claims.exp * 1000),
      });
    }
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return securityHeaders(response, csp, requestId, secure);
  }
  const preview =
    verifyPreviewToken(
      request.cookies.get(previewCookie(secure))?.value,
      store.storeId,
      previewSecret(),
    ) !== null;

  const availability: Availability = storeAvailability(store);
  forwarded.set(
    STORE_HEADER,
    signStoreHeader(
      {
        storeId: store.storeId,
        organisationId: store.organisationId,
        name: store.name,
        currency: store.currency,
        locale: store.locale,
        country: store.country,
        hostname: store.hostname,
        canonicalHostname: store.primaryHostname ?? store.hostname,
        availability,
        preview,
        iat: Math.floor(Date.now() / 1000),
      },
      internalHeaderKey(),
    ),
  );

  const target = url.clone();
  if (availability === "unavailable") target.pathname = "/status/unavailable";
  else if (availability === "coming-soon" && !preview) target.pathname = "/status/coming-soon";
  else target.pathname = `/sv/${store.storeId}${url.pathname === "/" ? "" : url.pathname}`;

  const response = NextResponse.rewrite(target, { request: { headers: forwarded } });
  if (preview || availability !== "live") {
    response.headers.set("X-Robots-Tag", "noindex");
    response.headers.set("Cache-Control", "private, no-store");
  }
  return securityHeaders(response, csp, requestId, secure);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
