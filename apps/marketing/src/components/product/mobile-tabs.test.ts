import { BUSINESS_TYPES } from "@storevia/tenancy/business-types";
import { describe, expect, it } from "vitest";
import { mobileTabs } from "./mobile-tabs";

describe("mobileTabs", () => {
  it("puts each business type's main area beside Home", () => {
    expect(mobileTabs("ECOMMERCE")).toEqual({ start: ["home", "orders"], end: ["website"] });
    expect(mobileTabs("BUSINESS")).toEqual({ start: ["home", "pages"], end: ["website"] });
    expect(mobileTabs("PUBLISHING")).toEqual({ start: ["home", "posts"], end: ["website"] });
    expect(mobileTabs("PORTFOLIO")).toEqual({ start: ["home", "projects"], end: ["website"] });
  });

  it("never repeats a tab", () => {
    for (const type of BUSINESS_TYPES) {
      const { start, end } = mobileTabs(type);
      const all = [...start, ...end];
      expect(new Set(all).size).toBe(all.length);
    }
  });
});
