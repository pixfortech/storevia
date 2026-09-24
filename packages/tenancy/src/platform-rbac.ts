// Platform (Storevia staff) permissions (docs/architecture/05 §5, ADR-0022).
// Separate from merchant RBAC: no merchant role, including OWNER, grants any
// of these. Client-safe (no server imports) so platform-admin navigation can
// use the same map; enforcement is always server-side.

export const PLATFORM_PERMISSIONS = [
  "platform.organisation.read",
  "platform.audit.read",
  "platform.subscription.manage",
  "platform.entitlement_override.manage",
  "platform.billing.simulate",
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

export const PLATFORM_ROLES = [
  "SUPER_ADMIN",
  "OPERATIONS",
  "SUPPORT",
  "BILLING",
  "READ_ONLY",
] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];

const GRANTS: Record<PlatformRole, readonly PlatformPermission[]> = {
  SUPER_ADMIN: PLATFORM_PERMISSIONS,
  BILLING: PLATFORM_PERMISSIONS,
  // Operations can exercise the mock provider outside production (§6), but
  // not change subscriptions or overrides.
  OPERATIONS: ["platform.organisation.read", "platform.audit.read", "platform.billing.simulate"],
  SUPPORT: ["platform.organisation.read", "platform.audit.read"],
  READ_ONLY: ["platform.organisation.read"],
};

export const PLATFORM_ROLE_PERMISSIONS: Readonly<
  Record<PlatformRole, ReadonlySet<PlatformPermission>>
> = {
  SUPER_ADMIN: new Set(GRANTS.SUPER_ADMIN),
  BILLING: new Set(GRANTS.BILLING),
  OPERATIONS: new Set(GRANTS.OPERATIONS),
  SUPPORT: new Set(GRANTS.SUPPORT),
  READ_ONLY: new Set(GRANTS.READ_ONLY),
};

export function platformPermissionsFor(role: PlatformRole): ReadonlySet<PlatformPermission> {
  return PLATFORM_ROLE_PERMISSIONS[role];
}

export const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  SUPER_ADMIN: "Super admin",
  OPERATIONS: "Operations",
  SUPPORT: "Support",
  BILLING: "Billing",
  READ_ONLY: "Read only",
};
