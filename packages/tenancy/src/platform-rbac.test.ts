import { describe, expect, it } from "vitest";
import { PLATFORM_PERMISSIONS, PLATFORM_ROLES, platformPermissionsFor } from "./platform-rbac";
import { PERMISSIONS } from "./rbac";

// docs/architecture/05 §5: who may do what on the platform surface.
const MATRIX: Record<string, readonly string[]> = {
  SUPER_ADMIN: [...PLATFORM_PERMISSIONS],
  BILLING: [...PLATFORM_PERMISSIONS],
  OPERATIONS: ["platform.organisation.read", "platform.audit.read", "platform.billing.simulate"],
  SUPPORT: ["platform.organisation.read", "platform.audit.read"],
  READ_ONLY: ["platform.organisation.read"],
};

describe("platform role matrix", () => {
  it.each(PLATFORM_ROLES)("%s", (role) => {
    expect([...platformPermissionsFor(role)].sort()).toEqual([...(MATRIX[role] ?? [])].sort());
  });

  it("platform and merchant permissions never overlap", () => {
    const merchant = new Set<string>(PERMISSIONS);
    for (const p of PLATFORM_PERMISSIONS) expect(merchant.has(p)).toBe(false);
  });
});
