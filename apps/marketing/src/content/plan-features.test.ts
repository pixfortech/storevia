import { FEATURE_KEYS } from "@storevia/entitlements/features";
import { describe, expect, it } from "vitest";
import { CAPABILITIES } from "./capabilities";
import { FEATURE_GROUPS } from "./plan-features";

describe("pricing presentation", () => {
  it("places every plan feature in exactly one comparison group", () => {
    const grouped = FEATURE_GROUPS.flatMap((g) => g.keys);
    expect([...grouped].sort()).toEqual([...FEATURE_KEYS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("labels future point of sale as future, never as available", () => {
    expect(CAPABILITIES.find((c) => c.id === "retail")?.status).toBe("future");
  });

  it("gives capabilities unique ids, and live ones no milestone", () => {
    for (const item of CAPABILITIES) {
      if (item.status === "available") expect(item.milestone, item.id).toBeUndefined();
    }
    const ids = CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
