import "server-only";
import { platformDb } from "@storevia/database/platform";
import { DomainError, forbidden, unauthenticated } from "@storevia/types";
import type { Principal, RequestInfo } from "./context";
import {
  platformPermissionsFor,
  type PlatformPermission,
  type PlatformRole,
} from "./platform-rbac";

export * from "./platform-rbac";

/**
 * Trusted context for a Storevia staff member (docs 03 §7). Built only by
 * requirePlatformStaff, which re-reads PlatformStaff on every request, so a
 * deactivated or demoted staff member loses access on their next request.
 */
export interface PlatformContext {
  readonly kind: "platform";
  readonly principal: Principal;
  readonly userId: string;
  readonly role: PlatformRole;
  readonly permissions: ReadonlySet<PlatformPermission>;
  readonly request: RequestInfo;
}

const issued = new WeakSet<object>();

/** Throws unless the context was issued by requirePlatformStaff. */
export function assertPlatformContext(ctx: PlatformContext): void {
  if (!issued.has(ctx)) throw new Error("platform context was not issued by packages/tenancy");
}

/**
 * Resolves a platform-realm principal to an active PlatformStaff member.
 * Merchant roles (even OWNER) grant nothing here. Any failure is FORBIDDEN.
 */
export async function requirePlatformStaff(
  principal: Principal | null | undefined,
  request: RequestInfo = {},
): Promise<PlatformContext> {
  if (!principal) throw unauthenticated();
  if (!principal.emailVerified) throw forbidden();
  const staff = await platformDb().platformStaff.findUnique({
    where: { userId: principal.userId },
    select: { role: true, active: true, user: { select: { status: true } } },
  });
  if (!staff?.active || staff.user.status !== "ACTIVE") throw forbidden();
  const ctx: PlatformContext = Object.freeze({
    kind: "platform" as const,
    principal,
    userId: principal.userId,
    role: staff.role,
    permissions: platformPermissionsFor(staff.role),
    request,
  });
  issued.add(ctx);
  return ctx;
}

export function hasPlatformPermission(
  ctx: PlatformContext,
  permission: PlatformPermission,
): boolean {
  return ctx.permissions.has(permission);
}

export function requirePlatformPermission(
  ctx: PlatformContext,
  permission: PlatformPermission,
): void {
  assertPlatformContext(ctx);
  if (!ctx.permissions.has(permission)) throw forbidden();
}

/** Sensitive staff changes need a password re-confirmation in the last 10 minutes. */
export function requirePlatformStepUp(ctx: PlatformContext): void {
  if (!ctx.principal.recentlyAuthenticated) {
    throw new DomainError(
      "REAUTHENTICATION_REQUIRED",
      "Confirm your password to make billing changes.",
    );
  }
}
