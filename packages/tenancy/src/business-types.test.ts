import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUSINESS_TYPE_DEFINITIONS,
  BUSINESS_TYPES,
  rolePresetsFor,
  STORE_AREAS,
  storeNavigation,
  type BusinessType,
} from "./business-types";
import { MEMBER_ROLES, ROLE_PERMISSIONS, type Permission } from "./rbac";

const all = new Set<Permission>(ROLE_PERMISSIONS.OWNER);
const entitledAll = () => true;
const entitledNone = () => false;

describe("business type definitions", () => {
  it.each(BUSINESS_TYPES)("%s is internally consistent", (type) => {
    const d = BUSINESS_TYPE_DEFINITIONS[type];
    expect(d.type).toBe(type);
    expect(new Set(d.navigation).size).toBe(d.navigation.length);
    expect(d.navigation[0]).toBe("home");
    expect(d.navigation.at(-1)).toBe("settings");
    for (const key of [...d.mobilePrimary, ...d.homeFocus]) expect(d.navigation).toContain(key);
    expect(d.mobilePrimary.length).toBeLessThanOrEqual(3);
    for (const preset of d.rolePresets) {
      expect(MEMBER_ROLES).toContain(preset.role);
      expect(preset.role).not.toBe("OWNER");
    }
    expect(d.rolePresets.map((p) => p.role)).toEqual(expect.arrayContaining(["ADMIN", "VIEWER"]));
  });

  it("matches the ADR-0024 examples for navigation emphasis", () => {
    expect(BUSINESS_TYPE_DEFINITIONS.ECOMMERCE.navigation).toEqual(
      expect.arrayContaining(["orders", "products", "inventory", "customers"]),
    );
    expect(BUSINESS_TYPE_DEFINITIONS.PUBLISHING.navigation).toEqual(
      expect.arrayContaining(["posts", "categories", "authors"]),
    );
    expect(BUSINESS_TYPE_DEFINITIONS.PORTFOLIO.navigation).toContain("projects");
    for (const type of ["BUSINESS", "PUBLISHING", "PORTFOLIO"] as const) {
      expect(BUSINESS_TYPE_DEFINITIONS[type].navigation).not.toContain("orders");
    }
  });

  it("the validation enum lists exactly the business types", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../../validation/src/store.ts"),
      "utf8",
    );
    const listed = /z\.enum\(\[([^\]]+)\]/.exec(
      source.slice(source.indexOf("businessTypeSchema")),
    )?.[1];
    expect(listed?.split(",").map((v) => v.trim().replaceAll('"', ""))).toEqual([
      ...BUSINESS_TYPES,
    ]);
  });
});

describe("storeNavigation never shows more than RBAC and the plan allow", () => {
  it.each(BUSINESS_TYPES)("%s: every item needs the member's permission", (type) => {
    for (const role of MEMBER_ROLES) {
      const permissions = ROLE_PERMISSIONS[role];
      for (const item of storeNavigation(type, permissions, entitledAll)) {
        expect(permissions.has(item.permission), `${type}/${role}/${item.key}`).toBe(true);
      }
    }
  });

  it("the same area is locked or unlocked by the plan, whatever the business type", () => {
    for (const type of BUSINESS_TYPES) {
      for (const item of storeNavigation(type, all, entitledNone)) {
        expect(item.locked, `${type}/${item.key}`).toBe(
          STORE_AREAS[item.key].feature !== undefined,
        );
      }
      expect(storeNavigation(type, all, entitledAll).every((i) => !i.locked)).toBe(true);
    }
  });

  it("a viewer never sees orders or customers, even in an online store", () => {
    const keys = storeNavigation("ECOMMERCE", ROLE_PERMISSIONS.VIEWER, entitledAll).map(
      (i) => i.key,
    );
    expect(keys).not.toContain("orders");
    expect(keys).not.toContain("customers");
  });

  it("changing the business type never changes a member's permissions", () => {
    const types: BusinessType[] = [...BUSINESS_TYPES];
    for (const role of MEMBER_ROLES) {
      const before = [...ROLE_PERMISSIONS[role]];
      for (const type of types) storeNavigation(type, ROLE_PERMISSIONS[role], entitledAll);
      expect([...ROLE_PERMISSIONS[role]]).toEqual(before);
    }
  });
});

describe("role presets map onto permission primitives", () => {
  it("authors write but can't publish; editors can publish", () => {
    expect(ROLE_PERMISSIONS.AUTHOR.has("design.edit")).toBe(true);
    expect(ROLE_PERMISSIONS.AUTHOR.has("page.publish")).toBe(false);
    expect(ROLE_PERMISSIONS.EDITOR.has("page.publish")).toBe(true);
  });

  it("new preset roles grant no commerce, member-management or billing access", () => {
    for (const role of ["SITE_MANAGER", "CONTENT_MANAGER", "EDITOR", "AUTHOR"] as const) {
      for (const p of [
        "order.read",
        "customer.read",
        "member.manage",
        "billing.read",
        "store.create",
      ] as const) {
        expect(ROLE_PERMISSIONS[role].has(p), `${role} ${p}`).toBe(false);
      }
    }
    expect([...ROLE_PERMISSIONS.INVENTORY_MANAGER].sort()).toEqual(
      [
        "inventory.adjust",
        "inventory.read",
        "organisation.read",
        "product.read",
        "store.read",
      ].sort(),
    );
  });

  it("combines presets across an organisation's store types, one per role", () => {
    const presets = rolePresetsFor(["ECOMMERCE", "PUBLISHING", "PORTFOLIO"]);
    const roles = presets.map((p) => p.role);
    expect(new Set(roles).size).toBe(roles.length);
    for (const role of ["STORE_MANAGER", "CONTENT_MANAGER", "AUTHOR", "SITE_MANAGER"]) {
      expect(roles).toContain(role);
    }
    expect(rolePresetsFor([])).toEqual([]);
    // Every preset is an existing role: presets are labels, not a second system.
    for (const preset of rolePresetsFor([...BUSINESS_TYPES])) {
      expect(MEMBER_ROLES).toContain(preset.role);
    }
  });
});
