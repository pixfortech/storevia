import "server-only";
import { platformDb } from "@storevia/database/platform";
import {
  getUsageSummary,
  loadEntitlements,
  type EntitlementSet,
  type UsageLine,
} from "@storevia/entitlements";
import { parsePublicId } from "@storevia/tenancy";
import { requirePlatformPermission, type PlatformContext } from "@storevia/tenancy/platform";
import { notFound } from "@storevia/types";
import { enabledProviderKeys, isMockBillingEnabled } from "./registry";

// Read models for the platform-admin app (docs 05 §5). Staff-only: every
// function requires platform.organisation.read.

export interface OrganisationListItem {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly planName: string | null;
  readonly subscriptionStatus: string | null;
  readonly source: string | null;
}

export async function listOrganisationsForAdmin(
  ctx: PlatformContext,
  options: { readonly query?: string; readonly take?: number } = {},
): Promise<OrganisationListItem[]> {
  requirePlatformPermission(ctx, "platform.organisation.read");
  const query = options.query?.trim().slice(0, 100);
  const rows = await platformDb().organisation.findMany({
    where: {
      status: { not: "DELETED" },
      ...(query ? { name: { contains: query, mode: "insensitive" as const } } : {}),
    },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      subscriptions: {
        where: { status: { not: "EXPIRED" } },
        select: { status: true, source: true, plan: { select: { name: true } } },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(options.take ?? 50, 200),
  });
  return rows.map((row) => {
    const sub = row.subscriptions[0];
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      createdAt: row.createdAt,
      planName: sub?.plan.name ?? null,
      subscriptionStatus: sub?.status ?? null,
      source: sub?.source ?? null,
    };
  });
}

export interface AdminPlan {
  readonly key: string;
  readonly name: string;
  readonly status: string;
  readonly trialDays: number;
}

export interface AdminFeature {
  readonly key: string;
  readonly name: string;
  readonly type: "BOOLEAN" | "LIMIT" | "CONFIGURATION";
}

export interface AdminSubscription {
  readonly id: string;
  readonly status: string;
  readonly source: string;
  readonly provider: string | null;
  readonly providerSubscriptionId: string | null;
  readonly planKey: string;
  readonly planName: string;
  readonly billingInterval: string | null;
  readonly startedAt: Date;
  readonly trialStartsAt: Date | null;
  readonly trialEndsAt: Date | null;
  readonly currentPeriodStart: Date | null;
  readonly currentPeriodEnd: Date | null;
  readonly expiresAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly pastDueSince: Date | null;
  readonly graceEndsAt: Date | null;
  readonly endedAt: Date | null;
  readonly providerSyncedAt: Date | null;
}

export interface AdminSubscriptionEvent {
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly fromPlanName: string | null;
  readonly toPlanName: string | null;
  readonly actorType: string;
  readonly actorName: string | null;
  readonly reason: string | null;
  readonly note: string | null;
  readonly providerEventId: string | null;
  readonly occurredAt: Date;
}

export interface AdminOverride {
  readonly featureKey: string;
  readonly featureName: string;
  readonly enabled: boolean;
  readonly limit: bigint | null;
  readonly unlimited: boolean;
  readonly config: unknown;
  readonly reason: string;
  readonly expiresAt: Date | null;
  readonly createdByName: string | null;
  readonly updatedByName: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AdminWebhookEvent {
  readonly providerEventId: string;
  readonly type: string;
  readonly status: string;
  readonly outcome: string | null;
  readonly attempts: number;
  readonly receivedAt: Date;
}

export interface OrganisationBillingDetail {
  readonly organisation: {
    readonly id: string;
    readonly name: string;
    readonly status: string;
    readonly createdAt: Date;
    readonly ownerEmail: string | null;
    readonly storeCount: number;
    readonly memberCount: number;
  };
  readonly subscription: AdminSubscription | null;
  readonly history: readonly AdminSubscription[];
  readonly entitlements: EntitlementSet;
  readonly usage: readonly UsageLine[];
  readonly overrides: readonly AdminOverride[];
  readonly events: readonly AdminSubscriptionEvent[];
  readonly webhookEvents: readonly AdminWebhookEvent[];
  readonly plans: readonly AdminPlan[];
  readonly features: readonly AdminFeature[];
  readonly mockBillingEnabled: boolean;
  readonly enabledProviders: readonly string[];
}

const subscriptionSelect = {
  id: true,
  status: true,
  source: true,
  provider: true,
  providerSubscriptionId: true,
  billingInterval: true,
  startedAt: true,
  trialStartsAt: true,
  trialEndsAt: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  expiresAt: true,
  cancelledAt: true,
  pastDueSince: true,
  graceEndsAt: true,
  endedAt: true,
  providerSyncedAt: true,
  plan: { select: { key: true, name: true } },
} as const;

export async function getOrganisationBillingDetail(
  ctx: PlatformContext,
  organisationPublicId: unknown,
): Promise<OrganisationBillingDetail> {
  requirePlatformPermission(ctx, "platform.organisation.read");
  const organisationId = parsePublicId("organisation", organisationPublicId);
  const db = platformDb();
  const org = await db.organisation.findUnique({
    where: { id: organisationId },
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      _count: { select: { memberships: true, stores: { where: { status: { not: "ARCHIVED" } } } } },
      memberships: {
        where: { role: "OWNER" },
        select: { user: { select: { email: true } } },
        take: 1,
      },
    },
  });
  if (!org || org.status === "DELETED") throw notFound();

  const entitlements = await loadEntitlements(db, organisationId);
  const usage = await getUsageSummary(db, organisationId, entitlements);
  const subscriptions = await db.subscription.findMany({
    where: { organisationId },
    select: subscriptionSelect,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const toAdmin = (s: (typeof subscriptions)[number]): AdminSubscription => {
    const { plan, ...rest } = s;
    return { ...rest, planKey: plan.key, planName: plan.name };
  };
  const live = subscriptions.find((s) => s.status !== "EXPIRED");

  const plans = await db.plan.findMany({
    select: { id: true, key: true, name: true, status: true, trialDays: true },
    orderBy: { sortOrder: "asc" },
  });
  const planNames = new Map(plans.map((p) => [p.id, p.name]));
  const features = await db.feature.findMany({
    select: { id: true, key: true, name: true, type: true },
    orderBy: { sortOrder: "asc" },
  });
  const featureById = new Map(features.map((f) => [f.id, f]));

  const overrideRows = await db.organisationFeatureOverride.findMany({
    where: { organisationId },
    orderBy: { createdAt: "asc" },
  });
  const events = await db.subscriptionEvent.findMany({
    where: { organisationId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  const actorIds = [
    ...new Set(
      [
        ...events.map((e) => e.actorId),
        ...overrideRows.flatMap((o) => [o.createdById, o.updatedById]),
      ].filter((id): id is string => id !== null),
    ),
  ];
  const actors = new Map(
    (
      await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    ).map((u) => [u.id, u.name]),
  );
  const webhookEvents = await db.billingWebhookEvent.findMany({
    where: { organisationId },
    orderBy: { receivedAt: "desc" },
    take: 25,
    select: {
      providerEventId: true,
      type: true,
      status: true,
      outcome: true,
      attempts: true,
      receivedAt: true,
    },
  });

  return {
    organisation: {
      id: org.id,
      name: org.name,
      status: org.status,
      createdAt: org.createdAt,
      ownerEmail: org.memberships[0]?.user.email ?? null,
      storeCount: org._count.stores,
      memberCount: org._count.memberships,
    },
    subscription: live ? toAdmin(live) : null,
    history: subscriptions.map(toAdmin),
    entitlements,
    usage,
    overrides: overrideRows.map((o) => ({
      featureKey: featureById.get(o.featureId)?.key ?? "unknown",
      featureName: featureById.get(o.featureId)?.name ?? "Unknown feature",
      enabled: o.enabled,
      limit: o.limit,
      unlimited: o.unlimited,
      config: o.config,
      reason: o.reason,
      expiresAt: o.expiresAt,
      createdByName: o.createdById ? (actors.get(o.createdById) ?? null) : null,
      updatedByName: o.updatedById ? (actors.get(o.updatedById) ?? null) : null,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    })),
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      source: e.source,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      fromPlanName: e.fromPlanId ? (planNames.get(e.fromPlanId) ?? null) : null,
      toPlanName: e.toPlanId ? (planNames.get(e.toPlanId) ?? null) : null,
      actorType: e.actorType,
      actorName: e.actorId ? (actors.get(e.actorId) ?? null) : null,
      reason: e.reason,
      note: e.note,
      providerEventId: e.providerEventId,
      occurredAt: e.occurredAt,
    })),
    webhookEvents,
    plans: plans.map(({ key, name, status, trialDays }) => ({ key, name, status, trialDays })),
    features: features.map(({ key, name, type }) => ({ key, name, type })),
    mockBillingEnabled: isMockBillingEnabled(),
    enabledProviders: enabledProviderKeys(),
  };
}
