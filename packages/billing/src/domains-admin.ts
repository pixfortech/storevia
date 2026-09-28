import "server-only";
import { platformDb } from "@storevia/database/platform";
import { requirePlatformPermission, type PlatformContext } from "@storevia/tenancy/platform";

// Custom-domain diagnostics for platform-admin (ADR-0032 §9). Read-only:
// staff see every store's domains and why one isn't active, never the
// verification token or the provider's project identifiers, and can't
// change anything here (merchants and the worker do).

export type DomainStatusFilter = "ALL" | "PENDING" | "VERIFYING" | "ACTIVE" | "FAILED";

export interface AdminDomainRow {
  readonly id: string;
  readonly hostname: string;
  readonly type: "PLATFORM_SUBDOMAIN" | "CUSTOM";
  readonly status: "PENDING" | "VERIFYING" | "ACTIVE" | "FAILED";
  readonly isPrimary: boolean;
  readonly failureReason: string | null;
  readonly checkAttempts: number;
  readonly lastCheckedAt: Date | null;
  readonly verifiedAt: Date | null;
  readonly createdAt: Date;
  /** "vercel" or "local": the provider key only, never its project ids. */
  readonly provider: string | null;
  readonly store: { readonly id: string; readonly name: string; readonly slug: string };
  readonly organisation: { readonly id: string; readonly name: string };
}

export interface DomainsOverview {
  readonly counts: Readonly<Record<"PENDING" | "VERIFYING" | "ACTIVE" | "FAILED", number>>;
  readonly rows: readonly AdminDomainRow[];
  /** More custom domains match than are listed. */
  readonly truncated: boolean;
}

const LIMIT = 200;
/** Problems first, then domains still being set up, then working ones. */
const RANK = { FAILED: 0, PENDING: 1, VERIFYING: 2, ACTIVE: 3 } as const;

export async function getDomainsOverview(
  ctx: PlatformContext,
  filter: { readonly status?: DomainStatusFilter; readonly query?: string } = {},
): Promise<DomainsOverview> {
  requirePlatformPermission(ctx, "platform.audit.read");
  const db = platformDb();
  const status = filter.status && filter.status !== "ALL" ? filter.status : undefined;
  const query = filter.query?.trim().toLowerCase().slice(0, 253);
  const [grouped, rows] = await Promise.all([
    db.storeDomain.groupBy({
      by: ["status"],
      where: { type: "CUSTOM" },
      _count: { _all: true },
    }),
    db.storeDomain.findMany({
      where: {
        type: "CUSTOM",
        ...(status ? { status } : {}),
        ...(query ? { hostname: { contains: query } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: LIMIT + 1,
      select: {
        id: true,
        hostname: true,
        type: true,
        status: true,
        isPrimary: true,
        failureReason: true,
        checkAttempts: true,
        lastCheckedAt: true,
        verifiedAt: true,
        createdAt: true,
        providerRef: true,
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            organisation: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);
  const counts = { PENDING: 0, VERIFYING: 0, ACTIVE: 0, FAILED: 0 };
  for (const g of grouped) counts[g.status] = g._count._all;
  return {
    counts,
    truncated: rows.length > LIMIT,
    rows: rows
      .slice(0, LIMIT)
      .sort((a, b) => RANK[a.status] - RANK[b.status])
      .map((r) => ({
        id: r.id,
        hostname: r.hostname,
        type: r.type,
        status: r.status,
        isPrimary: r.isPrimary,
        failureReason: r.failureReason,
        checkAttempts: r.checkAttempts,
        lastCheckedAt: r.lastCheckedAt,
        verifiedAt: r.verifiedAt,
        createdAt: r.createdAt,
        provider: r.providerRef?.split(":")[0] ?? null,
        store: { id: r.store.id, name: r.store.name, slug: r.store.slug },
        organisation: r.store.organisation,
      })),
  };
}
