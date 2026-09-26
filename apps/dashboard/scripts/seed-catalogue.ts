// Development catalogue: fictional products, collections, locations, stock
// and images, created through the real commerce and media services (so plan
// limits, RLS and the stock ledger apply exactly as in the product). No
// sales, orders or revenue: those don't exist until Milestone 6, and stock
// only ever moves by restocks, corrections and transfers here.
//
// Images are flat illustrations generated below (a colour field and a
// simple shape), encoded as PNG and sent through the same upload
// completion as a browser upload: sniffed, re-encoded, metadata stripped.
import { deflateSync, crc32 } from "node:zlib";
import { setEntitlementOverride } from "@storevia/billing";
import {
  addProductsToCollection,
  adjustInventory,
  archiveProduct,
  attachProductMedia,
  changeProductOptions,
  createCollection,
  createLocation,
  createProduct,
  getProduct,
  listLocations,
  listProducts,
  moveInventory,
  setProductStatus,
  updateVariants,
} from "@storevia/commerce";
import { completeMediaUpload, createMediaUpload, mediaStorage } from "@storevia/media";
import { uploadKey } from "@storevia/media/keys";
import { parsePublicId, setStorefrontLive, type StoreContext } from "@storevia/tenancy";
import type { PlatformContext } from "@storevia/tenancy/platform";
import { toTypeId } from "@storevia/types";

// --- A tiny PNG encoder (RGB, no dependencies) ------------------------------

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

type Rgb = readonly [number, number, number];

const hex = (value: string): Rgb => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
];

/** A square illustration: a soft backdrop, a floor line and a rounded shape. */
function illustration(
  background: string,
  shape: string,
  kind: "round" | "tall" | "wide",
): Uint8Array {
  const size = 900;
  const bg = hex(background);
  const fg = hex(shape);
  const floor: Rgb = [bg[0] * 0.92, bg[1] * 0.92, bg[2] * 0.92];
  const [w, h] = kind === "tall" ? [300, 520] : kind === "wide" ? [560, 300] : [420, 420];
  const cx = size / 2;
  const bottom = 690;
  const radius = kind === "round" ? 210 : 48;
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x += 1) {
      let colour: Rgb = y > bottom ? floor : bg;
      const left = cx - w / 2;
      const top = bottom - h;
      const inside =
        x >= left &&
        x < left + w &&
        y >= top &&
        y < bottom &&
        (() => {
          const dx = Math.max(left + radius - x, 0, x - (left + w - radius));
          const dy = Math.max(top + radius - y, 0, y - (bottom - radius));
          return dx * dx + dy * dy <= radius * radius;
        })();
      if (inside) {
        const shade = 1 - ((x - left) / w) * 0.18;
        colour = [fg[0] * shade, fg[1] * shade, fg[2] * shade];
      }
      row[1 + x * 3] = Math.round(colour[0]);
      row[2 + x * 3] = Math.round(colour[1]);
      row[3 + x * 3] = Math.round(colour[2]);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function uploadImage(ctx: StoreContext, filename: string, bytes: Uint8Array) {
  const { mediaId } = await createMediaUpload(ctx, {
    filename,
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

// --- The catalogue ----------------------------------------------------------

const paragraph = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

interface SeedProduct {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly vendor: string;
  readonly productType: string;
  readonly tags: readonly string[];
  readonly price: string;
  readonly compareAtPrice?: string;
  readonly sku: string;
  readonly image: readonly [string, string, "round" | "tall" | "wide"];
  /** Options, each variant priced at `price` unless listed in `prices`. */
  readonly options?: readonly { readonly name: string; readonly values: readonly string[] }[];
  readonly prices?: Readonly<Record<string, string>>;
  /** Stock at the main location: one number, or one per variant title. */
  readonly stock?: number | Readonly<Record<string, number>>;
  readonly track?: boolean;
  readonly status: "ACTIVE" | "DRAFT" | "ARCHIVED";
}

const ACME: readonly SeedProduct[] = [
  {
    key: "mug",
    title: "Stoneware mug",
    description: "A heavy, hand-glazed mug that keeps tea warm. Holds 350 ml.",
    vendor: "Acme Kitchen",
    productType: "Mugs",
    tags: ["kitchen", "ceramics"],
    price: "450",
    sku: "ACM-MUG",
    image: ["#EFE8DC", "#B08B63", "round"],
    options: [{ name: "Colour", values: ["Sand", "Charcoal"] }],
    stock: { Sand: 24, Charcoal: 18 },
    status: "ACTIVE",
  },
  {
    key: "apron",
    title: "Linen apron",
    description: "Washed linen with a long tie and a deep front pocket.",
    vendor: "Acme Textiles",
    productType: "Aprons",
    tags: ["textiles", "kitchen"],
    price: "1250",
    sku: "ACM-APR",
    image: ["#E7ECE6", "#5E7466", "tall"],
    options: [
      { name: "Colour", values: ["Sand", "Charcoal"] },
      { name: "Size", values: ["S–M", "L–XL"] },
    ],
    prices: { "Sand / L–XL": "1350", "Charcoal / L–XL": "1350" },
    // One size sold through (out of stock), one running low.
    stock: { "Sand / S–M": 12, "Sand / L–XL": 3, "Charcoal / S–M": 9, "Charcoal / L–XL": 0 },
    status: "ACTIVE",
  },
  {
    key: "towels",
    title: "Cotton tea towels, set of 2",
    description: "Absorbent waffle cotton that softens with every wash.",
    vendor: "Acme Textiles",
    productType: "Tea towels",
    tags: ["textiles", "kitchen"],
    price: "399",
    sku: "ACM-TWL-2",
    image: ["#F2EEE4", "#C9A24A", "wide"],
    stock: 60,
    status: "ACTIVE",
  },
  {
    key: "pan",
    title: "Enamel saucepan",
    description: "A 1.5 litre enamel pan for the hob and the oven.",
    vendor: "Acme Kitchen",
    productType: "Cookware",
    tags: ["kitchen", "cookware"],
    price: "1899",
    compareAtPrice: "2199",
    sku: "ACM-PAN-15",
    image: ["#E6EBF0", "#2F5D7C", "wide"],
    stock: 2,
    status: "ACTIVE",
  },
  {
    key: "planter",
    title: "Ceramic planter",
    description: "Matte glaze outside, drainage hole and saucer included.",
    vendor: "Acme Home",
    productType: "Planters",
    tags: ["home", "ceramics"],
    price: "799",
    sku: "ACM-PLT",
    image: ["#EDE6E1", "#A25B45", "round"],
    options: [{ name: "Size", values: ["Small", "Large"] }],
    prices: { Large: "1299" },
    stock: { Small: 14, Large: 0 },
    status: "ACTIVE",
  },
  {
    key: "spoon",
    title: "Beechwood spoon",
    description: "Carved from a single piece of beech. Oil it now and then.",
    vendor: "Acme Kitchen",
    productType: "Utensils",
    tags: ["kitchen", "wood"],
    price: "249",
    sku: "ACM-SPN",
    image: ["#F1EADF", "#9C7A4E", "tall"],
    track: false,
    status: "DRAFT",
  },
  {
    key: "tote",
    title: "Market tote",
    description: "Heavy canvas tote, retired from the range.",
    vendor: "Acme Textiles",
    productType: "Bags",
    tags: ["textiles"],
    price: "699",
    sku: "ACM-TOTE",
    image: ["#ECE9E2", "#6B6259", "tall"],
    stock: 5,
    status: "ARCHIVED",
  },
];

const COLLECTIONS: readonly { title: string; description: string; products: readonly string[] }[] =
  [
    {
      title: "Kitchen",
      description: "Everyday pieces for cooking and serving.",
      products: ["pan", "mug", "towels", "spoon"],
    },
    {
      title: "Linen and cotton",
      description: "Aprons and towels in natural fibres.",
      products: ["apron", "towels"],
    },
  ];

async function seedProduct(ctx: StoreContext, p: SeedProduct) {
  const simpleStock = typeof p.stock === "number" ? p.stock : undefined;
  const { productId } = await createProduct(ctx, {
    title: p.title,
    description: paragraph(p.description),
    vendor: p.vendor,
    productType: p.productType,
    tags: [...p.tags],
    price: p.price,
    ...(p.compareAtPrice ? { compareAtPrice: p.compareAtPrice } : {}),
    sku: p.options ? undefined : p.sku,
    trackInventory: p.track ?? true,
    ...(simpleStock !== undefined ? { initialStock: simpleStock } : {}),
  });
  if (p.options) {
    await changeProductOptions(ctx, productId, {
      options: p.options.map((o) => ({
        name: o.name,
        values: o.values.map((value) => ({ value })),
      })),
    });
    const product = await getProduct(ctx, productId);
    await updateVariants(ctx, productId, {
      variants: product.variants.map((v) => ({
        variantId: v.id,
        price: p.prices?.[v.title] ?? p.price,
        sku: `${p.sku}-${v.title
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, "-")
          .replace(/^-|-$/g, "")}`,
      })),
    });
    if (p.stock && typeof p.stock === "object") {
      for (const v of product.variants) {
        const units = p.stock[v.title] ?? 0;
        if (units > 0) {
          // No location: the store's default, created on the first stock.
          await adjustInventory(ctx, {
            variantId: v.id,
            delta: units,
            reason: "RESTOCK",
            note: "Opening stock",
          });
        }
      }
    }
  }
  const [bg, fg, kind] = p.image;
  const mediaId = await uploadImage(ctx, `${p.key}.png`, illustration(bg, fg, kind));
  await attachProductMedia(ctx, productId, { mediaIds: [mediaId] });
  if (p.status === "ACTIVE") await setProductStatus(ctx, productId, "ACTIVE");
  if (p.status === "ARCHIVED") await archiveProduct(ctx, productId);
  return productId;
}

/**
 * Acme Flagship's catalogue: 7 products (5 active, 1 draft, 1 archived), 12
 * variants, two collections, a second location with transferred stock, one
 * product running low and two variants out of stock. Skipped when the store
 * already has products.
 */
export async function seedAcmeCatalogue(ctx: StoreContext): Promise<boolean> {
  const existing = await listProducts(ctx, { limit: 1 });
  if (existing.counts.all + existing.counts.archived > 0) return false;

  let main: string | null = null;
  const mainLocationId = async () => {
    main ??= (await listLocations(ctx))[0]?.id ?? null;
    if (!main) throw new Error("no main location");
    return main;
  };
  const ids: Record<string, string> = {};
  for (const p of ACME) ids[p.key] = await seedProduct(ctx, p);

  for (const c of COLLECTIONS) {
    const { collectionId } = await createCollection(ctx, {
      title: c.title,
      description: paragraph(c.description),
    });
    await addProductsToCollection(ctx, collectionId, {
      productIds: c.products.map((key) => ids[key]).filter(Boolean),
    });
  }

  // A second location, stocked by a transfer and a delivery.
  const { locationId: warehouse } = await createLocation(ctx, {
    name: "Bengaluru warehouse",
    code: "BLR",
    city: "Bengaluru",
    countryCode: "IN",
    fulfilsOnlineOrders: true,
  });
  const towels = await getProduct(ctx, ids["towels"] ?? "");
  const towelVariant = towels.variants[0];
  if (towelVariant) {
    await moveInventory(ctx, {
      variantId: towelVariant.id,
      fromLocationId: await mainLocationId(),
      toLocationId: warehouse,
      quantity: 20,
      note: "Stock for online orders",
    });
  }
  const mug = await getProduct(ctx, ids["mug"] ?? "");
  for (const v of mug.variants) {
    await adjustInventory(ctx, {
      variantId: v.id,
      locationId: warehouse,
      delta: 30,
      reason: "RESTOCK",
      note: "Delivery from the pottery",
    });
  }
  const charcoal = mug.variants.find((v) => v.title === "Charcoal");
  if (charcoal) {
    await adjustInventory(ctx, {
      variantId: charcoal.id,
      locationId: warehouse,
      delta: -2,
      reason: "CORRECTION",
      note: "Two chipped in transit",
    });
  }
  // The flagship storefront is live, so local development shows a working store (M4).
  await setStorefrontLive(ctx, true);
  return true;
}

/**
 * Globex Home at its product limit: a staff override lowers product_limit to
 * 3 for this organisation and it has 3 products, so the dashboard shows the
 * limit and refuses a fourth.
 */
export async function seedGlobexAtLimit(
  staff: PlatformContext,
  organisationId: string,
  ctx: StoreContext,
): Promise<boolean> {
  const existing = await listProducts(ctx, { limit: 1 });
  if (existing.counts.all + existing.counts.archived > 0) return false;
  await setEntitlementOverride(staff, {
    organisationId: toTypeId("organisation", organisationId),
    featureKey: "product_limit",
    mode: "limit",
    limit: "3",
    reason: "Development seed: a store at its product limit",
  });
  const products: readonly [
    string,
    string,
    readonly [string, string, "round" | "tall" | "wide"],
  ][] = [
    ["Wool throw", "85", ["#ECE7E1", "#7B6A58", "wide"]],
    ["Glass carafe", "32", ["#E5EEF0", "#5F8D96", "tall"]],
    ["Oak serving board", "48", ["#F0E9DE", "#8E6A43", "wide"]],
  ];
  for (const [title, price, [bg, fg, kind]] of products) {
    const { productId } = await createProduct(ctx, {
      title,
      price,
      vendor: "Globex",
      initialStock: 8,
      status: "ACTIVE",
    });
    const mediaId = await uploadImage(
      ctx,
      `${title.toLowerCase().replace(/\s+/g, "-")}.png`,
      illustration(bg, fg, kind),
    );
    await attachProductMedia(ctx, productId, { mediaIds: [mediaId] });
  }
  return true;
}
