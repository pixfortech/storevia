import { describe, expect, it } from "vitest";
import { formatBytes, formatEntitlement } from "./format";

describe("formatEntitlement", () => {
  it("renders every value kind for people", () => {
    expect(formatEntitlement("custom_domain", { kind: "BOOLEAN", enabled: true })).toBe("Included");
    expect(formatEntitlement("custom_domain", { kind: "BOOLEAN", enabled: false })).toBeNull();
    expect(formatEntitlement("store_count", { kind: "LIMIT", limit: 3n })).toBe("Up to 3");
    expect(formatEntitlement("store_count", { kind: "LIMIT", limit: 0n })).toBeNull();
    expect(formatEntitlement("product_limit", { kind: "UNLIMITED" })).toBe("Unlimited");
    expect(
      formatEntitlement("analytics", {
        kind: "CONFIGURATION",
        enabled: true,
        config: { retentionDays: 365 },
      }),
    ).toBe("365 days of history");
  });

  it("shows storage in gigabytes, never raw bytes", () => {
    expect(formatEntitlement("media_storage", { kind: "LIMIT", limit: 5n * 1024n ** 3n })).toBe(
      "5 GB",
    );
    expect(formatBytes(1536n * 1024n ** 2n)).toBe("1.5 GB");
    expect(formatBytes(200n * 1024n ** 2n)).toBe("200 MB");
  });
});
