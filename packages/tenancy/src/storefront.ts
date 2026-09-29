import "server-only";
import { withTenant, type TenantTx } from "@storevia/database";
import {
  platformHostname,
  signPreviewToken,
  storefrontOrigin,
  storeSlugSchema,
} from "@storevia/domains";
import { notFound } from "@storevia/types";
import { z } from "zod";
import { recordAudit } from "./audit";
import { requirePermission, scopeOf, type StoreContext } from "./context";
import { isUniqueViolation, parseInput } from "./errors";
import { conflict, generateTokenSafe } from "./internal";

// The store's storefront from the merchant's side (ADR-0028 §3, §11, §12):
// going live or back to "coming soon", preview links, and changing the store
// address (slug) with redirects from the old one.

export interface OnlineStore {
  readonly status: "DRAFT" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  readonly slug: string;
  /** The primary host's public URL, or null when the store has none. */
  readonly url: string | null;
  /** Hosts that redirect to the primary (e.g. old store addresses). */
  readonly redirectingHosts: readonly string[];
}

export async function getOnlineStore(ctx: StoreContext): Promise<OnlineStore> {
  requirePermission(ctx, "store.read");
  const row = await withTenant(scopeOf(ctx), (tx) =>
    tx.store.findFirst({
      where: { id: ctx.storeId, organisationId: ctx.organisationId },
      select: {
        status: true,
        slug: true,
        domains: {
          where: { status: "ACTIVE" },
          select: { hostname: true, isPrimary: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  );
  if (!row) throw notFound();
  const primary = row.domains.find((d) => d.isPrimary)?.hostname ?? null;
  return {
    status: row.status,
    slug: row.slug,
    url: primary ? `${storefrontOrigin(primary)}/` : null,
    redirectingHosts: row.domains.filter((d) => !d.isPrimary).map((d) => d.hostname),
  };
}

/**
 * One thing a store needs before it goes live (final pass, DB-1). The checks
 * themselves live with what they check (commerce, the page system); the app
 * composes them and this module enforces them.
 */
export interface LaunchCheck {
  /** Stable key, e.g. "payments". */
  readonly key: string;
  /** What is checked, e.g. "Payments". */
  readonly label: string;
  readonly ok: boolean;
  /** A blocking check keeps the store from going live; others are warnings. */
  readonly blocking: boolean;
  /** What is set up, or exactly what is missing. */
  readonly detail: string;
}

/** Runs every launch check for the context's store, in the caller's transaction. */
export type LaunchReadinessCheck = (tx: TenantTx) => Promise<readonly LaunchCheck[]>;

/** The checks that keep a store from going live. */
export const launchBlockers = (checks: readonly LaunchCheck[]): LaunchCheck[] =>
  checks.filter((c) => c.blocking && !c.ok);

/** Runs the launch checks for display (the same ones going live enforces). Needs `store.read`. */
export async function launchReadiness(
  ctx: StoreContext,
  readiness: LaunchReadinessCheck,
): Promise<readonly LaunchCheck[]> {
  requirePermission(ctx, "store.read");
  return withTenant(scopeOf(ctx), readiness);
}

/**
 * Takes the storefront live (ACTIVE) or back to "coming soon" (DRAFT). Only
 * between those two: suspension is the platform's, archiving has its own path.
 * Going live runs the launch checks in the same transaction, with the store
 * row locked, and refuses while any blocking check fails: an incomplete store
 * never goes live to fail at checkout (final pass, DB-1).
 */
export async function setStorefrontLive(ctx: StoreContext, live: false): Promise<void>;
export async function setStorefrontLive(
  ctx: StoreContext,
  live: true,
  readiness: LaunchReadinessCheck,
): Promise<void>;
export async function setStorefrontLive(
  ctx: StoreContext,
  live: boolean,
  readiness?: LaunchReadinessCheck,
): Promise<void> {
  requirePermission(ctx, "store.update");
  if (live && !readiness) throw new Error("setStorefrontLive: going live needs the launch checks");
  const [from, to] = live ? (["DRAFT", "ACTIVE"] as const) : (["ACTIVE", "DRAFT"] as const);
  await withTenant(scopeOf(ctx), async (tx) => {
    const rows = await tx.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM "Store"
      WHERE id = ${ctx.storeId}::uuid AND "organisationId" = ${ctx.organisationId}::uuid
      FOR UPDATE`;
    const current = rows[0];
    if (!current) throw notFound();
    if (current.status === to) return;
    if (current.status !== from) {
      throw conflict(
        current.status === "SUSPENDED"
          ? "This store is suspended. Contact Storevia support."
          : "Archived stores can't go live.",
      );
    }
    if (live && readiness) {
      const blockers = launchBlockers(await readiness(tx));
      if (blockers.length > 0) {
        throw conflict(
          `Your store isn't ready to go live yet: ${blockers.map((b) => b.detail).join(" ")}`,
        );
      }
    }
    const { count } = await tx.store.updateMany({
      where: { id: ctx.storeId, organisationId: ctx.organisationId, status: from },
      data: { status: to },
    });
    if (count === 0) throw conflict("This store changed at the same time. Reload and try again.");
    await recordAudit(
      tx,
      ctx,
      live ? "store.storefront_live" : "store.storefront_coming_soon",
      { type: "Store", id: ctx.storeId },
      { status: to, previousStatus: from },
    );
  });
}

const changeSlugSchema = z.object({ slug: storeSlugSchema });

/**
 * Changes the store address (ADR-0028 §12). The old slug goes into the
 * store's slug history, which no other store can ever claim; the old
 * platform host stays as an ACTIVE, non-primary domain, so old links
 * redirect to the new address.
 */
export async function changeStoreSlug(
  ctx: StoreContext,
  input: unknown,
): Promise<{ hostname: string }> {
  requirePermission(ctx, "domain.manage");
  const { slug } = parseInput(changeSlugSchema, input);
  const hostname = platformHostname(slug);
  try {
    return await withTenant(scopeOf(ctx), async (tx) => {
      const rows = await tx.$queryRaw<{ slug: string; status: string }[]>`
        SELECT slug, status::text FROM "Store"
        WHERE id = ${ctx.storeId}::uuid AND "organisationId" = ${ctx.organisationId}::uuid
        FOR UPDATE`;
      const current = rows[0];
      if (!current) throw notFound();
      if (current.status === "ARCHIVED" || current.status === "SUSPENDED") {
        throw conflict("This store's address can't be changed right now.");
      }
      if (current.slug === slug) return { hostname };
      await tx.$executeRaw`
        INSERT INTO "StoreSlugHistory" (id, "organisationId", "storeId", slug)
        VALUES (gen_random_uuid(), ${ctx.organisationId}::uuid, ${ctx.storeId}::uuid, ${current.slug})
        ON CONFLICT (slug) DO NOTHING`;
      await tx.store.update({ where: { id: ctx.storeId }, data: { slug }, select: { id: true } });

      // The platform host is primary unless a custom domain is (M7).
      const primary = await tx.storeDomain.findFirst({
        where: { storeId: ctx.storeId, isPrimary: true },
        select: { id: true, type: true },
      });
      const movePrimary = !primary || primary.type === "PLATFORM_SUBDOMAIN";
      if (movePrimary && primary) {
        await tx.storeDomain.update({
          where: { id: primary.id },
          data: { isPrimary: false },
          select: { id: true },
        });
      }
      // Returning to an address this store used before reuses its domain row.
      const existing = await tx.storeDomain.findFirst({
        where: { storeId: ctx.storeId, hostname },
        select: { id: true },
      });
      if (existing) {
        await tx.storeDomain.update({
          where: { id: existing.id },
          data: { isPrimary: movePrimary, status: "ACTIVE" },
          select: { id: true },
        });
      } else {
        await tx.storeDomain.create({
          data: {
            organisationId: ctx.organisationId,
            storeId: ctx.storeId,
            hostname,
            type: "PLATFORM_SUBDOMAIN",
            status: "ACTIVE",
            isPrimary: movePrimary,
            verifiedAt: new Date(),
            verificationToken: generateTokenSafe(),
          },
          select: { id: true },
        });
      }
      await recordAudit(
        tx,
        ctx,
        "store.slug_changed",
        { type: "Store", id: ctx.storeId },
        { slug, previousSlug: current.slug },
      );
      return { hostname };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("That store address is already taken.", {
        slug: "That address is already taken.",
      });
    }
    throw error;
  }
}

/**
 * A 15-minute preview link for the store's storefront (design.edit). The
 * token is bound to this store; the storefront refuses it anywhere else.
 */
export async function storefrontPreviewUrl(ctx: StoreContext, path = "/"): Promise<string> {
  requirePermission(ctx, "design.edit");
  const secret = process.env["STOREFRONT_PREVIEW_SECRET"];
  if (!secret) throw new Error("STOREFRONT_PREVIEW_SECRET is not set");
  const online = await getOnlineStore(ctx);
  if (!online.url) throw conflict("This store has no address yet.");
  const safePath = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  const url = new URL(safePath, online.url);
  url.searchParams.set("preview", signPreviewToken(ctx.storeId, secret));
  return url.toString();
}
