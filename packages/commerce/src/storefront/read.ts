import "server-only";
import { Prisma, type TenantTx } from "@storevia/database";
import { withStorefront, type StorefrontScope } from "@storevia/database/storefront";
import { renditionUrls } from "@storevia/media/urls";
import { parseTypeId, toTypeId } from "@storevia/types";
import { safeRichText, type RichTextDoc } from "../rich-text";

// Storefront read models (06-storefront.md §4, ADR-0028 §7). The storefront's
// only data access: public DTOs through explicit selects (no cost, no stock
// counts, no internal fields), batched by kind so an uncached page costs a
// handful of queries. Everything runs as storevia_storefront inside one
// read-only transaction scoped to the resolved store, where restrictive row
// policies already hide anything that isn't sellable; the queries repeat
// those conditions so they also stay correct, and fast, on their own.

export type { StorefrontScope };

export interface PriceDto {
  readonly amount: string;
  readonly currency: string;
}

export interface ImageDto {
  readonly url: string;
  readonly srcSet: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly alt: string;
}

export interface ProductCardDto {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly price: PriceDto;
  readonly compareAtPrice: PriceDto | null;
  readonly priceVaries: boolean;
  readonly image: ImageDto | null;
  readonly available: boolean;
}

export interface VariantDto {
  readonly id: string;
  readonly title: string;
  readonly price: PriceDto;
  readonly compareAtPrice: PriceDto | null;
  readonly available: boolean;
  readonly optionValues: readonly string[];
  readonly image: ImageDto | null;
}

export interface ProductDto {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly vendor: string | null;
  readonly description: RichTextDoc | null;
  readonly images: readonly ImageDto[];
  readonly options: readonly { readonly name: string; readonly values: readonly string[] }[];
  readonly variants: readonly VariantDto[];
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly updatedAt: Date;
}

export interface PagedProductsDto {
  readonly products: readonly ProductCardDto[];
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
}

export interface CollectionDto extends PagedProductsDto {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly description: RichTextDoc | null;
  readonly image: ImageDto | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
}

export interface SearchDto extends PagedProductsDto {
  readonly query: string;
}

export type PageKindDto =
  | "HOME"
  | "STANDARD"
  | "PRODUCT_TEMPLATE"
  | "COLLECTION_TEMPLATE"
  | "SEARCH_TEMPLATE"
  | "NOT_FOUND";

export interface PublishedPageDto {
  readonly id: string;
  readonly kind: PageKindDto;
  readonly title: string;
  readonly handle: string;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  /** The stored document; the caller upgrades and validates it before rendering. */
  readonly document: unknown;
}

export type ProductListSource =
  | { readonly type: "catalogue" }
  | { readonly type: "collection"; readonly id: string }
  | { readonly type: "products"; readonly ids: readonly string[] };

export interface LinkTargets {
  readonly products: readonly string[];
  readonly collections: readonly string[];
  readonly pages: readonly string[];
}

export interface ResolvedLinks {
  /** TypeId → handle, for ids that resolve in this store. */
  readonly products: ReadonlyMap<string, string>;
  readonly collections: ReadonlyMap<string, string>;
  readonly pages: ReadonlyMap<string, string>;
}

export interface SitemapEntry {
  readonly path: string;
  readonly updatedAt: Date;
}

export const STOREFRONT_PAGE_SIZE = 24;
export const MAX_LIST_LIMIT = 48;
const MAX_PAGE = 500;
const SEARCH_MAX_LENGTH = 100;

/** Bounded, normalised search input: the same string always means the same cache entry. */
export function normaliseSearchQuery(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, SEARCH_MAX_LENGTH).trim();
}

export function normalisePageNumber(raw: unknown): number {
  const n = typeof raw === "string" && /^\d{1,4}$/.test(raw) ? Number(raw) : 1;
  return Math.min(Math.max(n, 1), MAX_PAGE);
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

export interface ImageRow {
  readonly renditions: unknown;
  readonly alt: string | null;
}

/** The public image for stored renditions (servable keys only), or null. */
export function imageDto(row: ImageRow | null | undefined, fallbackAlt: string): ImageDto | null {
  if (!row) return null;
  const urls = renditionUrls(row.renditions);
  if (urls.renditions.length === 0) return null;
  // 640 px reads sharply in cards at 2x; srcset lets the browser pick larger.
  const chosen = urls.renditions[1] ?? urls.renditions[0];
  if (!chosen) return null;
  return {
    url: chosen.url,
    srcSet: urls.srcSet,
    width: chosen.width,
    height: chosen.height,
    alt: row.alt ?? fallbackAlt,
  };
}

const price = (amount: bigint | string, currency: string): PriceDto => ({
  amount: String(amount),
  currency: currency.trim(),
});

interface CardRow {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly min_price: bigint;
  readonly max_price: bigint;
  readonly compare_at: bigint | null;
  readonly currency: string;
  readonly image: ImageRow | null;
  readonly available: boolean | null;
  readonly total?: bigint;
}

function card(row: CardRow): ProductCardDto {
  return {
    id: toTypeId("product", row.id),
    handle: row.handle,
    title: row.title,
    price: price(row.min_price, row.currency),
    compareAtPrice:
      row.compare_at !== null && row.compare_at > row.min_price
        ? price(row.compare_at, row.currency)
        : null,
    priceVaries: row.max_price !== row.min_price,
    image: imageDto(row.image, row.title),
    available: row.available === true,
  };
}

/**
 * The card columns for products `p`: cheapest live variant's price (and its
 * compare-at), whether prices vary, the first image, and one availability
 * flag from app_storefront_availability() (never a count).
 */
const CARD_SELECT = Prisma.sql`
  p.id, p.handle, p.title,
  pr.min_price, pr.max_price, pr.compare_at, pr.currency,
  img.image,
  av.available`;

const CARD_JOINS = Prisma.sql`
  JOIN LATERAL (
    SELECT min(v."priceAmount") AS min_price, max(v."priceAmount") AS max_price,
           (array_agg(v."compareAtAmount" ORDER BY v."priceAmount", v.position))[1] AS compare_at,
           min(v.currency) AS currency
    FROM "ProductVariant" v WHERE v."productId" = p.id AND v."deletedAt" IS NULL
  ) pr ON pr.min_price IS NOT NULL
  LEFT JOIN LATERAL (
    SELECT json_build_object('renditions', m.renditions, 'alt', coalesce(pm."altText", m."altText")) AS image
    FROM "ProductMedia" pm JOIN "MediaAsset" m ON m.id = pm."mediaAssetId"
    WHERE pm."productId" = p.id AND m.status = 'READY' AND m."deletedAt" IS NULL
    ORDER BY pm.position LIMIT 1
  ) img ON true
  LEFT JOIN LATERAL (
    SELECT bool_or(a.available) AS available
    FROM app_storefront_availability(ARRAY(
      SELECT v.id FROM "ProductVariant" v WHERE v."productId" = p.id AND v."deletedAt" IS NULL)) a
  ) av ON true`;

const SELLABLE = Prisma.sql`p.status = 'ACTIVE' AND p."deletedAt" IS NULL`;

const uuids = (kind: "product" | "collection" | "page" | "media", ids: readonly string[]) => [
  ...new Set(ids.map((id) => parseTypeId(kind, id)).filter((id): id is string => id !== null)),
];

const paged = (rows: readonly CardRow[], page: number, pageSize: number): PagedProductsDto => {
  const total = Number(rows[0]?.total ?? 0);
  return {
    products: rows.map(card),
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total,
  };
};

// ---------------------------------------------------------------------------
// The reader: every method runs on the one scoped transaction.
// ---------------------------------------------------------------------------

export class StorefrontReader {
  constructor(private readonly tx: TenantTx) {}

  /** The published page of a kind (standard pages by handle), or null. */
  async publishedPage(kind: PageKindDto, handle?: string): Promise<PublishedPageDto | null> {
    const rows = await this.tx.$queryRaw<
      {
        id: string;
        kind: PageKindDto;
        title: string;
        handle: string;
        seoTitle: string | null;
        seoDescription: string | null;
        document: unknown;
      }[]
    >`
      SELECT pg.id, pg.kind, pg.title, pg.handle, pg."seoTitle", pg."seoDescription", v.document
      FROM "Page" pg
      JOIN "PageVersion" v ON v.id = pg."publishedVersionId" AND v.state = 'PUBLISHED'
      WHERE pg."deletedAt" IS NULL AND pg.kind = ${kind}::"PageKind"
        ${kind === "STANDARD" ? Prisma.sql`AND pg.handle = ${handle ?? ""}` : Prisma.empty}
      LIMIT 1`;
    const row = rows[0];
    return row ? { ...row, id: toTypeId("page", row.id) } : null;
  }

  /** Product cards for each requested source, in one query per source kind. */
  async productLists(
    requests: readonly { readonly source: ProductListSource; readonly limit: number }[],
  ): Promise<Map<string, ProductCardDto[]>> {
    const out = new Map<string, ProductCardDto[]>();
    const key = (source: ProductListSource, limit: number) =>
      `${JSON.stringify(source)}:${String(limit)}`;
    const limitOf = (limit: number) => Math.min(Math.max(Math.trunc(limit), 1), MAX_LIST_LIMIT);

    const catalogue = requests.filter((r) => r.source.type === "catalogue");
    if (catalogue.length > 0) {
      const max = Math.max(...catalogue.map((r) => limitOf(r.limit)));
      const rows = await this.tx.$queryRaw<CardRow[]>`
        SELECT ${CARD_SELECT} FROM "Product" p ${CARD_JOINS}
        WHERE ${SELLABLE}
        ORDER BY p."publishedAt" DESC NULLS LAST, p.id DESC
        LIMIT ${max}`;
      for (const r of catalogue)
        out.set(key(r.source, r.limit), rows.slice(0, limitOf(r.limit)).map(card));
    }

    const byCollection = requests.flatMap((r) =>
      r.source.type === "collection" ? [{ ...r, source: r.source }] : [],
    );
    const collectionIds = uuids(
      "collection",
      byCollection.map((r) => r.source.id),
    );
    if (collectionIds.length > 0) {
      const max = Math.max(...byCollection.map((r) => limitOf(r.limit)));
      const rows = await this.tx.$queryRaw<(CardRow & { collection_id: string })[]>`
        SELECT * FROM (
          SELECT ${CARD_SELECT}, cp."collectionId" AS collection_id,
                 row_number() OVER (PARTITION BY cp."collectionId" ORDER BY cp.position, p.id) AS n
          FROM "CollectionProduct" cp
          JOIN "Collection" c ON c.id = cp."collectionId" AND c."archivedAt" IS NULL AND c."deletedAt" IS NULL
          JOIN "Product" p ON p.id = cp."productId"
          ${CARD_JOINS}
          WHERE cp."collectionId" = ANY(${collectionIds}::uuid[]) AND ${SELLABLE}
        ) ranked WHERE n <= ${max}`;
      for (const r of byCollection) {
        const id = parseTypeId("collection", r.source.id);
        out.set(
          key(r.source, r.limit),
          rows
            .filter((row) => row.collection_id === id)
            .slice(0, limitOf(r.limit))
            .map(card),
        );
      }
    }

    const byIds = requests.flatMap((r) =>
      r.source.type === "products" ? [{ ...r, source: r.source }] : [],
    );
    const productIds = uuids(
      "product",
      byIds.flatMap((r) => r.source.ids),
    );
    if (productIds.length > 0) {
      const rows = await this.tx.$queryRaw<CardRow[]>`
        SELECT ${CARD_SELECT} FROM "Product" p ${CARD_JOINS}
        WHERE p.id = ANY(${productIds}::uuid[]) AND ${SELLABLE}`;
      const byId = new Map(rows.map((row) => [toTypeId("product", row.id), row]));
      for (const r of byIds) {
        const ordered = r.source.ids.flatMap((id) => {
          const row = byId.get(id);
          return row ? [card(row)] : [];
        });
        out.set(key(r.source, r.limit), ordered.slice(0, limitOf(r.limit)));
      }
    }
    return out;
  }

  /** A sellable product by handle, with options, live variants and images. */
  async product(handle: string): Promise<ProductDto | null> {
    const rows = await this.tx.$queryRaw<
      {
        id: string;
        handle: string;
        title: string;
        vendor: string | null;
        descriptionDoc: unknown;
        seoTitle: string | null;
        seoDescription: string | null;
        updatedAt: Date;
        options: { name: string; values: string[] }[] | null;
        images: { id: string; renditions: unknown; alt: string | null }[] | null;
        variants:
          | {
              id: string;
              title: string;
              price: string;
              compare_at: string | null;
              currency: string;
              image_id: string | null;
              option_values: string[] | null;
              available: boolean | null;
            }[]
          | null;
      }[]
    >`
      SELECT p.id, p.handle, p.title, p.vendor, p."descriptionDoc", p."seoTitle", p."seoDescription", p."updatedAt",
        (SELECT json_agg(json_build_object('name', o.name, 'values',
            (SELECT coalesce(json_agg(ov.value ORDER BY ov.position), '[]'::json) FROM "ProductOptionValue" ov WHERE ov."optionId" = o.id))
          ORDER BY o.position)
         FROM "ProductOption" o WHERE o."productId" = p.id) AS options,
        (SELECT json_agg(json_build_object('id', m.id, 'renditions', m.renditions, 'alt', coalesce(pm."altText", m."altText"))
          ORDER BY pm.position)
         FROM "ProductMedia" pm JOIN "MediaAsset" m ON m.id = pm."mediaAssetId"
         WHERE pm."productId" = p.id AND m.status = 'READY' AND m."deletedAt" IS NULL) AS images,
        (SELECT json_agg(json_build_object(
            'id', v.id, 'title', v.title, 'price', v."priceAmount"::text, 'compare_at', v."compareAtAmount"::text,
            'currency', v.currency, 'image_id', v."imageMediaId", 'available', av.available,
            'option_values', (SELECT json_agg(ov.value ORDER BY o.position)
              FROM "ProductVariantOptionValue" vov
              JOIN "ProductOptionValue" ov ON ov.id = vov."optionValueId"
              JOIN "ProductOption" o ON o.id = vov."optionId"
              WHERE vov."variantId" = v.id))
          ORDER BY v.position, v.id)
         FROM "ProductVariant" v
         LEFT JOIN app_storefront_availability(ARRAY(
           SELECT pv.id FROM "ProductVariant" pv WHERE pv."productId" = p.id AND pv."deletedAt" IS NULL)) av
           ON av.variant_id = v.id
         WHERE v."productId" = p.id AND v."deletedAt" IS NULL) AS variants
      FROM "Product" p
      WHERE p.handle = ${handle} AND ${SELLABLE}
      LIMIT 1`;
    const row = rows[0];
    if (!row?.variants || row.variants.length === 0) return null;
    const images = (row.images ?? []).flatMap((i) => {
      const view = imageDto(i, row.title);
      return view ? [{ id: i.id, view }] : [];
    });
    // A variant image outside the product's gallery is looked up separately.
    const extraIds = row.variants
      .map((v) => v.image_id)
      .filter((id): id is string => id !== null && !images.some((i) => i.id === id));
    const extra =
      extraIds.length > 0 ? await this.mediaByUuid(extraIds) : new Map<string, ImageDto>();
    const imageById = (id: string | null) =>
      id ? (images.find((i) => i.id === id)?.view ?? extra.get(id) ?? null) : null;
    return {
      id: toTypeId("product", row.id),
      handle: row.handle,
      title: row.title,
      vendor: row.vendor,
      description: safeRichText(row.descriptionDoc),
      images: images.map((i) => i.view),
      options: row.options ?? [],
      variants: row.variants.map((v) => ({
        id: toTypeId("variant", v.id),
        title: v.title,
        price: price(v.price, v.currency),
        compareAtPrice:
          v.compare_at !== null && BigInt(v.compare_at) > BigInt(v.price)
            ? price(v.compare_at, v.currency)
            : null,
        available: v.available === true,
        optionValues: v.option_values ?? [],
        image: imageById(v.image_id),
      })),
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      updatedAt: row.updatedAt,
    };
  }

  /** A live collection by handle with one page of its sellable products. */
  async collection(
    handle: string,
    page: number,
    pageSize = STOREFRONT_PAGE_SIZE,
  ): Promise<CollectionDto | null> {
    const rows = await this.tx.$queryRaw<
      {
        id: string;
        handle: string;
        title: string;
        descriptionDoc: unknown;
        seoTitle: string | null;
        seoDescription: string | null;
        sortOrder: string;
        image: ImageRow | null;
      }[]
    >`
      SELECT c.id, c.handle, c.title, c."descriptionDoc", c."seoTitle", c."seoDescription", c."sortOrder"::text AS "sortOrder",
        (SELECT json_build_object('renditions', m.renditions, 'alt', m."altText") FROM "MediaAsset" m
          WHERE m.id = c."imageMediaId" AND m.status = 'READY' AND m."deletedAt" IS NULL) AS image
      FROM "Collection" c
      WHERE c.handle = ${handle} AND c."archivedAt" IS NULL AND c."deletedAt" IS NULL
      LIMIT 1`;
    const row = rows[0];
    if (!row) return null;
    const order =
      {
        MANUAL: Prisma.sql`cp.position, p.id`,
        BEST_SELLING: Prisma.sql`cp.position, p.id`,
        TITLE_ASC: Prisma.sql`lower(p.title), p.id`,
        TITLE_DESC: Prisma.sql`lower(p.title) DESC, p.id`,
        PRICE_ASC: Prisma.sql`pr.min_price, p.id`,
        PRICE_DESC: Prisma.sql`pr.min_price DESC, p.id`,
        CREATED_DESC: Prisma.sql`p."createdAt" DESC, p.id`,
      }[row.sortOrder] ?? Prisma.sql`cp.position, p.id`;
    const products = await this.tx.$queryRaw<CardRow[]>`
      SELECT ${CARD_SELECT}, count(*) OVER () AS total
      FROM "CollectionProduct" cp JOIN "Product" p ON p.id = cp."productId"
      ${CARD_JOINS}
      WHERE cp."collectionId" = ${row.id}::uuid AND ${SELLABLE}
      ORDER BY ${order}
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
    return {
      id: toTypeId("collection", row.id),
      handle: row.handle,
      title: row.title,
      description: safeRichText(row.descriptionDoc),
      image: imageDto(row.image, row.title),
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      ...paged(products, page, pageSize),
    };
  }

  /** Product search ("" lists every sellable product, newest first). */
  async search(
    rawQuery: string,
    page: number,
    pageSize = STOREFRONT_PAGE_SIZE,
  ): Promise<SearchDto> {
    const query = normaliseSearchQuery(rawQuery);
    const conditions: Prisma.Sql[] = [SELLABLE];
    if (query) {
      const terms = (query.toLocaleLowerCase("en").match(/[\p{L}\p{N}]+/gu) ?? [])
        .slice(0, 8)
        .map((t) => t.slice(0, 64));
      const like = `%${query.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const alternatives = [Prisma.sql`lower(p.title) LIKE ${like}`];
      if (terms.length > 0) {
        alternatives.push(
          Prisma.sql`catalogue_search_document(p.title, p.handle, p.vendor, p."productType", p.tags)
            @@ to_tsquery('simple', ${terms.map((t) => `${t}:*`).join(" & ")})`,
        );
      }
      conditions.push(Prisma.sql`(${Prisma.join(alternatives, " OR ")})`);
    }
    const rows = await this.tx.$queryRaw<CardRow[]>`
      SELECT ${CARD_SELECT}, count(*) OVER () AS total
      FROM "Product" p ${CARD_JOINS}
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY ${query ? Prisma.sql`(lower(p.title) = ${query.toLowerCase()}) DESC, ` : Prisma.empty}p."publishedAt" DESC NULLS LAST, p.id DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
    return { query, ...paged(rows, page, pageSize) };
  }

  /** Handles for typed link targets that resolve in this store, in one query. */
  async links(targets: LinkTargets): Promise<ResolvedLinks> {
    const products = uuids("product", targets.products);
    const collections = uuids("collection", targets.collections);
    const pages = uuids("page", targets.pages);
    const out = {
      products: new Map<string, string>(),
      collections: new Map<string, string>(),
      pages: new Map<string, string>(),
    };
    if (products.length + collections.length + pages.length === 0) return out;
    const rows = await this.tx.$queryRaw<
      { kind: "product" | "collection" | "page"; id: string; handle: string }[]
    >`
      SELECT 'product' AS kind, p.id, p.handle FROM "Product" p
        WHERE p.id = ANY(${products}::uuid[]) AND ${SELLABLE}
      UNION ALL
      SELECT 'collection', c.id, c.handle FROM "Collection" c
        WHERE c.id = ANY(${collections}::uuid[]) AND c."archivedAt" IS NULL AND c."deletedAt" IS NULL
      UNION ALL
      SELECT 'page', pg.id, pg.handle FROM "Page" pg
        WHERE pg.id = ANY(${pages}::uuid[]) AND pg."deletedAt" IS NULL AND pg."publishedVersionId" IS NOT NULL`;
    for (const row of rows) {
      const map =
        row.kind === "product"
          ? out.products
          : row.kind === "collection"
            ? out.collections
            : out.pages;
      map.set(toTypeId(row.kind, row.id), row.handle);
    }
    return out;
  }

  /** Images for media TypeIds that are READY in this store. */
  async media(ids: readonly string[]): Promise<Map<string, ImageDto>> {
    const byUuid = await this.mediaByUuid(uuids("media", ids));
    return new Map([...byUuid].map(([id, view]) => [toTypeId("media", id), view]));
  }

  private async mediaByUuid(ids: readonly string[]): Promise<Map<string, ImageDto>> {
    if (ids.length === 0) return new Map();
    const rows = await this.tx.$queryRaw<{ id: string; renditions: unknown; alt: string | null }[]>`
      SELECT m.id, m.renditions, m."altText" AS alt FROM "MediaAsset" m
      WHERE m.id = ANY(${[...ids]}::uuid[]) AND m.status = 'READY' AND m."deletedAt" IS NULL`;
    return new Map(
      rows.flatMap((row) => {
        const view = imageDto(row, "");
        return view ? [[row.id, view] as const] : [];
      }),
    );
  }

  /** Collections for the store header until navigation menus exist (M5). */
  async navigationCollections(
    limit = 8,
  ): Promise<{ readonly handle: string; readonly title: string }[]> {
    return this.tx.$queryRaw<{ handle: string; title: string }[]>`
      SELECT c.handle, c.title FROM "Collection" c
      WHERE c."archivedAt" IS NULL AND c."deletedAt" IS NULL
        AND EXISTS (SELECT 1 FROM "CollectionProduct" cp JOIN "Product" p ON p.id = cp."productId"
                    WHERE cp."collectionId" = c.id AND ${SELLABLE})
      ORDER BY c."createdAt", c.id
      LIMIT ${Math.min(Math.max(limit, 1), 20)}`;
  }

  /** Every indexable path in the store (sitemap), capped at 50,000. */
  async sitemap(): Promise<SitemapEntry[]> {
    const rows = await this.tx.$queryRaw<{ path: string; updatedAt: Date }[]>`
      (SELECT '/products/' || p.handle AS path, p."updatedAt" FROM "Product" p WHERE ${SELLABLE}
        AND EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id AND v."deletedAt" IS NULL))
      UNION ALL
      (SELECT '/collections/' || c.handle, c."updatedAt" FROM "Collection" c
        WHERE c."archivedAt" IS NULL AND c."deletedAt" IS NULL)
      UNION ALL
      (SELECT '/pages/' || pg.handle, pg."updatedAt" FROM "Page" pg
        WHERE pg.kind = 'STANDARD' AND pg."deletedAt" IS NULL AND pg."publishedVersionId" IS NOT NULL)
      ORDER BY 1
      LIMIT 50000`;
    return rows;
  }
}

/**
 * Runs `fn` with a reader bound to one read-only storefront transaction for
 * the resolved store. `scope` must come from the host resolver.
 */
export async function readStorefront<T>(
  scope: StorefrontScope,
  fn: (reader: StorefrontReader) => Promise<T>,
): Promise<T> {
  return withStorefront(scope, (tx) => fn(new StorefrontReader(tx)), { readOnly: true });
}
