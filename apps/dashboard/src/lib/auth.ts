import "server-only";
import { AuthService, hasRecentAuth, type AuthSession } from "@storevia/auth";
import { nextCookies } from "@storevia/auth/next";
import type { Principal } from "@storevia/tenancy";
import { unauthenticated } from "@storevia/types";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { env } from "./env";

let service: AuthService | undefined;

/** The dashboard realm's auth service (one per process). */
export function dashboardAuth(): AuthService {
  service ??= new AuthService({
    realm: "DASHBOARD",
    baseURL: env().DASHBOARD_URL,
    secret: env().AUTH_SECRET,
    plugins: [nextCookies()],
  });
  return service;
}

/** Session for the current request (memoised per request). */
export const getSession = cache(async (): Promise<AuthSession | null> => {
  return dashboardAuth().getSession(await headers());
});

export function toPrincipal(session: AuthSession): Principal {
  return {
    userId: session.userId,
    email: session.email,
    name: session.name,
    emailVerified: session.emailVerified,
    recentlyAuthenticated: hasRecentAuth(session),
  };
}

export async function getPrincipal(): Promise<Principal | null> {
  const session = await getSession();
  return session ? toPrincipal(session) : null;
}

/** For pages and layouts: redirects to sign-in when there is no session. */
export async function requirePrincipal(returnTo?: string): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal) {
    redirect(returnTo ? `/sign-in?next=${encodeURIComponent(returnTo)}` : "/sign-in");
  }
  return principal;
}

/** For server actions: throws UNAUTHENTICATED (actions return errors, not redirects). */
export async function requireActionPrincipal(): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal) throw unauthenticated();
  return principal;
}
