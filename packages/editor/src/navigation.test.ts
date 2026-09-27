// Menus (ADR-0030 §8): labelled typed links, bounded, validated with the
// registry's link kinds.
import { toTypeId } from "@storevia/types";
import { describe, expect, it } from "vitest";
import { NAVIGATION_LIMITS, navigationItemsSchema, usableNavigationItems } from "./navigation";
import { SITE_REGISTRY } from "./registry";

const schema = navigationItemsSchema(SITE_REGISTRY.linkSchema);
const item = (n: number, link: unknown = { type: "home" }, label = `Link ${String(n)}`) => ({
  id: `item${String(n).padStart(8, "0")}`,
  label,
  link,
});

describe("navigation items", () => {
  it("accepts labelled links of registered kinds, trimming labels", () => {
    const page = toTypeId("page", "0190f2a4-0000-7000-8000-000000000001");
    const parsed = schema.parse([
      item(1, { type: "page", id: page }, "  About  "),
      item(2, { type: "url", href: "https://example.com" }),
    ]);
    expect(parsed[0]?.label).toBe("About");
  });

  it.each([
    ["javascript: links", [item(1, { type: "url", href: "javascript:alert(1)" })]],
    ["data: links", [item(1, { type: "url", href: "data:text/html,<script>x</script>" })]],
    ["protocol-relative links", [item(1, { type: "url", href: "//evil.test/x" })]],
    ["unregistered kinds", [item(1, { type: "product", id: "prod_x" })]],
    ["empty labels", [item(1, { type: "home" }, "   ")]],
    ["long labels", [item(1, { type: "home" }, "x".repeat(NAVIGATION_LIMITS.maxLabel + 1))]],
    ["control characters", [item(1, { type: "home" }, "a\u0007b")]],
    ["duplicate ids", [item(1), item(1)]],
    ["bad ids", [{ ...item(1), id: "x" }]],
    ["extra keys", [{ ...item(1), onclick: "x" }]],
    ["too many items", Array.from({ length: NAVIGATION_LIMITS.maxItems + 1 }, (_, i) => item(i))],
    ["a non-array", { 0: item(1) }],
  ])("refuses %s", (_label, input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });

  it("stored items that don't validate render as no menu at all", () => {
    expect(usableNavigationItems("nonsense", SITE_REGISTRY.linkSchema)).toEqual([]);
    expect(
      usableNavigationItems(
        [item(1, { type: "url", href: "javascript:x" })],
        SITE_REGISTRY.linkSchema,
      ),
    ).toEqual([]);
    expect(usableNavigationItems([item(1)], SITE_REGISTRY.linkSchema)).toHaveLength(1);
  });
});
