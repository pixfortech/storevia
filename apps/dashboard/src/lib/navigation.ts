import type { Permission } from "@storevia/tenancy/rbac";

export type NavIcon =
  | "home"
  | "orders"
  | "products"
  | "customers"
  | "website"
  | "analytics"
  | "marketing"
  | "apps"
  | "settings";

export interface NavItem {
  readonly key: string;
  readonly label: string;
  readonly icon: NavIcon;
  readonly segment: string;
  /** The item is shown only to members holding this permission. */
  readonly permission: Permission;
  /** When the area becomes functional; undefined = available now. */
  readonly availability?: string;
  /** Shown in the mobile bottom bar (max 4; the rest go under "More"). */
  readonly primaryOnMobile?: boolean;
}

// Store navigation (docs/architecture/01 §3). Areas that ship later are
// clearly marked placeholders; they render no fake functionality.
export const STORE_NAV: readonly NavItem[] = [
  {
    key: "home",
    label: "Home",
    icon: "home",
    segment: "",
    permission: "store.read",
    primaryOnMobile: true,
  },
  {
    key: "orders",
    label: "Orders",
    icon: "orders",
    segment: "/orders",
    permission: "order.read",
    availability: "Milestone 6",
    primaryOnMobile: true,
  },
  {
    key: "products",
    label: "Products",
    icon: "products",
    segment: "/products",
    permission: "product.read",
    availability: "Milestone 3",
    primaryOnMobile: true,
  },
  {
    key: "customers",
    label: "Customers",
    icon: "customers",
    segment: "/customers",
    permission: "customer.read",
    availability: "Milestone 6",
  },
  {
    key: "website",
    label: "Website",
    icon: "website",
    segment: "/website",
    permission: "design.edit",
    availability: "Milestone 5",
  },
  {
    key: "analytics",
    label: "Analytics",
    icon: "analytics",
    segment: "/analytics",
    permission: "analytics.read",
    availability: "Milestone 8",
  },
  {
    key: "marketing",
    label: "Marketing",
    icon: "marketing",
    segment: "/marketing",
    permission: "discount.read",
    availability: "Milestone 6",
  },
  {
    key: "apps",
    label: "Apps",
    icon: "apps",
    segment: "/apps",
    permission: "settings.manage",
    availability: "a later release",
  },
  {
    key: "settings",
    label: "Settings",
    icon: "settings",
    segment: "/settings",
    permission: "store.read",
    primaryOnMobile: true,
  },
];

export function visibleNav(permissions: ReadonlySet<Permission>): NavItem[] {
  return STORE_NAV.filter((item) => permissions.has(item.permission));
}
