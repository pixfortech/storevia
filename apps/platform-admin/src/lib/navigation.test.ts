import { describe, expect, it } from "vitest";
import { toTypeId } from "@storevia/types";
import { adminNavItems, isNavItemActive, stepUpHref, stepUpReturnPath } from "./navigation";

describe("adminNavItems", () => {
  it("lists Organisations, Jobs and Account for staff with audit access", () => {
    expect(adminNavItems({ canViewJobs: true }).map((i) => i.label)).toEqual([
      "Organisations",
      "Jobs",
      "Account",
    ]);
  });

  it("leaves Jobs out without audit access", () => {
    expect(adminNavItems({ canViewJobs: false }).map((i) => i.href)).toEqual([
      "/organisations",
      "/account",
    ]);
  });
});

describe("isNavItemActive", () => {
  it("matches the section and pages below it, not look-alike prefixes", () => {
    expect(isNavItemActive("/organisations", "/organisations")).toBe(true);
    expect(isNavItemActive("/organisations/org_1", "/organisations")).toBe(true);
    expect(isNavItemActive("/organisations-archive", "/organisations")).toBe(false);
    expect(isNavItemActive("/jobs", "/account")).toBe(false);
  });
});

describe("step-up return path", () => {
  const org = `/organisations/${toTypeId("organisation", "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b")}`;

  it("returns to a well-formed organisation page", () => {
    expect(stepUpReturnPath(org)).toBe(org);
    expect(stepUpHref(org)).toBe(`/account?from=${encodeURIComponent(org)}#confirm`);
  });

  it("rejects anything else, so it can't redirect elsewhere", () => {
    for (const value of [
      null,
      undefined,
      "",
      "/organisations",
      "/organisations/org_nope",
      `${org}/extra`,
      `https://evil.example${org}`,
      "//evil.example/organisations/x",
      `/organisations/${toTypeId("organisation", "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b").replace("org_", "sub_")}`,
    ]) {
      expect(stepUpReturnPath(value)).toBeNull();
    }
    expect(stepUpHref("/jobs")).toBe("/account#confirm");
    expect(stepUpHref()).toBe("/account#confirm");
  });
});
