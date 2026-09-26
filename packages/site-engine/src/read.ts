import "server-only";
import { Prisma, type TenantTx } from "@storevia/database";
import { withStorefront, type StorefrontScope } from "@storevia/database/storefront";
import { renditionUrls } from "@storevia/media/urls";
import { parseTypeId, toTypeId } from "@storevia/types";

// Public site content (ADR-0029): published pages, page links, media views
// and content-page sitemap entries. Runs as storevia_storefront inside a
// read-only transaction scoped to the resolved store, where row policies
// show only live pages, PUBLISHED versions and READY media; the queries
// repeat those conditions. A composition shares the same transaction (see
// @storevia/commerce/storefront's readStorefront) so one page render is one
// transaction.

export type { StorefrontScope as PublicSiteScope };

export interface ImageDto {
  readonly url: string;
  readonly srcSet: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly alt: string;
}

export interface ImageRow {
  readonly renditions: unknown;
  readonly alt: string | null;
}

/** The public image for stored renditions (servable keys only), or null. */
export function imageDto(row: ImageRow | null | undefined, fallbackAlt: string): ImageDto | null {
  if (!row) return null;
  // Absolute: store pages are on another origin than the local media server.
  const urls = renditionUrls(row.renditions, undefined, { absolute: true });
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

export interface PublishedPageDto {
  readonly id: string;
  /** The page kind; kinds are the composing app's (the Site Engine only knows STANDARD pages have handles). */
  readonly kind: string;
  readonly title: string;
  readonly handle: string;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  /** The stored document; the caller upgrades and validates it before rendering. */
  readonly document: unknown;
}

export interface SitemapEntry {
  readonly path: string;
  readonly updatedAt: Date;
}

/** Content pages are addressed by handle; every other kind is one page per site. */
export const STANDARD_PAGE_KIND = "STANDARD";

const pageUuids = (kind: "page" | "media", ids: readonly string[]) => [
  ...new Set(ids.map((id) => parseTypeId(kind, id)).filter((id): id is string => id !== null)),
];

export class SiteReader {
  constructor(private readonly tx: TenantTx) {}

  /** The published page of a kind (content pages by handle), or null. */
  async publishedPage(kind: string, handle?: string): Promise<PublishedPageDto | null> {
    if (kind === STANDARD_PAGE_KIND && handle === undefined) return null;
    const rows = await this.tx.$queryRaw<
      {
        id: string;
        kind: string;
        title: string;
        handle: string;
        seoTitle: string | null;
        seoDescription: string | null;
        document: unknown;
      }[]
    >`
      SELECT pg.id, pg.kind::text AS kind, pg.title, pg.handle, pg."seoTitle", pg."seoDescription", v.document
      FROM "Page" pg
      JOIN "PageVersion" v ON v.id = pg."publishedVersionId" AND v.state = 'PUBLISHED'
      WHERE pg."deletedAt" IS NULL AND pg.kind = ${kind}::"PageKind"
        ${kind === STANDARD_PAGE_KIND ? Prisma.sql`AND pg.handle = ${handle ?? ""}` : Prisma.empty}
      LIMIT 1`;
    const row = rows[0];
    return row ? { ...row, id: toTypeId("page", row.id) } : null;
  }

  /** Handles for page TypeIds that are live in this store (no query when there are none). */
  async pageLinks(ids: readonly string[]): Promise<Map<string, string>> {
    const pages = pageUuids("page", ids);
    const out = new Map<string, string>();
    if (pages.length === 0) return out;
    const rows = await this.tx.$queryRaw<{ id: string; handle: string }[]>`
      SELECT pg.id, pg.handle FROM "Page" pg
      WHERE pg.id = ANY(${pages}::uuid[]) AND pg."deletedAt" IS NULL AND pg."publishedVersionId" IS NOT NULL`;
    for (const row of rows) out.set(toTypeId("page", row.id), row.handle);
    return out;
  }

  /** Images for media TypeIds that are READY in this store. */
  async media(ids: readonly string[]): Promise<Map<string, ImageDto>> {
    const byUuid = await this.imagesByUuid(pageUuids("media", ids));
    return new Map([...byUuid].map(([id, view]) => [toTypeId("media", id), view]));
  }

  /** Images for media UUIDs that are READY in this store (no query when there are none). */
  async imagesByUuid(ids: readonly string[]): Promise<Map<string, ImageDto>> {
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

  /** Published content pages for the sitemap. */
  async sitemapPages(): Promise<SitemapEntry[]> {
    return this.tx.$queryRaw<SitemapEntry[]>`
      SELECT '/pages/' || pg.handle AS path, pg."updatedAt" FROM "Page" pg
      WHERE pg.kind = 'STANDARD' AND pg."deletedAt" IS NULL AND pg."publishedVersionId" IS NOT NULL
      ORDER BY 1
      LIMIT 50000`;
  }
}

/**
 * Runs `fn` with a site reader bound to one read-only storefront transaction
 * for the resolved store. `scope` must come from the host resolver.
 */
export function readPublicSite<T>(
  scope: StorefrontScope,
  fn: (site: SiteReader) => Promise<T>,
): Promise<T> {
  return withStorefront(scope, (tx) => fn(new SiteReader(tx)), { readOnly: true });
}
