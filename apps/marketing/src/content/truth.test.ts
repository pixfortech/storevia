// The site can't contradict the product (MK-5). Every status the site shows
// for a plan feature, a store area or a business type must agree with the
// platform's own sources, which the dashboard reads too:
// - plan features: @storevia/entitlements/availability (FEATURE_AVAILABILITY)
// - store areas: @storevia/tenancy/business-types (STORE_AREAS)
// - business types: LAUNCH_BUSINESS_TYPES (what the dashboard offers)
// And no public copy names an internal milestone or promises a date.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { FEATURE_AVAILABILITY } from "@storevia/entitlements/availability";
import { FEATURE_KEYS, type FeatureKey } from "@storevia/entitlements/features";
import {
  BUSINESS_TYPES,
  LAUNCH_BUSINESS_TYPES,
  STORE_AREAS,
  type AreaKey,
} from "@storevia/tenancy/business-types";
import { describe, expect, it } from "vitest";
import { COMMERCE_PARTS, PLATFORM } from "@/components/home/content";
import { PRICING_FAQ } from "./faq";
import { BUSINESS_TYPE_STATUS } from "./business-types";
import { CAPABILITIES, capability, type Status } from "./capabilities";
import { ALL_FEATURES } from "./features";
import { FEATURE_STATUS, PREVIEW_FEATURES } from "./plan-features";
import { ROADMAP } from "./roadmap";

/** Available on the site exactly when the platform says so; anything else is not live. */
const agrees = (status: Status, source: "available" | "planned") =>
  source === "available" ? status === "available" : status !== "available";

describe("statuses agree with the platform's sources", () => {
  it("every plan feature's status matches FEATURE_AVAILABILITY", () => {
    for (const key of FEATURE_KEYS) {
      expect(agrees(FEATURE_STATUS[key], FEATURE_AVAILABILITY[key]), key).toBe(true);
    }
  });

  it("every feature on /features that is a plan feature or a store area agrees with its source", () => {
    let checked = 0;
    for (const item of ALL_FEATURES) {
      if (item.planFeature) {
        expect(agrees(item.status, FEATURE_AVAILABILITY[item.planFeature]), item.title).toBe(true);
        checked += 1;
      }
      if (item.area) {
        expect(agrees(item.status, STORE_AREAS[item.area].availability), item.title).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(FEATURE_KEYS.length);
  });

  it("capabilities agree with the store areas and plan features they stand for", () => {
    const areas: Readonly<Record<string, AreaKey>> = {
      commerce: "orders",
      customers: "customers",
      builder: "website",
      content: "posts",
      analytics: "analytics",
    };
    const features: Readonly<Record<string, FeatureKey>> = {
      builder: "visual_builder",
      domains: "custom_domain",
      integrations: "api_access",
      analytics: "analytics",
    };
    for (const [id, area] of Object.entries(areas)) {
      expect(agrees(capability(id).status, STORE_AREAS[area].availability), id).toBe(true);
    }
    for (const [id, key] of Object.entries(features)) {
      expect(agrees(capability(id).status, FEATURE_AVAILABILITY[key]), id).toBe(true);
    }
  });

  it("sells only the business types the dashboard offers", () => {
    for (const type of BUSINESS_TYPES) {
      const offered = (LAUNCH_BUSINESS_TYPES as readonly string[]).includes(type);
      expect(BUSINESS_TYPE_STATUS[type] === "available", type).toBe(offered);
    }
  });

  it("marks what shipped as available: domains, themes, builder, checkout, customers, export", () => {
    for (const id of ["domains", "themes", "builder", "commerce", "customers"]) {
      expect(capability(id).status, id).toBe("available");
    }
    expect(FEATURE_STATUS.export).toBe("available");
    expect(FEATURE_STATUS.custom_domain).toBe("available");
    const home = [...PLATFORM, ...COMMERCE_PARTS];
    for (const title of ["Customers", "Checkout and payments", "Orders, fulfilment and refunds"]) {
      expect(home.find((item) => item.title === title)?.status, title).toBe("available");
    }
  });

  it("never sells what isn't built as available", () => {
    for (const title of [
      "Automatic discounts",
      "Two-step sign-in",
      "Sign in with Google",
      "Access to selected stores",
      "Storefront visitors and conversion",
      "Cash on delivery",
      "Customer accounts",
      "Apps",
    ]) {
      const item = ALL_FEATURES.find((feature) => feature.title === title);
      expect(item?.status, title).toBe("roadmap");
    }
    expect(capability("analytics").status).toBe("roadmap");
    expect(ROADMAP.at(-1)?.status).toBe("roadmap");
    for (const stage of ROADMAP.filter((s) => s.status === "available")) {
      for (const item of stage.items) {
        expect(item, stage.id).not.toMatch(
          /two-step|google|store-level|analytics|automatic discount/i,
        );
      }
    }
  });

  it("every capability has a status from the legend", () => {
    for (const item of CAPABILITIES) {
      expect(["available", "in-development", "roadmap", "future"]).toContain(item.status);
    }
    expect(PRICING_FAQ.some((q) => q.question.includes("On the roadmap"))).toBe(true);
  });
});

describe("plans sell only what exists", () => {
  it("the home page's plan comparison shows only available features", () => {
    for (const key of PREVIEW_FEATURES) {
      expect(FEATURE_AVAILABILITY[key], key).toBe("available");
    }
  });

  it("the pricing FAQ says a planned feature is never part of a plan", () => {
    const answer = PRICING_FAQ.find((q) => q.question.includes("On the roadmap"))?.answer ?? "";
    expect(answer).toMatch(/never part of a plan/);
    expect(answer).not.toMatch(/so you can see how plans differ/);
  });

  it("plan cards and the comparison never show a status next to a plan's feature", () => {
    const cards = FILES.find((file) => file.path === "app/pricing/plan-cards.tsx")?.text ?? "";
    const preview =
      FILES.find((file) => file.path === "components/home/pricing-preview.tsx")?.text ?? "";
    expect(cards).not.toMatch(/STATUS_LABELS|StatusPill|\.status\b/);
    expect(preview).not.toMatch(/STATUS_LABELS|StatusPill|\.status\b/);
  });
});

// Claims about notifications stand on the product's own sources: the
// notification kind in the schema, the worker job that sends it, and the
// title that marks test orders.
const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const read = (path: string) => readFileSync(join(REPO, path), "utf8");

describe("new-order notifications", () => {
  it("are claimed because the product sends them", () => {
    expect(read("packages/database/prisma/schema.prisma")).toMatch(
      /enum StaffNotificationKind \{[^}]*\bNEW_ORDER\b[^}]*\}/,
    );
    expect(read("apps/worker/src/jobs.ts")).toContain('"orders.new-order-notifications"');
    expect(read("packages/commerce/src/orders/messages.ts")).toContain('"New test order"');

    const notifications = ALL_FEATURES.find((item) => item.title === "Notifications");
    expect(notifications?.status).toBe("available");
    expect(notifications?.description).toMatch(/every new order/);
    expect(notifications?.description).toMatch(/test orders are labelled/);
    expect(capability("commerce").points.some((point) => point.includes("every new order"))).toBe(
      true,
    );
    expect(COMMERCE_PARTS.find((part) => part.title === "New-order notifications")?.status).toBe(
      "available",
    );
  });

  it("never promise email, SMS or push alerts, which don't exist", () => {
    const notifications = ALL_FEATURES.find((item) => item.title === "Notifications");
    expect(notifications?.description).not.toMatch(/\b(email|sms|text message|push)\b/i);
    expect(notifications?.description).toMatch(/in-app/);
  });
});

// Public copy: the marketing site's source, comments removed, so only words a
// visitor could read are checked.
const SRC = join(import.meta.dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

const withoutComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\"'`])\/\/.*$/gm, "$1");

const FILES = sources(SRC).map((path) => ({
  path: relative(SRC, path).split(sep).join("/"),
  text: withoutComments(readFileSync(path, "utf8")),
}));

const offending = (pattern: RegExp) =>
  FILES.filter((file) => pattern.test(file.text)).map((file) => file.path);

describe("public copy", () => {
  it("scans the site's source", () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it("never names an internal milestone", () => {
    expect(offending(/\bMilestones? \d/)).toEqual([]);
  });

  it("never promises a release date or a 'coming in' timing", () => {
    expect(offending(/later release|[Cc]oming in |arrives? (in|with)|coming soon/)).toEqual([]);
  });
});
