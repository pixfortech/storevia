// Seller identity and store policies (final pass, Phase 2A) against the
// database: server-side validation, RBAC, tenancy, draft/publish with
// revisions, what the storefront role can read, invalidation events, and
// the database's own checks behind the services.
import { withStorefront } from "@storevia/database/storefront";
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getPolicy,
  getSellerProfile,
  isValidGstin,
  listPolicies,
  policyStarter,
  publishPolicy,
  savePolicyDraft,
  unpublishPolicy,
  updateSellerProfile,
} from "../src";
import { plainTextToRichText } from "../src/rich-text";
import { readStorefront, type CartStore } from "../src/storefront";
import { expectCode, makeTenant, memberContext, storeOf, type Tenant } from "./fixtures";

let a: Tenant;
let b: Tenant;
const scopeOf = (tenant: Tenant): CartStore => {
  const s = storeOf(tenant);
  return { organisationId: s.organisationId, storeId: s.storeId, currency: "INR" };
};
const TEXT = plainTextToRichText(
  "Returns are accepted within 7 days of delivery, unused and in the original box.",
);

beforeAll(async () => {
  await truncateAll();
  a = await makeTenant("identity-a");
  b = await makeTenant("identity-b");
});

afterAll(disconnectTestClients);

describe("seller profile", () => {
  it("validates every field on the server and normalises what it keeps", async () => {
    const s = storeOf(a);
    await expectCode(
      updateSellerProfile(s, { legalName: "Evil\r\nBcc: x@example.com" }),
      "VALIDATION_FAILED",
    );
    await expectCode(updateSellerProfile(s, { phone: "call me" }), "VALIDATION_FAILED");
    await expectCode(updateSellerProfile(s, { countryCode: "ZZ" }), "VALIDATION_FAILED");
    await expectCode(
      updateSellerProfile(s, { countryCode: "IN", region: "Atlantis" }),
      "VALIDATION_FAILED",
    );
    await expectCode(updateSellerProfile(s, { gstin: "29ABCDE1234F1Z9" }), "VALIDATION_FAILED");
    const saved = await updateSellerProfile(s, {
      legalName: "  Clay   Studio LLP ",
      phone: "+91 80 4000 1234",
      addressLine1: "4 Park Street",
      city: "Kolkata",
      region: "West Bengal",
      postalCode: "700016",
      countryCode: "in",
      gstin: "27aapfu0939f1zv",
    });
    expect(saved).toMatchObject({
      legalName: "Clay Studio LLP",
      region: "WB",
      countryCode: "IN",
      gstin: "27AAPFU0939F1ZV",
      addressLine2: null,
    });
    expect(await getSellerProfile(s)).toEqual(saved);
    // The audit keeps field names, never the values.
    const audit = await migratorDb().auditLog.findFirstOrThrow({
      where: { action: "store.seller_profile_updated" },
    });
    expect(JSON.stringify(audit.metadata)).not.toContain("Park Street");
  });

  it("GSTIN check characters", () => {
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin("27AAPFU0939F1ZW")).toBe(false);
    expect(isValidGstin("27AAPFU0939F1Z")).toBe(false);
  });

  it("the database refuses control characters and malformed values whatever the path", async () => {
    const s = storeOf(a);
    await expect(
      migratorDb().storeSellerProfile.update({
        where: { storeId: s.storeId },
        data: { legalName: "Name\nInjected: header" },
      }),
    ).rejects.toThrow();
    await expect(
      migratorDb().storeSellerProfile.update({
        where: { storeId: s.storeId },
        data: { gstin: "NOT-A-GSTIN" },
      }),
    ).rejects.toThrow();
  });

  it("RBAC and tenancy: store.update to change, store.read to see, one store only", async () => {
    const s = storeOf(a);
    const designer = await memberContext(a, "DESIGNER", s);
    await expectCode(updateSellerProfile(designer, { legalName: "Hijack" }), "FORBIDDEN");
    const viewer = await memberContext(a, "VIEWER", s);
    expect((await getSellerProfile(viewer)).legalName).toBe("Clay Studio LLP");
    // Another tenant's store has its own (empty) profile and never sees A's.
    expect((await getSellerProfile(storeOf(b))).legalName).toBeNull();
  });
});

describe("store policies", () => {
  it("draft, publish, edit, republish and unpublish, guarded by a revision", async () => {
    const s = storeOf(a);
    expect((await listPolicies(s)).map((p) => [p.kind, p.status])).toEqual([
      ["SHIPPING", "empty"],
      ["REFUND", "empty"],
      ["CANCELLATION", "empty"],
      ["PRIVACY", "empty"],
      ["TERMS", "empty"],
      ["CONTACT", "empty"],
    ]);
    // A starter is headings only and can't be published as a policy.
    const starter = await savePolicyDraft(s, "REFUND", {
      title: "Returns",
      body: policyStarter("REFUND"),
      revision: 0,
    });
    expect(starter.status).toBe("draft");
    await expectCode(
      publishPolicy(s, "REFUND", { revision: starter.revision }),
      "VALIDATION_FAILED",
    );

    const written = await savePolicyDraft(s, "REFUND", {
      title: "Returns and refunds",
      body: TEXT,
      revision: starter.revision,
    });
    // A second tab saving against the old revision is refused.
    await expectCode(
      savePolicyDraft(s, "REFUND", { title: "Old tab", body: TEXT, revision: starter.revision }),
      "CONFLICT",
    );
    await expectCode(publishPolicy(s, "REFUND", { revision: starter.revision }), "CONFLICT");
    const published = await publishPolicy(s, "REFUND", { revision: written.revision });
    expect((await getPolicy(s, "REFUND")).status).toBe("published");

    // Editing the draft doesn't change what shoppers see until republished.
    await savePolicyDraft(s, "REFUND", {
      title: "Returns and refunds",
      body: plainTextToRichText("A new draft that isn't published yet, still being written."),
      revision: published.revision,
    });
    expect((await getPolicy(s, "REFUND")).status).toBe("changed");
    const live = await readStorefront(scopeOf(a), (r) => r.policy("refunds"));
    expect(JSON.stringify(live?.body)).toContain("within 7 days");
    expect(JSON.stringify(live?.body)).not.toContain("new draft");

    await unpublishPolicy(s, "REFUND");
    expect((await getPolicy(s, "REFUND")).status).toBe("draft");
    expect(await readStorefront(scopeOf(a), (r) => r.policy("refunds"))).toBeNull();
  });

  it("rejects unknown kinds, unsafe bodies and control characters in titles", async () => {
    const s = storeOf(a);
    await expectCode(
      savePolicyDraft(s, "COOKIES", { body: TEXT, revision: 0 }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      savePolicyDraft(s, "TERMS", { title: "Terms\u0007", body: TEXT, revision: 0 }),
      "VALIDATION_FAILED",
    );
    await expectCode(
      savePolicyDraft(s, "TERMS", { body: "<script>alert(1)</script>", revision: 0 }),
      "VALIDATION_FAILED",
    );
    const designer = await memberContext(a, "DESIGNER", s);
    await expectCode(savePolicyDraft(designer, "TERMS", { body: TEXT, revision: 0 }), "FORBIDDEN");
  });
});

describe("what the storefront reads", () => {
  beforeAll(async () => {
    const s = storeOf(a);
    const draft = await getPolicy(s, "PRIVACY");
    const saved = await savePolicyDraft(s, "PRIVACY", {
      title: "Privacy",
      body: TEXT,
      revision: draft.revision,
    });
    await publishPolicy(s, "PRIVACY", { revision: saved.revision });
    // Store B: a published policy of its own.
    const other = await savePolicyDraft(storeOf(b), "TERMS", {
      title: "Store B terms",
      body: TEXT,
      revision: 0,
    });
    await publishPolicy(storeOf(b), "TERMS", { revision: other.revision });
  });

  it("the public identity and only this store's published policies", async () => {
    const identity = await readStorefront(scopeOf(a), (r) => r.identity());
    expect(identity).toMatchObject({
      seller: {
        legalName: "Clay Studio LLP",
        phone: "+91 80 4000 1234",
        address: ["4 Park Street", "Kolkata, WB, 700016", "IN"],
      },
      logo: null,
      favicon: null,
    });
    // GSTIN isn't part of the public identity yet (Phase 2B decides where it appears).
    expect(JSON.stringify(identity)).not.toContain("27AAPFU0939F1ZV");
    const links = await readStorefront(scopeOf(a), (r) => r.policyLinks());
    expect(links).toEqual([{ kind: "PRIVACY", title: "Privacy", href: "/policies/privacy" }]);
    expect(await readStorefront(scopeOf(a), (r) => r.policy("terms"))).toBeNull();
    expect((await readStorefront(scopeOf(b), (r) => r.policyLinks())).map((l) => l.kind)).toEqual([
      "TERMS",
    ]);
  });

  it("the storefront role can't read drafts, seller rows or another store's policies", async () => {
    const scope = { organisationId: storeOf(a).organisationId, storeId: storeOf(a).storeId };
    const rows = await withStorefront(
      scope,
      (tx) => tx.$queryRaw<{ kind: string }[]>`SELECT kind::text FROM "StorePolicy"`,
    );
    // REFUND is an unpublished draft now; only PRIVACY is visible, and never B's TERMS.
    expect(rows.map((r) => r.kind)).toEqual(["PRIVACY"]);
    await expect(
      withStorefront(scope, (tx) => tx.$queryRaw`SELECT "bodyDoc" FROM "StorePolicy"`),
    ).rejects.toThrow();
    await expect(
      withStorefront(scope, (tx) => tx.$queryRaw`SELECT * FROM "StoreSellerProfile"`),
    ).rejects.toThrow();
  });

  it("seller and published-policy changes invalidate the store's pages", async () => {
    const s = storeOf(a);
    const db = migratorDb();
    await db.outboxEvent.deleteMany({ where: { storeId: s.storeId } });
    await updateSellerProfile(s, {
      legalName: "Clay Studio Private Limited",
      phone: "+91 80 4000 1234",
      addressLine1: "4 Park Street",
      city: "Kolkata",
      region: "WB",
      postalCode: "700016",
      countryCode: "IN",
    });
    const current = await getPolicy(s, "PRIVACY");
    // A draft edit changes nothing public: no event.
    const saved = await savePolicyDraft(s, "PRIVACY", {
      title: current.title,
      body: plainTextToRichText("An updated privacy policy draft, written by the merchant."),
      revision: current.revision,
    });
    const afterDraft = await db.outboxEvent.count({ where: { storeId: s.storeId } });
    expect(afterDraft).toBe(1);
    await publishPolicy(s, "PRIVACY", { revision: saved.revision });
    const events = await db.outboxEvent.findMany({ where: { storeId: s.storeId } });
    expect(events.map((e) => e.type)).toEqual(["store.changed", "store.changed"]);
  });
});
