import type { ActivityEntry } from "@storevia/tenancy";
import { describe, expect, it } from "vitest";
import { describeActivity, relativeTime } from "./activity";

const NOW = new Date("2026-09-25T12:00:00Z");

function entry(
  action: string,
  details: ActivityEntry["details"] = {},
  actor: ActivityEntry["actor"] = { kind: "you" },
  overrides: Partial<ActivityEntry> = {},
): ActivityEntry {
  return {
    id: "evt_1",
    action,
    occurredAt: new Date("2026-09-25T11:55:00Z"),
    actor,
    entityType: null,
    storeId: null,
    details,
    ...overrides,
  };
}

const sentence = (e: ActivityEntry) => describeActivity(e, { now: NOW }).sentence;

describe("describeActivity", () => {
  it("names the actor", () => {
    expect(describeActivity(entry("store.updated"), { now: NOW }).actor).toBe("You");
    const member = entry("store.updated", {}, { kind: "member", name: "Dev Designer" });
    expect(sentence(member)).toBe("Dev Designer updated the store's details.");
    expect(sentence(entry("store.updated", {}, { kind: "member", name: null }))).toBe(
      "A former member updated the store's details.",
    );
    expect(
      sentence(entry("billing.subscription.assigned", { plan: "business" }, { kind: "staff" })),
    ).toBe("Storevia staff moved the organisation to the Business plan.");
    expect(sentence(entry("billing.usage.reconciled", {}, { kind: "system" }))).toBe(
      "Storevia recounted the plan's usage.",
    );
    expect(sentence(entry("store.updated", {}, { kind: "app" }))).toBe(
      "An app updated the store's details.",
    );
  });

  it("describes team changes with role labels", () => {
    expect(sentence(entry("member.invited", { role: "VIEWER" }))).toBe(
      "You invited a new member as Viewer.",
    );
    expect(
      sentence(entry("member.role_changed", { role: "ADMIN", previousRole: "STORE_MANAGER" })),
    ).toBe("You changed a member's role from Store manager to Admin.");
    expect(
      sentence(
        entry("member.invitation_accepted", { role: "DESIGNER" }, { kind: "member", name: "Dev" }),
      ),
    ).toBe("Dev joined the team as Designer.");
    expect(sentence(entry("member.removed", { role: "ADMIN" }))).toBe(
      "You removed a member from the team.",
    );
  });

  it("describes store changes with business type labels", () => {
    expect(
      sentence(entry("store.created", { name: "Acme Flagship", businessType: "ECOMMERCE" })),
    ).toBe("You created the store Acme Flagship as an online store.");
    expect(sentence(entry("store.created", { name: "Journal", businessType: "PUBLISHING" }))).toBe(
      "You created the store Journal as a blog or publication.",
    );
    expect(
      sentence(
        entry("store.business_type_changed", {
          businessType: "PORTFOLIO",
          previousBusinessType: "PUBLISHING",
        }),
      ),
    ).toBe("You changed the business type from blog or publication to portfolio.");
  });

  it("describes plan changes with plan and status names", () => {
    expect(
      sentence(
        entry(
          "billing.subscription.changed",
          { plan: "starter", previousPlan: "enterprise" },
          {
            kind: "staff",
          },
        ),
      ),
    ).toBe("Storevia staff changed the plan from Enterprise to Starter.");
    expect(
      sentence(entry("billing.subscription.trial_started", { plan: "starter" }, { kind: "staff" })),
    ).toBe("Storevia staff started a Starter trial.");
    expect(
      sentence(entry("billing.subscription.synced", { status: "PAST_DUE" }, { kind: "system" })),
    ).toBe("Storevia updated the plan's status to past due.");
    expect(sentence(entry("billing.subscription.expired", {}, { kind: "system" }))).toBe(
      "Storevia ended the plan.",
    );
  });

  it("falls back to a generic sentence for unknown actions and missing details", () => {
    expect(sentence(entry("member.invited"))).toBe("You invited a new member.");
    expect(sentence(entry("member.role_changed", { role: "NOT_A_ROLE" }))).toBe(
      "You changed a member's role.",
    );
    expect(
      sentence(entry("store.renamed_somehow", {}, { kind: "you" }, { entityType: "Store" })),
    ).toBe("You made a change to a store.");
    expect(sentence(entry("something.new"))).toBe("You made a change.");
    const unknown = describeActivity(entry("something.new"), { now: NOW });
    expect(unknown.category).toBe("other");
  });

  it("categorises events for their icons", () => {
    const category = (action: string) => describeActivity(entry(action), { now: NOW }).category;
    expect(category("member.invited")).toBe("team");
    expect(category("store.created")).toBe("store");
    expect(category("billing.subscription.assigned")).toBe("plan");
    expect(category("organisation.updated")).toBe("organisation");
    expect(category("auth.password_changed")).toBe("security");
  });

  it("dates events relatively, with the exact time for tooltips", () => {
    const item = describeActivity(entry("store.updated"), { now: NOW, timeZone: "Asia/Kolkata" });
    expect(item.when).toBe("5 minutes ago");
    expect(item.at).toBe("2026-09-25T11:55:00.000Z");
    expect(item.exact).toContain("17:25");
  });
});

describe("relativeTime", () => {
  const ago = (ms: number) => relativeTime(new Date(NOW.getTime() - ms), NOW);
  const MIN = 60_000;

  it("counts minutes, hours and days, then shows the date", () => {
    expect(ago(20_000)).toBe("just now");
    expect(ago(MIN)).toBe("1 minute ago");
    expect(ago(59 * MIN)).toBe("59 minutes ago");
    expect(ago(3 * 60 * MIN)).toBe("3 hours ago");
    expect(ago(26 * 60 * MIN)).toBe("yesterday");
    expect(ago(4 * 24 * 60 * MIN)).toBe("4 days ago");
    expect(ago(10 * 24 * 60 * MIN)).toBe("15 Sept");
  });

  it("adds the year to dates from another year", () => {
    expect(relativeTime(new Date("2025-12-30T10:00:00Z"), NOW)).toBe("30 Dec 2025");
  });
});
