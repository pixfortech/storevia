import { FEATURE_KEYS } from "@storevia/entitlements/features";
import { MEMBER_ROLES, ROLE_LABELS } from "@storevia/tenancy/rbac";
import { describe, expect, it } from "vitest";
import { CAPABILITIES, STATUSES } from "./capabilities";
import { RELEASES, releasesByDay, taggedMilestones, type Release } from "./changelog";
import { ALL_FEATURES, FEATURE_AREAS, statusCounts } from "./features";
import { FEATURE_STATUS } from "./plan-features";
import { ROADMAP } from "./roadmap";
import { roleSummaries } from "./roles";

describe("feature matrix", () => {
  it("lists every plan feature, with the status pricing shows", () => {
    const listed = ALL_FEATURES.flatMap((item) => (item.planFeature ? [item.planFeature] : []));
    expect([...new Set(listed)].sort()).toEqual([...FEATURE_KEYS].sort());
    for (const item of ALL_FEATURES) {
      if (item.planFeature) expect(item.status, item.title).toBe(FEATURE_STATUS[item.planFeature]);
    }
  });

  it("gives each area a unique anchor and links only to capabilities that exist", () => {
    const ids = FEATURE_AREAS.map((area) => area.id);
    expect(new Set(ids).size).toBe(ids.length);
    const capabilities = new Set(CAPABILITIES.map((c) => c.id));
    for (const area of FEATURE_AREAS) {
      if (area.capability) expect(capabilities.has(area.capability), area.id).toBe(true);
      expect(area.glyph ?? area.icon, area.id).toBeDefined();
      expect(area.items.length, area.id).toBeGreaterThan(0);
    }
  });

  it("gives each capability a status its own features share", () => {
    for (const item of CAPABILITIES) {
      const area = FEATURE_AREAS.find((a) => a.capability === item.id);
      if (!area) continue;
      const statuses = new Set(area.items.map((feature) => feature.status));
      expect(statuses.has(item.status), item.id).toBe(true);
    }
  });

  it("never gives a live feature a milestone, and never calls point of sale more than future", () => {
    for (const item of ALL_FEATURES) {
      if (item.status === "available") expect(item.milestone, item.title).toBeUndefined();
    }
    const retail = FEATURE_AREAS.find((area) => area.id === "retail");
    expect(retail?.items.every((item) => item.status === "future")).toBe(true);
  });

  it("counts features by status", () => {
    const counts = statusCounts(ALL_FEATURES);
    expect(Object.keys(counts)).toEqual([...STATUSES]);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(ALL_FEATURES.length);
  });
});

describe("roadmap and changelog", () => {
  it("keeps the roadmap in delivery order: what's done, then what's next", () => {
    const order = ROADMAP.map((stage) => STATUSES.indexOf(stage.status));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(ROADMAP.some((stage) => stage.status === "future")).toBe(false);
  });

  it("lists releases newest first, with real dates and unique anchors", () => {
    const dates = RELEASES.map((release) => release.date);
    for (const date of dates) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(date))).toBe(false);
    }
    expect([...dates].sort().reverse()).toEqual(dates);
    const ids = RELEASES.map((release) => release.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Tagged releases are the milestones; work in progress is never tagged.
    for (const release of RELEASES) {
      if (release.status === "in-progress") expect(release.tag).toBeUndefined();
    }
  });
});

describe("releasesByDay", () => {
  const release = (id: string, date: string): Release => ({
    id,
    date,
    label: id,
    title: id,
    status: "released",
    summary: "",
    changes: [],
  });

  it("groups releases that share a day, keeping their order", () => {
    const days = releasesByDay([
      release("c", "2026-10-02"),
      release("b", "2026-09-24"),
      release("a", "2026-09-24"),
    ]);
    expect(days.map((day) => [day.date, day.releases.map((r) => r.id)])).toEqual([
      ["2026-10-02", ["c"]],
      ["2026-09-24", ["b", "a"]],
    ]);
  });

  it("covers every release once", () => {
    expect(releasesByDay().flatMap((day) => day.releases)).toEqual(RELEASES);
  });

  it("names the tagged milestones, oldest first", () => {
    expect(taggedMilestones()).toEqual(["Milestone 0", "Milestone 1", "Milestone 2"]);
  });
});

describe("roles", () => {
  it("describes every standard role exactly once, with its product label", () => {
    const roles = roleSummaries();
    expect(roles.map((r) => r.role)).toEqual([...MEMBER_ROLES]);
    for (const role of roles) expect(role.label).toBe(ROLE_LABELS[role.role]);
  });
});
