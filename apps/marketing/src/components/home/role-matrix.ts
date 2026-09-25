// "Who can do what", read straight from the RBAC definitions the server
// enforces (@storevia/tenancy/rbac), so the home page's permission table
// can't drift from the product. Pure, and unit-tested.
import {
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type MemberRole,
  type Permission,
} from "@storevia/tenancy/rbac";

/** An area of work and the permissions that grant each level of access, strongest first. */
export interface MatrixArea {
  readonly label: string;
  readonly levels: readonly { readonly permission: Permission; readonly label: string }[];
}

export const MATRIX_AREAS: readonly MatrixArea[] = [
  {
    label: "Billing",
    levels: [
      { permission: "billing.manage", label: "Manage" },
      { permission: "billing.read", label: "View" },
    ],
  },
  {
    label: "Team",
    levels: [
      { permission: "member.manage", label: "Manage" },
      { permission: "member.read", label: "View" },
    ],
  },
  {
    label: "Catalogue",
    levels: [
      { permission: "product.update", label: "Edit" },
      { permission: "product.read", label: "View" },
    ],
  },
  {
    label: "Orders",
    levels: [
      { permission: "order.manage", label: "Manage" },
      { permission: "order.read", label: "View" },
    ],
  },
  {
    label: "Pages",
    levels: [
      { permission: "page.publish", label: "Publish" },
      { permission: "design.edit", label: "Edit" },
    ],
  },
];

/** The roles the table shows: owner to viewer, including the publishing roles. */
export const MATRIX_ROLES: readonly MemberRole[] = [
  "OWNER",
  "ADMIN",
  "STORE_MANAGER",
  "ORDER_MANAGER",
  "DESIGNER",
  "AUTHOR",
  "VIEWER",
];

export interface MatrixRow {
  readonly role: MemberRole;
  readonly label: string;
  /** One cell per area: the strongest level the role has, or null for none. */
  readonly cells: readonly (string | null)[];
}

export function roleMatrix(
  roles: readonly MemberRole[] = MATRIX_ROLES,
  areas: readonly MatrixArea[] = MATRIX_AREAS,
): MatrixRow[] {
  return roles.map((role) => {
    const granted = ROLE_PERMISSIONS[role];
    return {
      role,
      label: ROLE_LABELS[role],
      cells: areas.map(
        (area) => area.levels.find((level) => granted.has(level.permission))?.label ?? null,
      ),
    };
  });
}
