// Multi-store load seed (Milestone 8, performance/load): many organisations,
// each with several live stores, a catalogue, a published theme, shipping,
// tax, test payments, real orders (cart → checkout → test payment), customer
// messages, open carts and, on some stores, an active custom domain. Every
// row is created through the same services the dashboard, the storefront and
// the checkout use, so RLS, plan limits, the stock ledger and the outbox all
// apply exactly as in the product.
//
//   node scripts/load/with-database.mjs storevia_load pnpm --filter @storevia/dashboard seed:load
//
// Refuses to run unless STOREVIA_ENV is development or test. Converges by
// slug and title: a rerun creates only what is missing (larger sizes add to
// what is there). Open carts are the exception: their tokens can't be read
// back (only hashes are stored), so each run opens fresh ones for the
// manifest. See docs/operations/load-testing.md.
//
// Sizes (environment, defaults in brackets):
//   LOAD_ORGS [10]  LOAD_STORES_PER_ORG [2]  LOAD_PRODUCTS [40] per store
//   LOAD_ORDERS [8] per store  LOAD_CONCURRENCY [4] organisations seeded at once
//   LOAD_MANIFEST [.storevia/load-manifest.json, from the repository root]
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { hashPassword } from "@storevia/auth";
import { assignPlan } from "@storevia/billing";
import {
  addProductsToCollection,
  attachProductMedia,
  changeProductOptions,
  connectTestPayments,
  createCollection,
  createProduct,
  createShippingRate,
  createShippingZone,
  createTaxRate,
  getPaymentSettings,
  getProduct,
  getShippingSettings,
  getTaxSettings,
  listCollections,
  listOrders,
  listProducts,
  setInventory,
  testPaymentsSetupProblem,
  updateTaxSettings,
  updateVariants,
} from "@storevia/commerce";
import {
  beginPayment,
  getCheckout,
  selectShippingRate,
  simulateTestPayment,
  startCheckout,
  updateAddress,
  updateContact,
  type CheckoutStore,
} from "@storevia/commerce/checkout";
import { sendCustomerOrderMessage } from "@storevia/commerce/customer-order";
import { addToCart } from "@storevia/commerce/storefront";
import { disconnectAll } from "@storevia/database";
import { platformDb } from "@storevia/database/platform";
import { systemDb } from "@storevia/database/system";
import { storefrontRootDomain } from "@storevia/domains";
import { simulateDns } from "@storevia/domains/provisioner";
import { completeMediaUpload, createMediaUpload, mediaStorage } from "@storevia/media";
import { uploadKey } from "@storevia/media/keys";
import {
  getStoreTheme,
  installTheme,
  listThemes,
  publishTheme,
  saveThemeDraft,
} from "@storevia/site-admin";
import {
  createOrganisation,
  createStore,
  getOnlineStore,
  getStore,
  listMyOrganisations,
  listStores,
  parsePublicId,
  requireOrganisationAccess,
  requireStoreAccess,
  setStorefrontLive,
  type Principal,
  type StoreContext,
} from "@storevia/tenancy";
import {
  addCustomDomain,
  checkCustomDomain,
  listStoreDomains,
  setPrimaryDomain,
} from "@storevia/tenancy/domains";
import { requirePlatformStaff, type PlatformContext } from "@storevia/tenancy/platform";
import { toTypeId, uuidv7 } from "@storevia/types";
import pg from "pg";

const repoRoot = resolve(import.meta.dirname, "../../..");
const rootEnv = resolve(repoRoot, ".env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
const stage = process.env["STOREVIA_ENV"];
if (stage !== "development" && stage !== "test") {
  throw new Error(
    `seed:load runs only with STOREVIA_ENV=development or test (it is "${stage ?? ""}"). ` +
      "Never seed load data into staging or production.",
  );
}

function size(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`${name} must be a whole number from 0 to ${String(max)}`);
  }
  return value;
}

const ORGS = size("LOAD_ORGS", 10, 99);
const STORES_PER_ORG = size("LOAD_STORES_PER_ORG", 2, 10);
const PRODUCTS = size("LOAD_PRODUCTS", 40, 999);
const ORDERS = size("LOAD_ORDERS", 8, 200);
const CONCURRENCY = Math.max(1, size("LOAD_CONCURRENCY", 4, 32));
const manifestSetting = process.env["LOAD_MANIFEST"] ?? ".storevia/load-manifest.json";
const MANIFEST = isAbsolute(manifestSetting) ? manifestSetting : resolve(repoRoot, manifestSetting);
// The local domain provider's state: a file of its own, never the one
// development and E2E share.
const domainState = process.env["DOMAIN_PROVIDER_LOCAL_STATE"];
if (domainState === undefined || domainState === "") {
  process.env["DOMAIN_PROVIDER_LOCAL_STATE"] = resolve(repoRoot, ".storevia/load-domains.json");
}

const PASSWORD = "storevia-load-password";
const pad = (n: number, width = 2) => String(n).padStart(width, "0");

// --- Timing -------------------------------------------------------------------

const timings = new Map<string, { ms: number; count: number }>();

async function timed<T>(phase: string, fn: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await fn();
  } finally {
    const entry = timings.get(phase) ?? { ms: 0, count: 0 };
    entry.ms += performance.now() - started;
    entry.count += 1;
    timings.set(phase, entry);
  }
}

// --- Users and organisations --------------------------------------------------

async function user(email: string, name: string): Promise<Principal> {
  const db = systemDb();
  const principal = (id: string): Principal => ({
    userId: id,
    email,
    name,
    emailVerified: true,
    recentlyAuthenticated: false,
  });
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return principal(existing.id);
  const id = uuidv7();
  await db.user.create({ data: { id, email, name, emailVerified: true } });
  await db.account.create({
    data: {
      id: uuidv7(),
      userId: id,
      providerId: "credential",
      accountId: id,
      passwordHash: await hashPassword(PASSWORD),
    },
  });
  return principal(id);
}

async function platformStaff(): Promise<PlatformContext> {
  const staff = await user("load-staff@storevia.test", "Load Staff");
  // Granting platform access is an operations action (as in seed:dev).
  const migratorUrl = process.env["DATABASE_MIGRATOR_URL"];
  if (!migratorUrl) throw new Error("DATABASE_MIGRATOR_URL is not set");
  const admin = new pg.Client({ connectionString: migratorUrl });
  await admin.connect();
  try {
    await admin.query(
      `INSERT INTO "PlatformStaff" ("userId", role, "updatedAt") VALUES ($1::uuid, 'SUPER_ADMIN', now())
       ON CONFLICT ("userId") DO NOTHING`,
      [staff.userId],
    );
  } finally {
    await admin.end();
  }
  return requirePlatformStaff({ ...staff, recentlyAuthenticated: true });
}

const orgSlug = (org: number, store: number) => `load-${pad(org)}-${String(store)}`;

async function ensureOrganisation(
  staff: PlatformContext,
  org: number,
): Promise<{ owner: Principal; stores: StoreContext[] }> {
  const owner = await user(`load-owner-${pad(org)}@load.test`, `Load Owner ${pad(org)}`);
  const name = `Load Org ${pad(org)}`;
  const existing = (await listMyOrganisations(owner)).find(
    (o) => o.name === name && o.role === "OWNER",
  )?.id;
  const organisationId =
    existing ?? (await createOrganisation(owner, { name, country: "IN" })).organisationId;
  const live = await platformDb().subscription.findFirst({
    where: { organisationId, status: { not: "EXPIRED" } },
  });
  if (!live) {
    await assignPlan(staff, {
      organisationId: toTypeId("organisation", organisationId),
      // Business allows three stores; more need Enterprise.
      planKey: STORES_PER_ORG <= 3 ? "business" : "enterprise",
      status: "ACTIVE",
      billingInterval: "MONTH",
      reason: "Load seed",
    });
  }
  const orgCtx = await requireOrganisationAccess(owner, toTypeId("organisation", organisationId));
  const have = new Map((await listStores(orgCtx)).map((s) => [s.slug, s.id]));
  const stores: StoreContext[] = [];
  for (let i = 0; i < STORES_PER_ORG; i += 1) {
    const slug = orgSlug(org, i);
    const id =
      have.get(slug) ??
      (
        await createStore(orgCtx, {
          businessType: "ECOMMERCE",
          name: `Load Store ${pad(org)}-${String(i)}`,
          slug,
          country: "IN",
          currency: "INR",
          locale: "en-IN",
          timezone: "Asia/Kolkata",
        })
      ).storeId;
    stores.push(await requireStoreAccess(owner, toTypeId("store", id)));
  }
  return { owner, stores };
}

// --- Catalogue ------------------------------------------------------------------

const NOUNS = [
  "Stoneware mug",
  "Linen apron",
  "Tea towel",
  "Enamel saucepan",
  "Ceramic planter",
  "Beechwood spoon",
  "Market tote",
  "Glass carafe",
  "Wool throw",
  "Oak board",
] as const;
const VENDORS = ["Load Kitchen", "Load Textiles", "Load Home"] as const;
const TAGS = ["kitchen", "textiles", "home", "gift ideas", "ceramics", "wood"] as const;

const productTitle = (k: number) => `${NOUNS[k % NOUNS.length] ?? "Item"} ${pad(k + 1, 3)}`;

/** A small flat PNG (one colour), uploaded like a browser upload. */
function png(rgb: readonly [number, number, number], side = 64): Uint8Array {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const row = Buffer.alloc(1 + side * 3);
  for (let x = 0; x < side; x += 1) row.set(rgb, 1 + x * 3);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: side }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
async function uploadImage(ctx: StoreContext, k: number): Promise<string> {
  const bytes = png([(k * 53) % 256, (k * 97) % 256, (k * 29) % 256]);
  const { mediaId } = await createMediaUpload(ctx, {
    filename: `load-${String(k)}.png`,
    size: bytes.byteLength,
    contentType: "image/png",
  });
  const key = uploadKey({
    organisationId: ctx.organisationId,
    storeId: ctx.storeId,
    mediaId: parsePublicId("media", mediaId),
  });
  await mediaStorage().write(key, bytes, "image/png");
  await completeMediaUpload(ctx, mediaId);
  return mediaId;
}

async function allProducts(ctx: StoreContext) {
  const items: { id: string; title: string; handle: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await listProducts(ctx, {
      limit: 100,
      sort: "created",
      ...(cursor ? { cursor } : {}),
    });
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

/** Creates the missing products (every fifth with 4 variants); returns the new ids. */
async function ensureProducts(ctx: StoreContext): Promise<string[]> {
  const titles = new Set((await allProducts(ctx)).map((p) => p.title));
  const created: string[] = [];
  const images: string[] = [];
  for (let k = 0; k < PRODUCTS; k += 1) {
    const title = productTitle(k);
    if (titles.has(title)) continue;
    const withOptions = k % 5 === 4;
    const price = String(199 + ((k * 37) % 1800));
    const { productId } = await timed("product", () =>
      createProduct(ctx, {
        title,
        description: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: `${title}, made for load.` }] },
          ],
        },
        vendor: VENDORS[k % VENDORS.length],
        productType: NOUNS[k % NOUNS.length],
        tags: [TAGS[k % TAGS.length] ?? "home", TAGS[(k + 2) % TAGS.length] ?? "kitchen"],
        price,
        ...(k % 7 === 0 ? { compareAtPrice: String(Number(price) + 300) } : {}),
        sku: withOptions ? undefined : `LOAD-${pad(k + 1, 3)}`,
        trackInventory: true,
        ...(withOptions ? {} : { initialStock: 20 + (k % 30) }),
        status: "ACTIVE",
      }),
    );
    if (withOptions) {
      await timed("variants", async () => {
        await changeProductOptions(ctx, productId, {
          options: [
            { name: "Colour", values: [{ value: "Sand" }, { value: "Charcoal" }] },
            { name: "Size", values: [{ value: "Small" }, { value: "Large" }] },
          ],
        });
        const product = await getProduct(ctx, productId);
        await updateVariants(ctx, productId, {
          variants: product.variants.map((v, i) => ({
            variantId: v.id,
            price: String(Number(price) + i * 50),
            sku: `LOAD-${pad(k + 1, 3)}-${String(i + 1)}`,
          })),
        });
        for (const [i, v] of product.variants.entries()) {
          await setInventory(ctx, {
            variantId: v.id,
            quantity: i === 3 ? 0 : 15 + i,
            reason: "RESTOCK",
            note: "Load seed stock",
          });
        }
      });
    }
    // Four images per store, shared round-robin (uploads cost the most).
    if (images.length < 4) images.push(await timed("image", () => uploadImage(ctx, k)));
    const mediaId = images[k % images.length] ?? images[0];
    if (mediaId) await attachProductMedia(ctx, productId, { mediaIds: [mediaId] });
    created.push(productId);
  }
  return created;
}

const COLLECTIONS = [
  { title: "All goods", pick: () => true },
  { title: "Kitchen", pick: (k: number) => k % 2 === 0 },
  { title: "New in", pick: (k: number) => k < 12 },
] as const;

async function ensureCollections(ctx: StoreContext, createdNow: readonly string[]) {
  const products = await allProducts(ctx);
  const index = (title: string) => {
    const match = /(\d{3})$/.exec(title);
    return match ? Number(match[1]) - 1 : -1;
  };
  const existing = new Map((await listCollections(ctx)).map((c) => [c.title, c.id]));
  const fresh = new Set(createdNow);
  for (const c of COLLECTIONS) {
    let id = existing.get(c.title);
    // A new collection gets every matching product; an existing one only
    // the products this run created (it already holds the older ones).
    const members = products.filter(
      (p) => c.pick(index(p.title)) && (id === undefined || fresh.has(p.id)),
    );
    id ??= (await createCollection(ctx, { title: c.title })).collectionId;
    for (let i = 0; i < members.length; i += 50) {
      await addProductsToCollection(ctx, id, {
        productIds: members.slice(i, i + 50).map((p) => p.id),
      });
    }
  }
}

// --- Theme, shipping, tax, payments, going live -----------------------------------

async function ensureTheme(ctx: StoreContext, boutique: boolean) {
  if (boutique) {
    const entry = (await listThemes(ctx)).find((t) => t.key === "boutique");
    if (!entry || entry.live || entry.incompatibility) return;
    const installed = entry.installed
      ? await getStoreTheme(ctx, "boutique")
      : await installTheme(ctx, { themeKey: "boutique" });
    await publishTheme(ctx, { themeKey: "boutique", revision: installed.revision });
    return;
  }
  const live = await getStoreTheme(ctx);
  // Revision 0: the implicit default theme, never saved; save and publish it
  // so the store has a StoreTheme row with published settings.
  if (live.revision !== 0) return;
  const saved = await saveThemeDraft(ctx, { revision: 0, settings: live.draft });
  await publishTheme(ctx, { revision: saved.revision });
}

async function ensureShippingTaxPayments(ctx: StoreContext) {
  let zone = (await getShippingSettings(ctx)).find((z) => z.name === "India");
  if (!zone) {
    await createShippingZone(ctx, { name: "India", countries: "IN" });
    zone = (await getShippingSettings(ctx)).find((z) => z.name === "India");
  }
  if (!zone) throw new Error("load shipping zone is missing after creating it");
  if (!zone.rates.some((r) => r.name === "Standard")) {
    await createShippingRate(ctx, zone.id, { name: "Standard", type: "FLAT", amount: "60" });
  }
  const tax = await getTaxSettings(ctx);
  if (!tax.rates.some((r) => r.countryCode === "IN" && r.name === "GST")) {
    await updateTaxSettings(ctx, { pricesIncludeTax: "on", chargeTaxOnShipping: "" });
    await createTaxRate(ctx, { name: "GST", countryCode: "IN", rate: "18" });
  }
  const payments = await getPaymentSettings(ctx);
  if (!payments.connections.some((c) => c.status === "ACTIVE" && c.usable)) {
    const problem = testPaymentsSetupProblem();
    if (problem) throw new Error(`Test payments can't be connected: ${problem}`);
    await connectTestPayments(ctx);
  }
}

async function ensureLive(ctx: StoreContext) {
  if ((await getOnlineStore(ctx)).status !== "ACTIVE") await setStorefrontLive(ctx, true);
}

// --- Orders, messages, carts --------------------------------------------------------

const CITIES = [
  { city: "Bengaluru", regionCode: "KA", postalCode: "560001" },
  { city: "Mumbai", regionCode: "MH", postalCode: "400002" },
  { city: "Chennai", regionCode: "TN", postalCode: "600002" },
  { city: "Pune", regionCode: "MH", postalCode: "411001" },
] as const;

async function checkoutStore(ctx: StoreContext): Promise<CheckoutStore> {
  const s = await getStore(ctx);
  return {
    organisationId: ctx.organisationId,
    storeId: ctx.storeId,
    currency: s.currency,
    name: s.name,
  };
}

/** Sellable variant ids (simple products only: always in stock). */
async function sellableVariants(ctx: StoreContext): Promise<string[]> {
  const products = (await allProducts(ctx)).slice(0, 12);
  const ids: string[] = [];
  for (const p of products) {
    const detail = await getProduct(ctx, p.id);
    const v = detail.variants[0];
    if (detail.variants.length === 1 && v) ids.push(v.id);
  }
  return ids;
}

/** One order through the real checkout; returns the shopper's private order token. */
async function placeOrder(
  store: CheckoutStore,
  lines: readonly (readonly [string, number])[],
  email: string,
  n: number,
): Promise<string> {
  const clientIp = null;
  let cartToken: string | null = null;
  for (const [variantId, quantity] of lines) {
    const result = await addToCart({ store, token: cartToken, clientIp }, { variantId, quantity });
    cartToken = result.newToken ?? cartToken;
  }
  const { token } = await startCheckout({ store, token: null, clientIp, cartToken });
  const req = { store, token, clientIp };
  await updateContact(req, { email });
  const place = CITIES[n % CITIES.length] ?? CITIES[0];
  await updateAddress(req, {
    firstName: "Shopper",
    lastName: pad(n, 3),
    line1: `${String(n + 1)} Load Street`,
    ...place,
    countryCode: "IN",
  });
  const priced = await getCheckout(req);
  const rate = priced?.shippingOptions[0];
  const view = rate ? await selectShippingRate(req, { rateId: rate.id }) : priced;
  if (!view) throw new Error("load checkout vanished");
  const started = await beginPayment(req, {
    pricingHash: view.pricingHash,
    returnUrl: "http://load.store.localhost/checkout/return",
  });
  if (started.kind !== "redirect") throw new Error(`load payment did not start (${started.kind})`);
  await simulateTestPayment(req, new URL(started.url).searchParams.get("ref") ?? "", "captured");
  const done = await getCheckout(req);
  return (done?.order?.accessPath ?? "").replace(/^\/orders\/view\//, "");
}

async function ensureOrders(ctx: StoreContext, slug: string): Promise<number> {
  const have = (await listOrders(ctx, {}, 1)).counts.all;
  if (have >= ORDERS) return 0;
  const store = await checkoutStore(ctx);
  const variants = await sellableVariants(ctx);
  if (variants.length === 0) return 0;
  let placed = 0;
  for (let n = have; n < ORDERS; n += 1) {
    // Every third order is a returning shopper.
    const shopper = n % 3 === 2 ? n - 1 : n;
    const email = `shopper-${pad(shopper, 3)}.${slug}@load.test`;
    const lines = Array.from({ length: 1 + (n % 3) }, (_, i) => {
      const id = variants[(n * 3 + i) % variants.length] ?? variants[0] ?? "";
      return [id, 1 + (i % 2)] as const;
    }).filter((line, i, all) => all.findIndex((other) => other[0] === line[0]) === i);
    const token = await timed("order", () => placeOrder(store, lines, email, n));
    // The first two orders' shoppers write to the store.
    if (n < 2 && token) {
      await timed("message", () =>
        sendCustomerOrderMessage(
          { organisationId: ctx.organisationId, storeId: ctx.storeId },
          token,
          `Hello, could you gift-wrap order ${String(n + 1)}? Thank you.`,
          null,
        ),
      );
    }
    placed += 1;
  }
  return placed;
}

/** Fresh open carts for the load driver's cart page (a token can't be read back). */
async function openCarts(ctx: StoreContext, count: number): Promise<string[]> {
  const store = await checkoutStore(ctx);
  const variants = await sellableVariants(ctx);
  const tokens: string[] = [];
  for (let i = 0; i < count && variants.length > 0; i += 1) {
    let token: string | null = null;
    for (let line = 0; line < 3; line += 1) {
      const variantId = variants[(i * 3 + line) % variants.length] ?? "";
      const result = await addToCart(
        { store, token, clientIp: null },
        { variantId, quantity: 1 + line },
      );
      token = result.newToken ?? token;
    }
    if (token) tokens.push(token);
  }
  return tokens;
}

// --- Custom domains -------------------------------------------------------------------

/** An ACTIVE custom domain through the local provider; primary when `primary`. */
async function ensureCustomDomain(ctx: StoreContext, hostname: string, primary: boolean) {
  const find = async () =>
    (await listStoreDomains(ctx)).domains.find((d) => d.hostname === hostname);
  let domain = await find();
  domain ??= await addCustomDomain(ctx, { hostname });
  if (domain.status !== "ACTIVE") {
    const ownership = domain.records.find((r) => r.purpose === "ownership");
    simulateDns(hostname, { txt: ownership ? [ownership.value] : [], routed: true });
    // Each check is one verification step (ownership, registration, routing).
    for (let step = 0; step < 5 && domain.status !== "ACTIVE"; step += 1) {
      domain = await checkCustomDomain(ctx, domain.id);
    }
  }
  if (domain.status !== "ACTIVE") {
    throw new Error(`custom domain ${hostname} is ${domain.status}: ${domain.message ?? ""}`);
  }
  if (primary && !domain.isPrimary) await setPrimaryDomain(ctx, domain.id);
}

// --- The run --------------------------------------------------------------------------------

interface ManifestStore {
  readonly slug: string;
  /** The host to request: the primary custom domain, or the platform address. */
  readonly host: string;
  readonly platformHost: string;
  readonly customDomain: string | null;
  readonly productHandles: readonly string[];
  readonly collectionHandles: readonly string[];
  readonly cartTokens: readonly string[];
}

async function seedStore(ctx: StoreContext, org: number, i: number): Promise<ManifestStore> {
  const slug = orgSlug(org, i);
  const created = await timed("catalogue", () => ensureProducts(ctx));
  await timed("collections", () => ensureCollections(ctx, created));
  await timed("theme", () => ensureTheme(ctx, (org + i) % 2 === 1));
  await timed("settings", () => ensureShippingTaxPayments(ctx));
  await timed("live", () => ensureLive(ctx));
  const placed = await ensureOrders(ctx, slug);
  // Every third organisation's first store has a custom domain; on every
  // other one of those it is primary (its platform address then redirects).
  let customDomain: string | null = null;
  if (org % 3 === 0 && i === 0) {
    customDomain = `www.${slug}.test`;
    await timed("domain", () => ensureCustomDomain(ctx, customDomain ?? "", org % 6 === 0));
  }
  const cartTokens = await timed("carts", () => openCarts(ctx, 2));
  const online = await getOnlineStore(ctx);
  const primary = online.url ? new URL(online.url).hostname : null;
  const products = (await allProducts(ctx)).map((p) => p.handle).sort();
  const collections = (await listCollections(ctx)).map((c) => c.handle).sort();
  const platformHost = `${slug}.${storefrontRootDomain()}`;
  console.log(
    `  ${slug}: ${String(created.length)} products and ${String(placed)} orders added` +
      (customDomain ? `, domain ${customDomain}` : ""),
  );
  return {
    slug,
    host: primary ?? platformHost,
    platformHost,
    customDomain,
    // A spread through the catalogue, including variant products.
    productHandles: products.filter(
      (_, k) => k % Math.max(1, Math.floor(products.length / 8)) === 0,
    ),
    collectionHandles: collections,
    cartTokens,
  };
}

/** Data volume of the load stores (read as the schema owner: counts only). */
async function counts(): Promise<Record<string, number>> {
  const migratorUrl = process.env["DATABASE_MIGRATOR_URL"];
  if (!migratorUrl) throw new Error("DATABASE_MIGRATOR_URL is not set");
  const client = new pg.Client({ connectionString: migratorUrl });
  await client.connect();
  try {
    const load = `SELECT id FROM "Store" WHERE slug LIKE 'load-%'`;
    const { rows } = await client.query<Record<string, string>>(`SELECT
      (SELECT count(*) FROM "Organisation" WHERE name LIKE 'Load Org %') AS orgs,
      (SELECT count(*) FROM (${load}) s) AS stores,
      (SELECT count(*) FROM "Product" WHERE "deletedAt" IS NULL AND "storeId" IN (${load})) AS products,
      (SELECT count(*) FROM "ProductVariant" WHERE "storeId" IN (${load})) AS variants,
      (SELECT count(*) FROM "Collection" WHERE "deletedAt" IS NULL AND "storeId" IN (${load})) AS collections,
      (SELECT count(*) FROM "Order" WHERE "storeId" IN (${load})) AS orders,
      (SELECT count(*) FROM "Customer" WHERE "storeId" IN (${load})) AS customers,
      (SELECT count(*) FROM "OrderMessage" WHERE "storeId" IN (${load})) AS messages,
      (SELECT count(*) FROM "Cart" WHERE "storeId" IN (${load})) AS carts,
      (SELECT count(*) FROM "StoreTheme" WHERE "storeId" IN (${load})) AS themes,
      (SELECT count(*) FROM "StoreDomain" WHERE type = 'CUSTOM' AND status = 'ACTIVE'
         AND "storeId" IN (${load})) AS "customDomains"`);
    return Object.fromEntries(Object.entries(rows[0] ?? {}).map(([k, v]) => [k, Number(v)]));
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const started = performance.now();
  const database = new URL(process.env["DATABASE_URL"] ?? "postgresql://localhost/").pathname;
  console.log(
    `Seeding load data into ${database.slice(1)}: ${String(ORGS)} organisations × ` +
      `${String(STORES_PER_ORG)} stores, ${String(PRODUCTS)} products and ` +
      `${String(ORDERS)} orders per store.`,
  );
  const staff = await platformStaff();
  const stores: ManifestStore[] = [];
  const queue = Array.from({ length: ORGS }, (_, org) => org);
  const failures: string[] = [];
  // A few organisations at once; each organisation's stores in turn.
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, ORGS) }, async () => {
      for (let org = queue.shift(); org !== undefined; org = queue.shift()) {
        try {
          const { stores: contexts } = await timed("organisation", () =>
            ensureOrganisation(staff, org),
          );
          for (const [i, ctx] of contexts.entries()) stores.push(await seedStore(ctx, org, i));
        } catch (error) {
          failures.push(
            `Load Org ${pad(org)}: ${error instanceof Error ? error.message : String(error)}`,
          );
          console.error(error);
        }
      }
    }),
  );
  stores.sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const volume = await counts();
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(
    MANIFEST,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        database: database.slice(1),
        rootDomain: storefrontRootDomain(),
        sizes: {
          orgs: ORGS,
          storesPerOrg: STORES_PER_ORG,
          products: PRODUCTS,
          ordersPerStore: ORDERS,
        },
        volume,
        stores,
      },
      null,
      2,
    )}\n`,
  );
  console.log("\nPhase timings (total ms / calls):");
  for (const [phase, t] of [...timings.entries()].sort((a, b) => b[1].ms - a[1].ms)) {
    console.log(
      `  ${phase.padEnd(13)} ${Math.round(t.ms).toString().padStart(8)} ms  ${String(t.count).padStart(5)}×  ` +
        `${(t.ms / t.count).toFixed(1)} ms each`,
    );
  }
  console.log(`\nVolume (load-* stores): ${JSON.stringify(volume)}`);
  console.log(`Manifest: ${MANIFEST} (${String(stores.length)} stores)`);
  console.log(`Seeded in ${((performance.now() - started) / 1000).toFixed(1)} s.`);
  if (failures.length > 0) {
    process.exitCode = 1;
    console.error(`\nIncomplete; rerun to converge:\n  ${failures.join("\n  ")}`);
  }
}

try {
  await main();
} finally {
  await disconnectAll();
}
