import "server-only";
import { Prisma, type TenantTx } from "@storevia/database";
import { platformDb } from "@storevia/database/platform";
import {
  isEntitling,
  isFeatureKey,
  loadLiveSubscription,
  previewUsageForPlan,
  reconcileUsage,
  type UsageLine,
} from "@storevia/entitlements";
import { parsePublicId, recordActorAudit } from "@storevia/tenancy";
import {
  requirePlatformPermission,
  requirePlatformStepUp,
  type PlatformContext,
  type PlatformPermission,
} from "@storevia/tenancy/platform";
import { DomainError, notFound } from "@storevia/types";
import { fieldErrors } from "@storevia/validation";
import { z } from "zod";
import { notifyEntitlementsChanged } from "./events";
import {
  applySubscriptionChange,
  lockLiveSubscription,
  stateOf,
  type ChangeActor,
  type StoredSubscription,
  type SubscriptionState,
} from "./subscriptions";

// Manual subscription management by Storevia staff (docs 05 §5, ADR-0022).
// Every operation: platform permission → step-up → validated input with a
// reason → one transaction on the platform connection that writes the change,
// a SubscriptionEvent and an AuditLog row → entitlement change notification.

const DAY = 24 * 3600 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

// --- input -------------------------------------------------------------------

const reasonSchema = z
  .string()
  .trim()
  .min(3, "Give a reason (at least 3 characters).")
  .max(500, "Keep the reason under 500 characters.");
const noteSchema = z
  .string()
  .trim()
  .max(2000, "Keep notes under 2,000 characters.")
  .optional()
  .transform((v) => (v === "" ? undefined : v));

/** "" / missing → null; otherwise an ISO date or datetime (dates are 00:00 UTC). */
const optionalDate = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === null || value === undefined || value === "") return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date." });
      return z.NEVER;
    }
    return date;
  });

const checkbox = z
  .union([z.boolean(), z.literal("on"), z.literal("true"), z.literal("")])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true");

const intervalSchema = z
  .enum(["MONTH", "YEAR", "NONE"])
  .default("NONE")
  .transform((v) => (v === "NONE" ? null : v));

const base = { organisationId: z.string(), reason: reasonSchema, note: noteSchema };

export const assignPlanSchema = z.object({
  ...base,
  planKey: z.string().min(1, "Choose a plan.").max(40),
  status: z.enum(["TRIAL", "ACTIVE"]),
  billingInterval: intervalSchema,
  startedAt: optionalDate,
  trialStartsAt: optionalDate,
  trialEndsAt: optionalDate,
  expiresAt: optionalDate,
});

export const changeSubscriptionSchema = z.object({
  ...base,
  subscriptionId: z.string(),
  planKey: z.string().min(1, "Choose a plan.").max(40),
  billingInterval: intervalSchema,
  trialEndsAt: optionalDate,
  expiresAt: optionalDate,
  acknowledgeOverLimit: checkbox,
});

export const activateSchema = z.object({
  ...base,
  subscriptionId: z.string(),
  expiresAt: optionalDate,
});

export const cancelSchema = z.object({
  ...base,
  subscriptionId: z.string(),
  accessEndsAt: optionalDate,
});

export const expireSchema = z.object({
  ...base,
  subscriptionId: z.string(),
  acknowledgeOverLimit: checkbox,
});

export const setOverrideSchema = z.object({
  ...base,
  featureKey: z.string().refine(isFeatureKey, "Choose a feature."),
  mode: z.enum(["enabled", "disabled", "limit", "unlimited", "config"]),
  limit: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^\d{1,15}$/.test(v), "Enter a whole number."),
  config: z.string().trim().max(2000).optional(),
  expiresAt: optionalDate,
  acknowledgeOverLimit: checkbox,
});

export const removeOverrideSchema = z.object({
  ...base,
  featureKey: z.string(),
  acknowledgeOverLimit: checkbox,
});

export const reconcileSchema = z.object({ organisationId: z.string(), reason: reasonSchema });

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new DomainError(
      "VALIDATION_FAILED",
      "Please correct the highlighted fields.",
      fieldErrors(result.error),
    );
  }
  return result.data;
}

const fieldError = (field: string, message: string) =>
  new DomainError("VALIDATION_FAILED", message, { [field]: message });

// --- shared ------------------------------------------------------------------

export interface ManualResult {
  readonly subscriptionId?: string;
  /** Gauges over their limit after the change (data is kept; creation blocked). */
  readonly overLimit: readonly UsageLine[];
}

function authorise(ctx: PlatformContext, permission: PlatformPermission, stepUp = true): void {
  requirePlatformPermission(ctx, permission);
  if (stepUp) requirePlatformStepUp(ctx);
}

const actorOf = (ctx: PlatformContext): ChangeActor => ({
  type: "PLATFORM_STAFF",
  userId: ctx.userId,
  request: ctx.request,
});

async function inTransaction<T>(fn: (tx: TenantTx) => Promise<T>): Promise<T> {
  try {
    return await platformDb().$transaction(fn, { timeout: 15_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DomainError(
        "CONFLICT",
        "This organisation's subscription changed at the same time. Reload and try again.",
      );
    }
    throw error;
  }
}

async function loadOrganisation(tx: TenantTx, publicId: unknown): Promise<string> {
  const organisationId = parsePublicId("organisation", publicId);
  const org = await tx.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true, status: true },
  });
  if (!org || org.status === "DELETED") throw notFound();
  return organisationId;
}

/** Plans staff can newly assign (LEGACY plans only keep existing subscribers). */
async function assignablePlan(tx: TenantTx, key: string) {
  const plan = await tx.plan.findUnique({
    where: { key },
    select: { id: true, key: true, name: true, status: true, trialDays: true },
  });
  if (plan?.status !== "ACTIVE") throw fieldError("planKey", "Choose an available plan.");
  return plan;
}

async function planKeyOf(tx: TenantTx, planId: string): Promise<string> {
  return (await tx.plan.findUniqueOrThrow({ where: { id: planId }, select: { key: true } })).key;
}

/** The live MANUAL subscription the form was showing (guards against stale forms). */
async function lockManual(
  tx: TenantTx,
  organisationId: string,
  subscriptionPublicId: unknown,
  options: { readonly allowEndedProviderSubscription?: boolean } = {},
): Promise<StoredSubscription> {
  const subscriptionId = parsePublicId("subscription", subscriptionPublicId);
  const live = await lockLiveSubscription(tx, organisationId);
  if (live?.id !== subscriptionId) {
    throw new DomainError(
      "CONFLICT",
      "This subscription has changed. Reload the page and try again.",
    );
  }
  // A provider-managed subscription whose entitlement has already ended can
  // be expired by staff, so a lost final provider event can't leave it stuck.
  const ended = !isEntitling(live, new Date());
  if (live.source !== "MANUAL" && !(options.allowEndedProviderSubscription && ended)) {
    throw new DomainError(
      "CONFLICT",
      "This subscription is managed by a billing provider. Change it through the provider.",
    );
  }
  return live;
}

function describeOverLimit(lines: readonly UsageLine[]): string {
  return lines
    .map((l) => `${l.name.toLowerCase()} (${l.usage.toString()} of ${String(l.limit)})`)
    .join(", ");
}

/** Over-limit pre-check: never blocks the change, but staff must acknowledge it. */
async function precheck(
  tx: TenantTx,
  organisationId: string,
  planId: string | null,
  acknowledged: boolean,
): Promise<UsageLine[]> {
  const over = (await previewUsageForPlan(tx, organisationId, planId)).filter((l) => l.overLimit);
  if (over.length > 0 && !acknowledged) {
    const message = `After this change the organisation is over its limit for ${describeOverLimit(over)}. Nothing is deleted: existing resources keep working and new ones are blocked. Confirm to continue.`;
    throw new DomainError("CONFLICT", message, { acknowledgeOverLimit: message });
  }
  return over;
}

async function overLimitNow(tx: TenantTx, organisationId: string, planId: string | null) {
  return (await previewUsageForPlan(tx, organisationId, planId)).filter((l) => l.overLimit);
}

/** The plan that grants entitlements right now (null when none does). */
async function entitlingPlanId(tx: TenantTx, organisationId: string): Promise<string | null> {
  const live = await loadLiveSubscription(tx, organisationId);
  return live?.entitling ? live.planId : null;
}

/**
 * Override changes that newly put the organisation over a limit need the same
 * acknowledgement as a downgrade. Runs after the write inside the
 * transaction: throwing rolls the change back.
 */
async function acknowledgeNewOverLimit(
  tx: TenantTx,
  organisationId: string,
  before: readonly UsageLine[],
  acknowledged: boolean,
): Promise<UsageLine[]> {
  const after = await overLimitNow(tx, organisationId, await entitlingPlanId(tx, organisationId));
  const newly = after.filter((l) => !before.some((b) => b.key === l.key));
  if (newly.length > 0 && !acknowledged) {
    const message = `After this change the organisation is over its limit for ${describeOverLimit(newly)}. Nothing is deleted: existing resources keep working and new ones are blocked. Confirm to continue.`;
    throw new DomainError("CONFLICT", message, { acknowledgeOverLimit: message });
  }
  return after;
}

function assertFuture(field: string, date: Date | null, message: string): void {
  if (date && date.getTime() <= Date.now()) throw fieldError(field, message);
}

// --- subscription operations -----------------------------------------------------

/** Assigns a plan (ACTIVE) or starts a trial (TRIAL) when there is no live subscription. */
export async function assignPlan(ctx: PlatformContext, input: unknown): Promise<ManualResult> {
  authorise(ctx, "platform.subscription.manage");
  const data = parse(assignPlanSchema, input);
  const now = new Date();
  const startedAt = data.startedAt ?? now;
  if (startedAt.getTime() > now.getTime() + FUTURE_SKEW_MS)
    throw fieldError("startedAt", "The start date can't be in the future.");
  assertFuture("expiresAt", data.expiresAt, "The expiry must be in the future.");

  const result = await inTransaction(async (tx) => {
    const organisationId = await loadOrganisation(tx, data.organisationId);
    const plan = await assignablePlan(tx, data.planKey);
    if (await lockLiveSubscription(tx, organisationId)) {
      throw new DomainError(
        "CONFLICT",
        "This organisation already has a live subscription. Change it, or expire it first.",
      );
    }
    let trialStartsAt: Date | null = null;
    let trialEndsAt: Date | null = null;
    if (data.status === "TRIAL") {
      trialStartsAt = data.trialStartsAt ?? startedAt;
      trialEndsAt =
        data.trialEndsAt ?? new Date(trialStartsAt.getTime() + Math.max(plan.trialDays, 1) * DAY);
      assertFuture("trialEndsAt", trialEndsAt, "The trial must end in the future.");
      if (trialEndsAt <= trialStartsAt)
        throw fieldError("trialEndsAt", "The trial must end after it starts.");
    }
    const next: SubscriptionState = {
      planId: plan.id,
      status: data.status,
      billingInterval: data.billingInterval,
      startedAt,
      trialStartsAt,
      trialEndsAt,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      expiresAt: data.expiresAt,
      cancelledAt: null,
      pastDueSince: null,
      graceEndsAt: null,
      endedAt: null,
    };
    const trial = data.status === "TRIAL";
    const applied = await applySubscriptionChange(tx, {
      organisationId,
      current: null,
      origin: { source: "MANUAL", provider: null, providerSubscriptionId: null },
      next,
      eventType: trial ? "trial_started" : "assigned",
      auditAction: trial ? "billing.subscription.trial_started" : "billing.subscription.assigned",
      actor: actorOf(ctx),
      reason: data.reason,
      note: data.note,
      occurredAt: now,
      planKeys: { before: null, after: plan.key },
    });
    return {
      organisationId,
      subscriptionId: applied.subscriptionId,
      overLimit: await overLimitNow(tx, organisationId, plan.id),
    };
  });
  await notifyEntitlementsChanged(result.organisationId);
  return { subscriptionId: result.subscriptionId, overLimit: result.overLimit };
}

/** Changes plan, interval, trial end or fixed expiry of a live MANUAL subscription. */
export async function changeSubscription(
  ctx: PlatformContext,
  input: unknown,
): Promise<ManualResult> {
  authorise(ctx, "platform.subscription.manage");
  const data = parse(changeSubscriptionSchema, input);
  const now = new Date();
  const result = await inTransaction(async (tx) => {
    const organisationId = await loadOrganisation(tx, data.organisationId);
    const current = await lockManual(tx, organisationId, data.subscriptionId);
    const plan =
      data.planKey === (await planKeyOf(tx, current.planId))
        ? await tx.plan.findUniqueOrThrow({
            where: { id: current.planId },
            select: { id: true, key: true, name: true, status: true, trialDays: true },
          })
        : await assignablePlan(tx, data.planKey);
    const next: SubscriptionState = {
      ...stateOf(current),
      planId: plan.id,
      billingInterval: data.billingInterval,
      trialEndsAt:
        current.status === "TRIAL"
          ? (data.trialEndsAt ?? current.trialEndsAt)
          : current.trialEndsAt,
      expiresAt: data.expiresAt,
    };
    if (
      current.status === "TRIAL" &&
      data.trialEndsAt &&
      data.trialEndsAt.getTime() !== current.trialEndsAt?.getTime()
    )
      assertFuture("trialEndsAt", data.trialEndsAt, "The trial must end in the future.");
    if (current.status === "CANCELLED" && !next.expiresAt)
      throw fieldError("expiresAt", "A cancelled subscription needs an access end date.");
    if (next.expiresAt?.getTime() !== current.expiresAt?.getTime())
      assertFuture("expiresAt", next.expiresAt, "The expiry must be in the future.");

    const planChanged = plan.id !== current.planId;
    const unchanged =
      !planChanged &&
      next.billingInterval === current.billingInterval &&
      next.trialEndsAt?.getTime() === current.trialEndsAt?.getTime() &&
      next.expiresAt?.getTime() === current.expiresAt?.getTime();
    if (unchanged) throw new DomainError("CONFLICT", "Nothing to change.");

    const over = planChanged
      ? await precheck(tx, organisationId, plan.id, data.acknowledgeOverLimit)
      : await overLimitNow(tx, organisationId, plan.id);
    const applied = await applySubscriptionChange(tx, {
      organisationId,
      current,
      next,
      eventType: planChanged ? "plan_changed" : "updated",
      auditAction: "billing.subscription.changed",
      actor: actorOf(ctx),
      reason: data.reason,
      note: data.note,
      occurredAt: now,
      planKeys: { before: await planKeyOf(tx, current.planId), after: plan.key },
      extraAudit: { overLimit: over.map((l) => l.key).join(",") || null },
    });
    return { organisationId, subscriptionId: applied.subscriptionId, overLimit: over };
  });
  await notifyEntitlementsChanged(result.organisationId);
  return { subscriptionId: result.subscriptionId, overLimit: result.overLimit };
}

/** TRIAL, PAST_DUE or CANCELLED → ACTIVE. */
export async function activateSubscription(
  ctx: PlatformContext,
  input: unknown,
): Promise<ManualResult> {
  authorise(ctx, "platform.subscription.manage");
  const data = parse(activateSchema, input);
  assertFuture("expiresAt", data.expiresAt, "The expiry must be in the future.");
  const now = new Date();
  const result = await inTransaction(async (tx) => {
    const organisationId = await loadOrganisation(tx, data.organisationId);
    const current = await lockManual(tx, organisationId, data.subscriptionId);
    if (current.status === "ACTIVE")
      throw new DomainError("CONFLICT", "This subscription is already active.");
    if (current.status === "CANCELLED" && !isEntitling(current, now))
      throw new DomainError(
        "CONFLICT",
        "Access under this cancelled subscription has already ended. Expire it and assign a new plan instead.",
      );
    const next: SubscriptionState = {
      ...stateOf(current),
      status: "ACTIVE",
      // A cancelled subscription is reactivated without its access end unless
      // a new fixed expiry is given.
      expiresAt:
        current.status === "CANCELLED" ? data.expiresAt : (data.expiresAt ?? current.expiresAt),
      cancelledAt: null,
      pastDueSince: null,
      graceEndsAt: null,
    };
    const planKey = await planKeyOf(tx, current.planId);
    const applied = await applySubscriptionChange(tx, {
      organisationId,
      current,
      next,
      eventType: current.status === "CANCELLED" ? "reactivated" : "activated",
      auditAction: "billing.subscription.activated",
      actor: actorOf(ctx),
      reason: data.reason,
      note: data.note,
      occurredAt: now,
      planKeys: { before: planKey, after: planKey },
    });
    return {
      organisationId,
      subscriptionId: applied.subscriptionId,
      overLimit: await overLimitNow(tx, organisationId, current.planId),
    };
  });
  await notifyEntitlementsChanged(result.organisationId);
  return { subscriptionId: result.subscriptionId, overLimit: result.overLimit };
}

/** TRIAL, ACTIVE or PAST_DUE → CANCELLED, keeping access until a chosen date. */
export async function cancelSubscription(
  ctx: PlatformContext,
  input: unknown,
): Promise<ManualResult> {
  authorise(ctx, "platform.subscription.manage");
  const data = parse(cancelSchema, input);
  const now = new Date();
  const result = await inTransaction(async (tx) => {
    const organisationId = await loadOrganisation(tx, data.organisationId);
    const current = await lockManual(tx, organisationId, data.subscriptionId);
    if (current.status === "CANCELLED")
      throw new DomainError("CONFLICT", "This subscription is already cancelled.");
    const accessEndsAt =
      data.accessEndsAt ??
      (current.status === "TRIAL"
        ? current.trialEndsAt
        : (current.expiresAt ?? current.currentPeriodEnd));
    if (!accessEndsAt) throw fieldError("accessEndsAt", "Choose when access ends.");
    assertFuture(
      "accessEndsAt",
      accessEndsAt,
      "Access must end in the future. To end access now, expire the subscription instead.",
    );
    const next: SubscriptionState = {
      ...stateOf(current),
      status: "CANCELLED",
      cancelledAt: now,
      expiresAt: accessEndsAt,
    };
    const planKey = await planKeyOf(tx, current.planId);
    const applied = await applySubscriptionChange(tx, {
      organisationId,
      current,
      next,
      eventType: "cancelled",
      auditAction: "billing.subscription.cancelled",
      actor: actorOf(ctx),
      reason: data.reason,
      note: data.note,
      occurredAt: now,
      planKeys: { before: planKey, after: planKey },
    });
    return { organisationId, subscriptionId: applied.subscriptionId, overLimit: [] };
  });
  await notifyEntitlementsChanged(result.organisationId);
  return { subscriptionId: result.subscriptionId, overLimit: result.overLimit };
}

/** Ends a live MANUAL subscription now. The organisation falls back to system defaults. */
export async function expireSubscription(
  ctx: PlatformContext,
  input: unknown,
): Promise<ManualResult> {
  authorise(ctx, "platform.subscription.manage");
  const data = parse(expireSchema, input);
  const now = new Date();
  const result = await inTransaction(async (tx) => {
    const organisationId = await loadOrganisation(tx, data.organisationId);
    const current = await lockManual(tx, organisationId, data.subscriptionId, {
      allowEndedProviderSubscription: true,
    });
    const over = await precheck(tx, organisationId, null, data.acknowledgeOverLimit);
    const planKey = await planKeyOf(tx, current.planId);
    const applied = await applySubscriptionChange(tx, {
      organisationId,
      current,
      next: { ...stateOf(current), status: "EXPIRED", endedAt: now },
      eventType: "expired",
      auditAction: "billing.subscription.expired",
      actor: actorOf(ctx),
      reason: data.reason,
      note: data.note,
      occurredAt: now,
      planKeys: { before: planKey, after: planKey },
      extraAudit: { overLimit: over.map((l) => l.key).join(",") || null },
    });
    return { organisationId, subscriptionId: applied.subscriptionId, overLimit: over };
  });
  await notifyEntitlementsChanged(result.organisationId);
  return { subscriptionId: result.subscriptionId, overLimit: result.overLimit };
}

// --- entitlement overrides ---------------------------------------------------------

interface OverrideValue {
  readonly enabled: boolean;
  readonly limit: bigint | null;
  readonly unlimited: boolean;
  readonly config: Prisma.InputJsonObject | null;
}

/** Safe, short description of a value for the audit trail. */
function describeValue(value: {
  enabled: boolean;
  limit: bigint | null;
  unlimited: boolean;
  config: unknown;
}): string {
  if (!value.enabled) return "disabled";
  if (value.unlimited) return "unlimited";
  if (value.limit !== null) return `limit:${value.limit.toString()}`;
  if (value.config !== null && value.config !== undefined)
    return `config:${JSON.stringify(value.config)}`.slice(0, 200);
  return "enabled";
}

function overrideValue(
  type: "BOOLEAN" | "LIMIT" | "CONFIGURATION",
  data: z.output<typeof setOverrideSchema>,
): OverrideValue {
  const off = { enabled: false, limit: null, unlimited: false, config: null };
  const allowed = {
    BOOLEAN: ["enabled", "disabled"],
    LIMIT: ["limit", "unlimited", "disabled"],
    CONFIGURATION: ["config", "disabled"],
  }[type];
  if (!allowed.includes(data.mode))
    throw fieldError("mode", "That kind of value doesn't fit this feature.");
  switch (data.mode) {
    case "disabled":
      return off;
    case "enabled":
      return { ...off, enabled: true };
    case "unlimited":
      return { ...off, enabled: true, unlimited: true };
    case "limit":
      if (!data.limit) throw fieldError("limit", "Enter a limit.");
      return { ...off, enabled: true, limit: BigInt(data.limit) };
    case "config": {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.config ?? "");
      } catch {
        throw fieldError("config", "Enter a JSON object.");
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
        throw fieldError("config", "Enter a JSON object.");
      return { ...off, enabled: true, config: parsed };
    }
  }
}

/** Creates or replaces an organisation's override for one feature. */
export async function setEntitlementOverride(
  ctx: PlatformContext,
  input: unknown,
): Promise<ManualResult> {
  authorise(ctx, "platform.entitlement_override.manage");
  const data = parse(setOverrideSchema, input);
  assertFuture("expiresAt", data.expiresAt, "The expiry must be in the future.");
  const result = await inTransaction(async (tx) => {
    const organisationId = await loadOrganisation(tx, data.organisationId);
    const feature = await tx.feature.findUnique({
      where: { key: data.featureKey },
      select: { id: true, key: true, type: true },
    });
    if (!feature) throw fieldError("featureKey", "Choose a feature.");
    const value = overrideValue(feature.type, data);
    const overBefore = await overLimitNow(
      tx,
      organisationId,
      await entitlingPlanId(tx, organisationId),
    );
    const existing = await tx.organisationFeatureOverride.findUnique({
      where: { organisationId_featureId: { organisationId, featureId: feature.id } },
    });
    const columns = { ...value, config: value.config ?? Prisma.DbNull };
    const saved = existing
      ? await tx.organisationFeatureOverride.update({
          where: { id: existing.id },
          data: {
            ...columns,
            reason: data.reason,
            expiresAt: data.expiresAt,
            updatedById: ctx.userId,
          },
          select: { id: true },
        })
      : await tx.organisationFeatureOverride.create({
          data: {
            organisationId,
            featureId: feature.id,
            ...columns,
            reason: data.reason,
            expiresAt: data.expiresAt,
            createdById: ctx.userId,
          },
          select: { id: true },
        });
    await recordActorAudit(tx, {
      organisationId,
      actorType: "PLATFORM_STAFF",
      actorId: ctx.userId,
      action: existing ? "billing.override.updated" : "billing.override.created",
      entity: { type: "OrganisationFeatureOverride", id: saved.id },
      metadata: {
        feature: feature.key,
        value: describeValue(value),
        previousValue: existing ? describeValue(existing) : null,
        expiresAt: data.expiresAt?.toISOString() ?? null,
        previousExpiresAt: existing?.expiresAt?.toISOString() ?? null,
        reason: data.reason,
      },
      request: ctx.request,
    });
    return {
      organisationId,
      overLimit: await acknowledgeNewOverLimit(
        tx,
        organisationId,
        overBefore,
        data.acknowledgeOverLimit,
      ),
    };
  });
  await notifyEntitlementsChanged(result.organisationId);
  return { overLimit: result.overLimit };
}

/** Removes an override; the feature falls back to the plan or system default. */
export async function removeEntitlementOverride(
  ctx: PlatformContext,
  input: unknown,
): Promise<ManualResult> {
  authorise(ctx, "platform.entitlement_override.manage");
  const data = parse(removeOverrideSchema, input);
  const result = await inTransaction(async (tx) => {
    const organisationId = await loadOrganisation(tx, data.organisationId);
    const feature = await tx.feature.findUnique({
      where: { key: data.featureKey },
      select: { id: true, key: true },
    });
    if (!feature) throw notFound();
    const existing = await tx.organisationFeatureOverride.findUnique({
      where: { organisationId_featureId: { organisationId, featureId: feature.id } },
    });
    if (!existing) throw notFound();
    const overBefore = await overLimitNow(
      tx,
      organisationId,
      await entitlingPlanId(tx, organisationId),
    );
    await tx.organisationFeatureOverride.delete({
      where: { id: existing.id },
      select: { id: true },
    });
    await recordActorAudit(tx, {
      organisationId,
      actorType: "PLATFORM_STAFF",
      actorId: ctx.userId,
      action: "billing.override.removed",
      entity: { type: "OrganisationFeatureOverride", id: existing.id },
      metadata: {
        feature: feature.key,
        previousValue: describeValue(existing),
        previousExpiresAt: existing.expiresAt?.toISOString() ?? null,
        reason: data.reason,
      },
      request: ctx.request,
    });
    return {
      organisationId,
      overLimit: await acknowledgeNewOverLimit(
        tx,
        organisationId,
        overBefore,
        data.acknowledgeOverLimit,
      ),
    };
  });
  await notifyEntitlementsChanged(result.organisationId);
  return { overLimit: result.overLimit };
}

/** Recomputes gauge counters from source tables (no step-up: it only corrects counts). */
export async function reconcileOrganisationUsage(
  ctx: PlatformContext,
  input: unknown,
): Promise<{ readonly corrected: number }> {
  authorise(ctx, "platform.subscription.manage", false);
  const data = parse(reconcileSchema, input);
  return inTransaction(async (tx) => {
    const organisationId = await loadOrganisation(tx, data.organisationId);
    const drift = await reconcileUsage(tx, organisationId);
    await recordActorAudit(tx, {
      organisationId,
      actorType: "PLATFORM_STAFF",
      actorId: ctx.userId,
      action: "billing.usage.reconciled",
      entity: { type: "Organisation", id: organisationId },
      metadata: {
        drift:
          drift.map((d) => `${d.key}:${d.recorded.toString()}->${d.actual.toString()}`).join(",") ||
          null,
        reason: data.reason,
      },
      request: ctx.request,
    });
    return { corrected: drift.length };
  });
}
