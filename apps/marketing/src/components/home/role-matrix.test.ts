import { ROLE_PERMISSIONS, type MemberRole } from "@storevia/tenancy/rbac";
import { describe, expect, it } from "vitest";
import { MATRIX_AREAS, roleMatrix } from "./role-matrix";

const cells = (role: MemberRole): Record<string, string | null> =>
  Object.fromEntries(
    MATRIX_AREAS.map((area, i) => [area.label, roleMatrix([role])[0]?.cells[i] ?? null]),
  );

describe("roleMatrix", () => {
  it("gives the owner the strongest level everywhere", () => {
    expect(cells("OWNER")).toEqual({
      Billing: "Manage",
      Team: "Manage",
      Catalogue: "Edit",
      Orders: "Manage",
      Pages: "Publish",
    });
  });

  it("keeps billing management with the owner alone", () => {
    expect(cells("ADMIN")["Billing"]).toBe("View");
    for (const row of roleMatrix()) {
      if (row.role !== "OWNER") expect(row.cells[0]).not.toBe("Manage");
    }
  });

  it("shows narrow roles as narrow", () => {
    expect(cells("AUTHOR")).toEqual({
      Billing: null,
      Team: null,
      Catalogue: "View",
      Orders: null,
      Pages: "Edit",
    });
    expect(cells("VIEWER")["Pages"]).toBeNull();
  });

  it("only ever shows a level the role is granted", () => {
    for (const row of roleMatrix()) {
      row.cells.forEach((cell, i) => {
        const level = MATRIX_AREAS[i]?.levels.find((l) => l.label === cell);
        if (cell !== null) {
          expect(level && ROLE_PERMISSIONS[row.role].has(level.permission)).toBe(true);
        }
      });
    }
  });
});
