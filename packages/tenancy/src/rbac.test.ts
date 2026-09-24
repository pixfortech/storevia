import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canAssignRole,
  MEMBER_ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  type MemberRole,
} from "./rbac";

/** Parses the role matrix table in docs/architecture/04-auth-rbac.md §7.3. */
function documentedMatrix(): Map<string, Set<MemberRole>> {
  const doc = readFileSync(
    resolve(import.meta.dirname, "../../../docs/architecture/04-auth-rbac.md"),
    "utf8",
  );
  const section = doc.slice(doc.indexOf("### 7.3 Role matrix"), doc.indexOf("### 7.4"));
  const lines = section.split("\n").filter((l) => l.startsWith("|"));
  const header = (lines[0] ?? "")
    .split("|")
    .map((c) => c.trim())
    .slice(2, -1) as MemberRole[];
  const matrix = new Map<string, Set<MemberRole>>();
  for (const line of lines.slice(2)) {
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .slice(1, -1);
    const names = (cells[0] ?? "").split("/").map((n) => n.trim());
    const roles = new Set(header.filter((_, i) => cells[i + 1] === "✔"));
    for (const name of names) matrix.set(name, roles);
  }
  return matrix;
}

describe("role matrix", () => {
  it("matches the documented matrix exactly (docs 04 §7.3)", () => {
    const documented = documentedMatrix();
    expect([...documented.keys()].sort()).toEqual([...PERMISSIONS].sort());
    for (const permission of PERMISSIONS) {
      const expected = [...(documented.get(permission) ?? [])].sort();
      const actual = MEMBER_ROLES.filter((role) => ROLE_PERMISSIONS[role].has(permission)).sort();
      expect(actual, permission).toEqual(expected);
    }
  });

  it("grants OWNER every permission and keeps owner-only permissions off ADMIN", () => {
    expect(ROLE_PERMISSIONS.OWNER.size).toBe(PERMISSIONS.length);
    for (const p of ["billing.manage", "ownership.transfer", "organisation.delete"] as const) {
      expect(ROLE_PERMISSIONS.ADMIN.has(p)).toBe(false);
    }
  });

  it("never lets VIEWER see shopper PII", () => {
    expect(ROLE_PERMISSIONS.VIEWER.has("order.read")).toBe(false);
    expect(ROLE_PERMISSIONS.VIEWER.has("customer.read")).toBe(false);
  });
});

describe("canAssignRole", () => {
  it("never assigns OWNER", () => {
    for (const role of MEMBER_ROLES) expect(canAssignRole(role, "OWNER")).toBe(false);
  });
  it("follows the subset rule", () => {
    expect(canAssignRole("OWNER", "ADMIN")).toBe(true);
    expect(canAssignRole("ADMIN", "ADMIN")).toBe(true);
    expect(canAssignRole("ADMIN", "VIEWER")).toBe(true);
    expect(canAssignRole("STORE_MANAGER", "ADMIN")).toBe(false);
    expect(canAssignRole("DESIGNER", "MARKETING")).toBe(false);
    expect(canAssignRole("VIEWER", "VIEWER")).toBe(true);
  });
});
