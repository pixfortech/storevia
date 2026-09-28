import "server-only";
import type { Prisma } from "@storevia/database";
import { withTenant, type TenantTx } from "@storevia/database";
import {
  DOMAIN_REASONS,
  isDomainReason,
  parseCustomHostname,
  platformHostname,
  storefrontOrigin,
  type DomainReason,
} from "@storevia/domains";
import {
  domainProvisionerKey,
  evaluateDomain,
  getDomainProvisioner,
  ownershipRecord,
  type DnsRecord,
  type DomainOutcome,
  type DomainProvisioner,
} from "@storevia/domains/provisioner";
import { assertFeature, hasFeature } from "@storevia/entitlements";
import { recordMetric } from "@storevia/observability";
import { consumeRateLimit } from "@storevia/security/server";
import { DomainError, notFound, toTypeId } from "@storevia/types";
import { recordAudit, type AuditMetadata } from "./audit";
import {
  hasPermission,
  parsePublicId,
  requirePermission,
  scopeOf,
  requireRecentAuthentication,
  type StoreContext,
} from "./context";
import { isUniqueViolation } from "./errors";
import { conflict, generateTokenSafe } from "./internal";

// Custom domains from the merchant's side (ADR-0032): add, check, make
// primary, remove. The hosting provider is called only here and from the
// verification worker (the control plane), never while serving a shopper.
// Each provider call happens under the domain row's lock, so a check, a
// removal and the worker can't interleave on the same domain; a second
// action on a locked domain fails fast instead of queueing. Store-wide
// changes (add, primary, remove) also take the store row FOR NO KEY UPDATE:
// that serialises them without blocking the foreign-key checks a domain
// update's outbox event makes on the same row (FOR UPDATE would deadlock).

/** Custom domains one store may hold (all states). */
export const MAX_CUSTOM_DOMAINS_PER_STORE = 10;

const ADD_LIMIT = { name: "domains:add", limit: 10, windowSeconds: 3600 } as const;
const CHECK_LIMIT = { name: "domains:check", limit: 30, windowSeconds: 3600 } as const;

/** Provider calls are bounded (8 s each); a check makes at most five. */
const CHECK_TX_TIMEOUT_MS = 60_000;

type DomainStatus = "PENDING" | "VERIFYING" | "ACTIVE" | "FAILED";

export interface DomainRecordView {
  readonly type: DnsRecord["type"];
  readonly name: string;
  readonly value: string;
  readonly purpose: DnsRecord["purpose"];
  /** What Storevia last saw for this record. */
  readonly state: "found" | "waiting" | "check";
}

export interface StoreDomainView {
  /** Public id (domain_…). */
  readonly id: string;
  readonly hostname: string;
  readonly url: string;
  readonly kind: "platform" | "custom";
  readonly status: DomainStatus;
  readonly isPrimary: boolean;
  readonly https: "active" | "pending" | "not_yet";
  /** Why the domain isn't active (or, for an active one, what's wrong). */
  readonly message: string | null;
  readonly records: readonly DomainRecordView[];
  readonly verifiedAt: Date | null;
  readonly lastCheckedAt: Date | null;
}

export interface StoreDomains {
  readonly domains: readonly StoreDomainView[];
  readonly primaryHostname: string | null;
  /** The store's current platform address (slug.storevia.site). */
  readonly platformHostname: string;
  /** The plan includes custom domains (hasFeature, never a plan name). */
  readonly customDomainsIncluded: boolean;
  readonly canManage: boolean;
  readonly limit: number;
}

interface DomainRow {
  id: string;
  hostname: string;
  type: "PLATFORM_SUBDOMAIN" | "CUSTOM";
  status: DomainStatus;
  isPrimary: boolean;
  verificationToken: string;
  providerRef: string | null;
  checkAttempts: number;
  failureReason: string | null;
  dnsRecords: unknown;
  verifiedAt: Date | null;
  lastCheckedAt: Date | null;
}

const DOMAIN_SELECT = {
  id: true,
  hostname: true,
  type: true,
  status: true,
  isPrimary: true,
  verificationToken: true,
  providerRef: true,
  checkAttempts: true,
  failureReason: true,
  dnsRecords: true,
  verifiedAt: true,
  lastCheckedAt: true,
} as const;

// ---------------------------------------------------------------------------
// Views.
// ---------------------------------------------------------------------------

function storedRecords(value: unknown): DnsRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (r): r is DnsRecord =>
      typeof r === "object" &&
      r !== null &&
      typeof (r as DnsRecord).type === "string" &&
      typeof (r as DnsRecord).name === "string" &&
      typeof (r as DnsRecord).value === "string" &&
      typeof (r as DnsRecord).purpose === "string",
  );
}

/** Which records were found, from where the last check stopped (ADR-0032 §3). */
function recordState(
  purpose: DnsRecord["purpose"],
  status: DomainStatus,
  reason: DomainReason | null,
): DomainRecordView["state"] {
  if (reason === "dns_lost") return "check";
  if (status === "ACTIVE" || reason === "certificate_pending") return "found";
  // The provider is asked only after ownership is proven (M8).
  if (
    reason === "dns_routing_missing" ||
    reason === "provider_error" ||
    reason === "provider_conflict"
  ) {
    return purpose === "ownership" ? "found" : "waiting";
  }
  return "waiting";
}

function toView(row: DomainRow): StoreDomainView {
  const reason = isDomainReason(row.failureReason) ? row.failureReason : null;
  const custom = row.type === "CUSTOM";
  const records = custom
    ? storedRecords(row.dnsRecords).map((r) => ({
        type: r.type,
        name: r.name,
        value: r.value,
        purpose: r.purpose,
        state: recordState(r.purpose, row.status, reason),
      }))
    : [];
  // Until the provider has been asked, the ownership record is still shown.
  if (custom && records.length === 0) {
    const own = ownershipRecord(row.hostname, row.verificationToken);
    records.push({ ...own, state: "waiting" });
  }
  return {
    id: toTypeId("domain", row.id),
    hostname: row.hostname,
    url: `${storefrontOrigin(row.hostname)}/`,
    kind: custom ? "custom" : "platform",
    status: row.status,
    isPrimary: row.isPrimary,
    https:
      row.status === "ACTIVE" ? "active" : reason === "certificate_pending" ? "pending" : "not_yet",
    message: reason ? DOMAIN_REASONS[reason] : null,
    records,
    verifiedAt: row.verifiedAt,
    lastCheckedAt: row.lastCheckedAt,
  };
}

const ORDER = { PLATFORM_SUBDOMAIN: 1, CUSTOM: 0 } as const;

export async function listStoreDomains(ctx: StoreContext): Promise<StoreDomains> {
  requirePermission(ctx, "store.read");
  return withTenant(scopeOf(ctx), async (tx) => {
    const store = await tx.store.findFirst({
      where: { id: ctx.storeId, organisationId: ctx.organisationId },
      select: { slug: true },
    });
    if (!store) throw notFound();
    const rows = await tx.storeDomain.findMany({
      where: { storeId: ctx.storeId, organisationId: ctx.organisationId },
      select: DOMAIN_SELECT,
      orderBy: { createdAt: "asc" },
    });
    const platform = platformHostname(store.slug);
    // Custom domains first, then the current platform address, then old
    // store addresses (which only redirect).
    const sorted = [...rows].sort(
      (a, b) =>
        Number(b.isPrimary) - Number(a.isPrimary) ||
        ORDER[a.type] - ORDER[b.type] ||
        Number(b.hostname === platform) - Number(a.hostname === platform),
    );
    return {
      domains: sorted.map((row) => toView(row as DomainRow)),
      primaryHostname: rows.find((r) => r.isPrimary)?.hostname ?? null,
      platformHostname: platform,
      customDomainsIncluded: await hasFeature(tx, ctx.organisationId, "custom_domain"),
      canManage: hasPermission(ctx, "domain.manage"),
      limit: MAX_CUSTOM_DOMAINS_PER_STORE,
    };
  });
}

// ---------------------------------------------------------------------------
// The verification step, shared with the worker.
// ---------------------------------------------------------------------------

export interface DomainCheckRow {
  readonly id: string;
  readonly storeId: string;
  readonly hostname: string;
  readonly status: DomainStatus;
  readonly isPrimary: boolean;
  readonly verificationToken: string;
  readonly providerRef: string | null;
  readonly checkAttempts: number;
  readonly failureReason: string | null;
}

export type DomainAuditWriter = (
  tx: TenantTx,
  action: string,
  metadata: AuditMetadata,
) => Promise<void>;

/**
 * The store's platform address becomes primary again (when its custom
 * primary fails or is removed). The platform row always exists (created
 * with the store and on every address change).
 */
async function platformBecomesPrimary(tx: TenantTx, storeId: string): Promise<string | null> {
  const store = await tx.store.findUnique({ where: { id: storeId }, select: { slug: true } });
  if (!store) return null;
  const hostname = platformHostname(store.slug);
  const { count } = await tx.storeDomain.updateMany({
    where: { storeId, hostname, type: "PLATFORM_SUBDOMAIN", status: "ACTIVE" },
    data: { isPrimary: true },
  });
  return count > 0 ? hostname : null;
}

/**
 * Asks the provider and DNS about a locked domain row and writes the
 * result (ADR-0032 §5). The caller holds the row lock (FOR UPDATE) in `tx`.
 * A primary domain that fails hands primary back to the platform address.
 */
export async function runDomainCheck(
  tx: TenantTx,
  row: DomainCheckRow,
  provisioner: DomainProvisioner,
  audit: DomainAuditWriter,
): Promise<DomainOutcome> {
  const outcome = await evaluateDomain(row, provisioner);
  const failed = outcome.status === "FAILED";
  await tx.storeDomain.updateMany({
    where: { id: row.id },
    data: {
      status: outcome.status,
      providerRef: outcome.providerRef,
      failureReason: outcome.failureReason,
      checkAttempts: outcome.checkAttempts,
      lastCheckedAt: new Date(),
      ...(outcome.dnsRecords
        ? { dnsRecords: outcome.dnsRecords as unknown as Prisma.InputJsonArray }
        : {}),
      ...(outcome.becameActive ? { verifiedAt: new Date() } : {}),
      ...(failed ? { isPrimary: false } : {}),
    },
  });
  const tags = { provider: provisioner.key };
  if (outcome.providerError) {
    recordMetric("domain.provider_error", 1, {
      ...tags,
      kind: outcome.providerError.split(":")[0] ?? "unknown",
    });
  }
  if (outcome.becameActive) {
    recordMetric("domain.verified", 1, tags);
    await audit(tx, "domain.verified", { hostname: row.hostname, status: "ACTIVE" });
  }
  if (failed && row.status !== "FAILED") {
    // An unproven or lost domain leaves Storevia's hosting project (M8), so
    // it can't block its owner's own hosting; checking again registers it
    // anew once ownership is proven.
    try {
      await provisioner.removeDomain(row.hostname);
      await tx.storeDomain.updateMany({ where: { id: row.id }, data: { providerRef: null } });
    } catch {
      recordMetric("domain.provider_error", 1, { ...tags, kind: "remove_failed" });
    }
    recordMetric("domain.verification_failed", 1, {
      ...tags,
      reason: outcome.failureReason ?? "unknown",
    });
    await audit(tx, "domain.failed", {
      hostname: row.hostname,
      status: "FAILED",
      reason: outcome.failureReason,
    });
    if (row.isPrimary) {
      const fallback = await platformBecomesPrimary(tx, row.storeId);
      recordMetric("domain.primary_changed", 1, { cause: "failure" });
      await audit(tx, "domain.primary_changed", {
        hostname: fallback,
        previousHostname: row.hostname,
        reason: "Domain verification failed",
      });
    }
  }
  return outcome;
}

// ---------------------------------------------------------------------------
// Merchant actions.
// ---------------------------------------------------------------------------

export interface DomainServiceOptions {
  /** Tests inject a provisioner; production uses the configured one. */
  readonly provisioner?: DomainProvisioner;
}

const userAudit =
  (ctx: StoreContext, id: string): DomainAuditWriter =>
  (tx, action, metadata) =>
    recordAudit(tx, ctx, action, { type: "StoreDomain", id }, metadata);

/** PostgreSQL gave up waiting for a row lock (lock_timeout: 55P03). */
function isLockTimeout(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message} ${JSON.stringify(error)}` : "";
  return text.includes("55P03") || /lock timeout|could not obtain lock/i.test(text);
}

const busy = () => conflict("This domain is being checked right now. Try again in a moment.");

async function setLockTimeout(tx: TenantTx, value: "3s" | "10s" | "20s") {
  await tx.$executeRaw`SELECT set_config('lock_timeout', ${value}, true)`;
}

/** Locks one of this store's domains (RLS and the explicit ids both scope it). */
async function lockDomain(tx: TenantTx, ctx: StoreContext, id: string): Promise<DomainRow> {
  const rows = await tx.$queryRaw<DomainRow[]>`
    SELECT id, hostname, type::text AS type, status::text AS status, "isPrimary",
      "verificationToken", "providerRef", "checkAttempts", "failureReason",
      "dnsRecords", "verifiedAt", "lastCheckedAt"
    FROM "StoreDomain"
    WHERE id = ${id}::uuid AND "storeId" = ${ctx.storeId}::uuid
      AND "organisationId" = ${ctx.organisationId}::uuid
    FOR UPDATE`;
  const row = rows[0];
  if (!row) throw notFound();
  return row;
}

async function withDomainLock<T>(
  ctx: StoreContext,
  fn: (tx: TenantTx) => Promise<T>,
  lockTimeout: "3s" | "10s" | "20s",
): Promise<T> {
  try {
    return await withTenant(
      scopeOf(ctx),
      async (tx) => {
        await setLockTimeout(tx, lockTimeout);
        return fn(tx);
      },
      { timeoutMs: CHECK_TX_TIMEOUT_MS },
    );
  } catch (error) {
    if (isLockTimeout(error)) throw busy();
    throw error;
  }
}

function assertStoreCanChange(ctx: StoreContext): void {
  if (ctx.storeStatus === "ARCHIVED" || ctx.storeStatus === "SUSPENDED") {
    throw conflict("This store's domains can't be changed right now.");
  }
}

async function rateLimited(rule: typeof ADD_LIMIT | typeof CHECK_LIMIT, ctx: StoreContext) {
  const result = await consumeRateLimit(rule, ctx.storeId);
  if (!result.allowed) {
    throw new DomainError(
      "RATE_LIMITED",
      rule === ADD_LIMIT
        ? "You've added several domains recently. Try again later."
        : "You've checked your domains many times recently. We keep checking automatically; try again later.",
    );
  }
}

/**
 * Adds a custom domain (ADR-0032 §3): validated and normalised, globally
 * unique, then registered with the hosting provider. Returns the domain
 * with the DNS records the merchant needs. A provider failure leaves it
 * PENDING; the worker keeps trying.
 */
export async function addCustomDomain(
  ctx: StoreContext,
  input: unknown,
  options: DomainServiceOptions = {},
): Promise<StoreDomainView> {
  requirePermission(ctx, "domain.manage");
  assertStoreCanChange(ctx);
  const raw = typeof input === "object" && input !== null ? (input as { hostname?: unknown }) : {};
  const parsed = parseCustomHostname(raw.hostname, {
    allowTestDomains: domainProvisionerKey() === "local",
  });
  if (!parsed.ok) {
    throw new DomainError("VALIDATION_FAILED", parsed.message, { hostname: parsed.message });
  }
  const { hostname } = parsed;
  await rateLimited(ADD_LIMIT, ctx);

  const claim = () =>
    withTenant(scopeOf(ctx), async (tx) => {
      await assertFeature(tx, ctx.organisationId, "custom_domain");
      // Serialises adds for this store (the per-store limit).
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${ctx.storeId}::uuid FOR NO KEY UPDATE`;
      const mine = await tx.storeDomain.findFirst({
        where: { storeId: ctx.storeId, hostname },
        select: { id: true },
      });
      if (mine) {
        throw conflict("This domain is already added to this store.", {
          hostname: "This domain is already added to this store.",
        });
      }
      const count = await tx.storeDomain.count({
        where: { storeId: ctx.storeId, type: "CUSTOM" },
      });
      if (count >= MAX_CUSTOM_DOMAINS_PER_STORE) {
        throw conflict(
          `A store can have up to ${String(MAX_CUSTOM_DOMAINS_PER_STORE)} custom domains.`,
        );
      }
      const token = generateTokenSafe();
      const created = await tx.storeDomain.create({
        data: {
          organisationId: ctx.organisationId,
          storeId: ctx.storeId,
          hostname,
          type: "CUSTOM",
          status: "PENDING",
          isPrimary: false,
          verificationToken: token,
          dnsRecords: [ownershipRecord(hostname, token)] as unknown as Prisma.InputJsonArray,
        },
        select: { id: true },
      });
      await recordAudit(
        tx,
        ctx,
        "domain.added",
        { type: "StoreDomain", id: created.id },
        { hostname, status: "PENDING" },
      );
      return created.id;
    });

  let id: string;
  try {
    id = await claim();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Held by another store. An unproven claim that FAILED or is older than
    // 72 hours is released (M8, S2); an ACTIVE or recent one is not. Which
    // store holds it is never said.
    const released = await withTenant(scopeOf(ctx), async (tx) => {
      const rows = await tx.$queryRaw<{ released: boolean }[]>`
        SELECT app_release_stale_domain(${hostname}) AS released`;
      return rows[0]?.released === true;
    });
    if (!released) {
      throw conflict("This domain is already connected to another Storevia store.", {
        hostname: "This domain is already connected to another Storevia store.",
      });
    }
    recordMetric("domain.released", 1);
    try {
      id = await claim();
    } catch (retryError) {
      if (!isUniqueViolation(retryError)) throw retryError;
      throw conflict("This domain is already connected to another Storevia store.", {
        hostname: "This domain is already connected to another Storevia store.",
      });
    }
  }
  recordMetric("domain.added", 1);
  // First registration and check; a busy lock or provider failure is retried
  // by the worker.
  try {
    return await checkDomain(ctx, id, options);
  } catch (error) {
    if (!(error instanceof DomainError) || error.code !== "CONFLICT") throw error;
    return getDomain(ctx, id);
  }
}

async function getDomain(ctx: StoreContext, id: string): Promise<StoreDomainView> {
  const row = await withTenant(scopeOf(ctx), (tx) =>
    tx.storeDomain.findFirst({
      where: { id, storeId: ctx.storeId, organisationId: ctx.organisationId },
      select: DOMAIN_SELECT,
    }),
  );
  if (!row) throw notFound();
  return toView(row);
}

async function checkDomain(
  ctx: StoreContext,
  id: string,
  options: DomainServiceOptions,
): Promise<StoreDomainView> {
  const provisioner = options.provisioner ?? getDomainProvisioner();
  return withDomainLock(
    ctx,
    async (tx) => {
      const locked = await lockDomain(tx, ctx, id);
      if (locked.type !== "CUSTOM") return toView(locked);
      // FAILED is retryable: the merchant fixed DNS and asks again.
      const row: DomainCheckRow = {
        ...locked,
        storeId: ctx.storeId,
        ...(locked.status === "FAILED"
          ? { status: "VERIFYING" as const, checkAttempts: 0, failureReason: null }
          : {}),
      };
      recordMetric("domain.verification_started", 1, { provider: provisioner.key });
      await runDomainCheck(tx, row, provisioner, userAudit(ctx, id));
      return toView(await lockDomain(tx, ctx, id));
    },
    "3s",
  );
}

/**
 * "Check again" (idempotent): one verification step now, whatever the
 * worker's schedule. A FAILED domain starts a fresh round of checks.
 */
export async function checkCustomDomain(
  ctx: StoreContext,
  publicId: unknown,
  options: DomainServiceOptions = {},
): Promise<StoreDomainView> {
  requirePermission(ctx, "domain.manage");
  assertStoreCanChange(ctx);
  const id = parsePublicId("domain", publicId);
  await rateLimited(CHECK_LIMIT, ctx);
  await withTenant(scopeOf(ctx), (tx) => assertFeature(tx, ctx.organisationId, "custom_domain"));
  return checkDomain(ctx, id, options);
}

/**
 * Makes an ACTIVE domain the store's primary (ADR-0032 §6): every other
 * host then redirects to it. Transactional: the store row serialises
 * concurrent switches, and the target must still be ACTIVE when written.
 */
export async function setPrimaryDomain(ctx: StoreContext, publicId: unknown): Promise<void> {
  requirePermission(ctx, "domain.manage");
  assertStoreCanChange(ctx);
  const id = parsePublicId("domain", publicId);
  await withDomainLock(
    ctx,
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${ctx.storeId}::uuid FOR NO KEY UPDATE`;
      const target = await lockDomain(tx, ctx, id);
      if (target.isPrimary) return;
      if (target.status !== "ACTIVE") {
        throw conflict("Only an active domain can be made primary.");
      }
      if (target.type === "CUSTOM") {
        await assertFeature(tx, ctx.organisationId, "custom_domain");
      } else {
        // Old store addresses only redirect; the current one can be primary.
        const store = await tx.store.findFirst({
          where: { id: ctx.storeId },
          select: { slug: true },
        });
        if (!store || platformHostname(store.slug) !== target.hostname) {
          throw conflict("This is an old store address. It can only redirect.");
        }
      }
      const previous = await tx.storeDomain.findFirst({
        where: { storeId: ctx.storeId, isPrimary: true },
        select: { hostname: true },
      });
      await tx.storeDomain.updateMany({
        where: { storeId: ctx.storeId, isPrimary: true },
        data: { isPrimary: false },
      });
      const { count } = await tx.storeDomain.updateMany({
        where: { id, storeId: ctx.storeId, status: "ACTIVE" },
        data: { isPrimary: true },
      });
      if (count !== 1)
        throw conflict("This domain changed at the same time. Reload and try again.");
      await recordAudit(
        tx,
        ctx,
        "domain.primary_changed",
        { type: "StoreDomain", id },
        { hostname: target.hostname, previousHostname: previous?.hostname ?? null },
      );
    },
    "10s",
  );
  recordMetric("domain.primary_changed", 1, { cause: "merchant" });
}

/**
 * Removes a custom domain (ADR-0032 §8): the store's platform address
 * becomes primary if this one was, the provider forgets the domain, then
 * the row goes. Anyone can add the domain again afterwards, but only with a
 * new ownership record (a new token).
 */
export async function removeCustomDomain(
  ctx: StoreContext,
  publicId: unknown,
  options: DomainServiceOptions = {},
): Promise<void> {
  requirePermission(ctx, "domain.manage");
  requireRecentAuthentication(ctx, "removing a domain");
  const id = parsePublicId("domain", publicId);
  const provisioner = options.provisioner ?? getDomainProvisioner();
  await withDomainLock(
    ctx,
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${ctx.storeId}::uuid FOR NO KEY UPDATE`;
      const row = await lockDomain(tx, ctx, id);
      if (row.type !== "CUSTOM") {
        throw conflict("Storevia addresses can't be removed.");
      }
      if (row.isPrimary) {
        await tx.storeDomain.updateMany({ where: { id }, data: { isPrimary: false } });
        const fallback = await platformBecomesPrimary(tx, ctx.storeId);
        if (!fallback) throw conflict("Make another domain primary first.");
        await recordAudit(
          tx,
          ctx,
          "domain.primary_changed",
          { type: "StoreDomain", id },
          { hostname: fallback, previousHostname: row.hostname },
        );
      }
      try {
        await provisioner.removeDomain(row.hostname);
      } catch {
        recordMetric("domain.provider_error", 1, { provider: provisioner.key, kind: "remove" });
        throw new DomainError(
          "CONFLICT",
          "We couldn't disconnect this domain from our hosting provider. Try again in a moment.",
        );
      }
      await tx.storeDomain.deleteMany({ where: { id, storeId: ctx.storeId } });
      await recordAudit(
        tx,
        ctx,
        "domain.removed",
        { type: "StoreDomain", id },
        { hostname: row.hostname, status: row.status },
      );
    },
    "20s",
  );
  recordMetric("domain.removed", 1);
}
