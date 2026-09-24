import "server-only";
import { AuthService, hasRecentAuth, type AuthSession } from "@storevia/auth";
import { nextCookies } from "@storevia/auth/next";
import type { Principal } from "@storevia/tenancy";
import { requirePlatformStaff, type PlatformContext } from "@storevia/tenancy/platform";
import { isDomainError, unauthenticated } from "@storevia/types";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { env } from "./env";
import { requestInfo } from "./request";

let service: AuthService | undefined;

/**
 * The platform realm (ADR-0021): its own secret and cookie
 * (`storevia-admin.session_token`, SameSite=Strict), 12 h absolute / 30 min
 * idle lifetime, no sign-up, and sessions only for active PlatformStaff.
 */
export function platformAuth(): AuthService {
  service ??= new AuthService({
    realm: "PLATFORM",
    baseURL: env().PLATFORM_ADMIN_URL,
    secret: env().AUTH_PLATFORM_SECRET,
    plugins: [nextCookies()],
  });
  return service;
}

export const getSession = cache(async (): Promise<AuthSession | null> => {
  return platformAuth().getSession(await headers());
});

function toPrincipal(session: AuthSession): Principal {
  return {
    userId: session.userId,
    email: session.email,
    name: session.name,
    emailVerified: session.emailVerified,
    recentlyAuthenticated: hasRecentAuth(session),
  };
}

/** Staff context for pages: sign-in redirect without a session, 403 for non-staff. */
export const requireStaff = cache(async (returnTo?: string): Promise<PlatformContext> => {
  const session = await getSession();
  if (!session) redirect(returnTo ? `/sign-in?next=${encodeURIComponent(returnTo)}` : "/sign-in");
  try {
    return await requirePlatformStaff(toPrincipal(session), await requestInfo());
  } catch (error) {
    if (isDomainError(error)) notFound(); // no hint that this surface exists
    throw error;
  }
});

/** Staff context for server actions: throws (actions return errors, not redirects). */
export async function requireActionStaff(): Promise<PlatformContext> {
  const session = await getSession();
  if (!session) throw unauthenticated();
  return requirePlatformStaff(toPrincipal(session), await requestInfo());
}
