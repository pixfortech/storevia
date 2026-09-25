import { describe, expect, it } from "vitest";
import { isExamplePreview, parsePeriod } from "./preview";

const DEV = { STOREVIA_ENV: "development", NODE_ENV: "development" };

describe("isExamplePreview", () => {
  it("shows example data only in development and test, and only on request", () => {
    expect(isExamplePreview(DEV, "example")).toBe(true);
    expect(isExamplePreview({ STOREVIA_ENV: "test", NODE_ENV: "test" }, "example")).toBe(true);
    expect(isExamplePreview(DEV, undefined)).toBe(false);
    expect(isExamplePreview(DEV, "1")).toBe(false);
    expect(isExamplePreview(DEV, ["example", "example"])).toBe(false);
  });

  it("never shows example data in a deployed environment", () => {
    for (const stage of ["preview", "staging", "production", "Development", ""]) {
      expect(isExamplePreview({ STOREVIA_ENV: stage, NODE_ENV: "development" }, "example")).toBe(
        false,
      );
    }
  });

  it("fails closed when the stage is unset", () => {
    expect(isExamplePreview({ NODE_ENV: "development" }, "example")).toBe(false);
    expect(isExamplePreview({}, "example")).toBe(false);
  });

  it("stays shut on a production build, even with a development stage", () => {
    for (const stage of ["development", "test"]) {
      expect(isExamplePreview({ STOREVIA_ENV: stage, NODE_ENV: "production" }, "example")).toBe(
        false,
      );
    }
  });
});

describe("parsePeriod", () => {
  it("accepts the three periods and defaults to 30 days", () => {
    expect(parsePeriod("7d")).toBe("7d");
    expect(parsePeriod("90d")).toBe("90d");
    expect(parsePeriod(undefined)).toBe("30d");
    expect(parsePeriod("12m")).toBe("30d");
    expect(parsePeriod(["7d"])).toBe("30d");
  });
});
