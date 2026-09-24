// Permission primitives and system roles (ADR-0008, docs/architecture/04-auth-rbac.md §7).
// This module is the single source of truth: server enforcement, the
// dashboard's permission-aware navigation and the role-matrix test all read it.
// It has no server dependencies so client components may import it too.

export const PERMISSIONS = [
  "organisation.read",
  "organisation.update",
  "organisation.delete",
  "ownership.transfer",
  "audit.read",
  "member.read",
  "member.manage",
  "billing.read",
  "billing.manage",
  "store.create",
  "store.read",
  "store.update",
  "store.archive",
  "settings.manage",
  "product.read",
  "product.create",
  "product.update",
  "product.delete",
  "collection.manage",
  "inventory.read",
  "inventory.adjust",
  "media.manage",
  "order.read",
  "order.manage",
  "order.refund",
  "customer.read",
  "customer.manage",
  "discount.read",
  "discount.manage",
  "analytics.read",
  "design.edit",
  "page.publish",
  "theme.publish",
  "navigation.manage",
  "domain.manage",
  "api_key.manage",
  "webhook.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const MEMBER_ROLES = [
  "OWNER",
  "ADMIN",
  "STORE_MANAGER",
  "DESIGNER",
  "CATALOGUE_MANAGER",
  "ORDER_MANAGER",
  "MARKETING",
  "SUPPORT",
  "VIEWER",
  // Business-type role presets (ADR-0024).
  "INVENTORY_MANAGER",
  "SITE_MANAGER",
  "CONTENT_MANAGER",
  "EDITOR",
  "AUTHOR",
] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];

const BASE_READ: readonly Permission[] = [
  "organisation.read",
  "store.read",
  "product.read",
  "inventory.read",
];

const OWNER_ONLY: ReadonlySet<Permission> = new Set([
  "organisation.delete",
  "ownership.transfer",
  "billing.manage",
]);

const ROLE_GRANTS: Record<MemberRole, readonly Permission[]> = {
  OWNER: PERMISSIONS,
  ADMIN: PERMISSIONS.filter((p) => !OWNER_ONLY.has(p)),
  STORE_MANAGER: [
    ...BASE_READ,
    "member.read",
    "store.update",
    "settings.manage",
    "product.create",
    "product.update",
    "product.delete",
    "collection.manage",
    "inventory.adjust",
    "media.manage",
    "order.read",
    "order.manage",
    "order.refund",
    "customer.read",
    "customer.manage",
    "discount.read",
    "discount.manage",
    "analytics.read",
    "design.edit",
    "page.publish",
    "theme.publish",
    "navigation.manage",
  ],
  DESIGNER: [
    ...BASE_READ,
    "media.manage",
    "design.edit",
    "page.publish",
    "theme.publish",
    "navigation.manage",
  ],
  CATALOGUE_MANAGER: [
    ...BASE_READ,
    "product.create",
    "product.update",
    "product.delete",
    "collection.manage",
    "inventory.adjust",
    "media.manage",
  ],
  ORDER_MANAGER: [
    ...BASE_READ,
    "inventory.adjust",
    "order.read",
    "order.manage",
    "order.refund",
    "customer.read",
    "customer.manage",
    "discount.read",
  ],
  MARKETING: [
    ...BASE_READ,
    "collection.manage",
    "media.manage",
    "customer.read",
    "discount.read",
    "discount.manage",
    "analytics.read",
    "design.edit",
    "navigation.manage",
  ],
  SUPPORT: [...BASE_READ, "order.read", "customer.read", "customer.manage", "discount.read"],
  VIEWER: [...BASE_READ, "discount.read", "analytics.read"],
  INVENTORY_MANAGER: [...BASE_READ, "inventory.adjust"],
  SITE_MANAGER: [
    ...BASE_READ,
    "member.read",
    "store.update",
    "settings.manage",
    "media.manage",
    "analytics.read",
    "design.edit",
    "page.publish",
    "theme.publish",
    "navigation.manage",
  ],
  CONTENT_MANAGER: [
    ...BASE_READ,
    "media.manage",
    "analytics.read",
    "design.edit",
    "page.publish",
    "navigation.manage",
  ],
  EDITOR: [...BASE_READ, "media.manage", "design.edit", "page.publish"],
  AUTHOR: [...BASE_READ, "media.manage", "design.edit"],
};

const toSet = (role: MemberRole): ReadonlySet<Permission> => new Set<Permission>(ROLE_GRANTS[role]);

export const ROLE_PERMISSIONS: Readonly<Record<MemberRole, ReadonlySet<Permission>>> = {
  OWNER: toSet("OWNER"),
  ADMIN: toSet("ADMIN"),
  STORE_MANAGER: toSet("STORE_MANAGER"),
  DESIGNER: toSet("DESIGNER"),
  CATALOGUE_MANAGER: toSet("CATALOGUE_MANAGER"),
  ORDER_MANAGER: toSet("ORDER_MANAGER"),
  MARKETING: toSet("MARKETING"),
  SUPPORT: toSet("SUPPORT"),
  VIEWER: toSet("VIEWER"),
  INVENTORY_MANAGER: toSet("INVENTORY_MANAGER"),
  SITE_MANAGER: toSet("SITE_MANAGER"),
  CONTENT_MANAGER: toSet("CONTENT_MANAGER"),
  EDITOR: toSet("EDITOR"),
  AUTHOR: toSet("AUTHOR"),
};

export function permissionsFor(role: MemberRole): ReadonlySet<Permission> {
  return ROLE_PERMISSIONS[role];
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function isMemberRole(value: string): value is MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(value);
}

/**
 * A member may grant (or modify a member holding) a role only when that role's
 * permissions are a subset of their own. OWNER is never assignable: ownership
 * moves only through transferOwnership().
 */
export function canAssignRole(actor: MemberRole, target: MemberRole): boolean {
  if (target === "OWNER") return false;
  const own = ROLE_PERMISSIONS[actor];
  for (const permission of ROLE_PERMISSIONS[target]) if (!own.has(permission)) return false;
  return true;
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  STORE_MANAGER: "Store manager",
  DESIGNER: "Designer",
  CATALOGUE_MANAGER: "Catalogue manager",
  ORDER_MANAGER: "Order manager",
  MARKETING: "Marketing",
  SUPPORT: "Support",
  VIEWER: "Viewer",
  INVENTORY_MANAGER: "Inventory manager",
  SITE_MANAGER: "Site manager",
  CONTENT_MANAGER: "Content manager",
  EDITOR: "Editor",
  AUTHOR: "Author",
};
