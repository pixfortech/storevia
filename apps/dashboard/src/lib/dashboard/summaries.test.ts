import { describe, expect, it } from "vitest";
import { roleSummary, trialNote } from "./summaries";

describe("roleSummary", () => {
  it("counts roles, most common first, with plurals", () => {
    expect(roleSummary(["OWNER", "DESIGNER"])).toBe("1 owner · 1 designer");
    expect(roleSummary(["OWNER", "VIEWER", "VIEWER"])).toBe("2 viewers · 1 owner");
    expect(roleSummary(["MARKETING", "MARKETING", "OWNER"])).toBe("2 marketing · 1 owner");
  });

  it("folds the rest into a count", () => {
    expect(roleSummary(["OWNER", "ADMIN", "DESIGNER", "EDITOR", "EDITOR", "AUTHOR"])).toBe(
      "2 editors · 1 owner · 1 admin · 2 more",
    );
  });
});

describe("trialNote", () => {
  it("dates the end of a trial and says nothing otherwise", () => {
    const trialEndsAt = new Date("2026-10-08T08:43:16Z");
    expect(trialNote({ status: "TRIAL", trialEndsAt })).toBe("Trial ends 8 Oct 2026");
    expect(trialNote({ status: "ACTIVE", trialEndsAt })).toBeUndefined();
    expect(trialNote({ status: "TRIAL", trialEndsAt: null })).toBeUndefined();
    expect(trialNote(null)).toBeUndefined();
  });
});
