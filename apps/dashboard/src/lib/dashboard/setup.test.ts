import { permissionsFor } from "@storevia/tenancy/rbac";
import { describe, expect, it } from "vitest";
import { STORE_AREAS } from "@storevia/tenancy/business-types";
import { greeting, setupTasks, storeStatusBadge, websiteLaunchNote } from "./setup";

const STORE = "01a0d295-535d-7799-bbc1-d31bb24cb9b4";
const ORG = "01a0d295-5300-7000-8000-000000000001";

const tasks = (role: Parameters<typeof permissionsFor>[0], memberCount: number | null = 1) =>
  setupTasks({
    storeId: STORE,
    organisationId: ORG,
    storeName: "Acme Flagship",
    businessType: "ECOMMERCE",
    permissions: permissionsFor(role),
    memberCount,
  });

describe("setupTasks", () => {
  it("gives an owner every step, with real links", () => {
    const steps = tasks("OWNER");
    expect(steps.map((s) => s.key)).toEqual([
      "create-store",
      "store-details",
      "invite-team",
      "business-type",
    ]);
    expect(steps[0]).toMatchObject({
      done: true,
      description: "Acme Flagship is set up as online store.",
    });
    expect(steps[1]?.href).toMatch(/^\/s\/store_[0-9a-z]+\/settings$/);
    expect(steps[1]?.action).toBe("Review");
    expect(steps[2]?.href).toMatch(/^\/o\/org_[0-9a-z]+\/members#invite$/);
    expect(steps[2]?.description).toBe(
      "Suggested for online store: store manager, order manager, catalogue manager.",
    );
  });

  it("keeps every step permission-gated", () => {
    const steps = tasks("DESIGNER");
    expect(steps.map((s) => s.key)).toEqual(["create-store", "store-details"]);
    expect(steps[1]?.action).toBe("View");
  });

  it("marks the team step done only when someone else has joined", () => {
    const invite = (count: number | null) =>
      tasks("OWNER", count).find((s) => s.key === "invite-team");
    expect(invite(1)?.done).toBe(false);
    expect(invite(null)?.done).toBe(false);
    expect(invite(2)?.done).toBe(true);
  });
});

describe("storeStatusBadge", () => {
  it("never calls a draft store live", () => {
    expect(storeStatusBadge("DRAFT")).toEqual({ label: "Not launched", tone: "neutral" });
    expect(storeStatusBadge("SUSPENDED").tone).toBe("warning");
    expect(storeStatusBadge("ACTIVE").label).toBe("Active");
  });
});

describe("greeting", () => {
  it("uses the first name, or none", () => {
    expect(greeting("Priya Sharma")).toBe("Welcome back, Priya.");
    expect(greeting("  ")).toBe("Welcome back.");
    expect(greeting(null)).toBe("Welcome back.");
  });
});

describe("websiteLaunchNote", () => {
  it("takes the builder's schedule from the website area", () => {
    expect(websiteLaunchNote()).toBe(
      "Visitors can reach this address once storefronts launch in Milestone 4. " +
        `The site builder arrives in ${String(STORE_AREAS.website.availability)}.`,
    );
  });
});
