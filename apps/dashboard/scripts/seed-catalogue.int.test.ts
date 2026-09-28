// The development catalogue's categories and tags converge: a catalogue
// seeded before the product taxonomy existed catches up on a rerun, without
// creating products, overwriting a category the merchant chose, or dropping
// the merchant's own tags; a further rerun changes nothing.
import {
  archiveProduct,
  createProduct,
  getProduct,
  listProducts,
  updateProduct,
} from "@storevia/commerce";
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import {
  createOrganisation,
  createStore,
  requireOrganisationAccess,
  requireStoreAccess,
  type StoreContext,
} from "@storevia/tenancy";
import { toTypeId, uuidv7 } from "@storevia/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { convergeAcmeTaxonomy } from "./seed-catalogue";

let store: StoreContext;
const ids: Record<string, string> = {};

beforeAll(async () => {
  await truncateAll();
  const user = await migratorDb().user.create({
    data: { id: uuidv7(), email: "taxonomy-seed@example.test", name: "Seed", emailVerified: true },
  });
  const owner = {
    userId: user.id,
    email: user.email,
    name: user.name,
    emailVerified: true,
    recentlyAuthenticated: false,
  };
  const { organisationId } = await createOrganisation(owner, { name: "Taxonomy seed org" });
  const plan = await migratorDb().plan.findUniqueOrThrow({ where: { key: "business" } });
  await migratorDb().subscription.create({
    data: {
      organisationId,
      planId: plan.id,
      status: "ACTIVE",
      source: "MANUAL",
      startedAt: new Date(),
    },
  });
  const org = await requireOrganisationAccess(owner, toTypeId("organisation", organisationId));
  const { storeId } = await createStore(org, {
    name: "Taxonomy flagship",
    slug: "taxonomy-flagship",
    currency: "INR",
    country: "IN",
    locale: "en-IN",
    timezone: "Asia/Kolkata",
  });
  store = await requireStoreAccess(owner, toTypeId("store", storeId));
  // An older catalogue: the seed's products without categories and with
  // the tags the seed used to give them, plus the merchant's own changes.
  const make = async (key: string, title: string, tags: string[]) => {
    ids[key] = (await createProduct(store, { title, tags })).productId;
  };
  await make("mug", "Stoneware mug", ["kitchen", "ceramics"]);
  await make("pan", "Enamel saucepan", ["kitchen", "cookware", "Staff pick"]);
  await make("planter", "Ceramic planter", ["home", "ceramics"]);
  await make("tote", "Market tote", ["textiles"]);
  await archiveProduct(store, ids["tote"] ?? "");
  // The merchant already chose another category for the planter.
  await updateProduct(store, ids["planter"] ?? "", { categoryCode: "hg-decor-vases" });
}, 60_000);

afterAll(async () => {
  await truncateAll();
  await disconnectTestClients();
});

describe("convergeAcmeTaxonomy", () => {
  it("adds missing categories and tags, and nothing else", async () => {
    expect(await convergeAcmeTaxonomy(store)).toBe(4);
    const view = async (key: string) => {
      const p = await getProduct(store, ids[key] ?? "");
      return { category: p.category?.code ?? null, tags: p.tags };
    };
    expect(await view("mug")).toEqual({
      category: "hg-kd-drinkware-mugs",
      tags: ["kitchen", "ceramics", "gift ideas"],
    });
    expect(await view("pan")).toEqual({
      category: "hg-kd-cookware",
      tags: ["kitchen", "cookware", "Staff pick", "gift ideas"],
    });
    // The merchant's category stays; only the missing tag is added.
    expect(await view("planter")).toEqual({
      category: "hg-decor-vases",
      tags: ["home", "ceramics", "garden"],
    });
    // Archived products are found too.
    expect(await view("tote")).toEqual({ category: "lb-totes", tags: ["textiles"] });
  });

  it("changes nothing on a rerun and never creates products", async () => {
    const before = await listProducts(store, {});
    expect(await convergeAcmeTaxonomy(store)).toBe(0);
    const after = await listProducts(store, {});
    expect(after.counts).toEqual(before.counts);
    expect(after.items.map((i) => i.updatedAt)).toEqual(before.items.map((i) => i.updatedAt));
  });
});
