import {
  getOrganisationBilling,
  getStore,
  grantedFeatures,
  hasPermission,
  listMembers,
  listRecentActivity,
  organisationOf,
  ROLE_LABELS,
} from "@storevia/tenancy";
import { BUSINESS_TYPE_DEFINITIONS } from "@storevia/tenancy/business-types";
import { Alert, Badge, GlyphTile } from "@storevia/ui";
import { FlaskConical } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DashboardGrid } from "@/components/dashboard/dashboard-grid";
import { DashboardWidget } from "@/components/dashboard/dashboard-widget";
import { TrackingCard } from "@/components/dashboard/data-widgets";
import { PeriodPicker } from "@/components/dashboard/period-picker";
import type { DashboardScope, LiveData } from "@/components/dashboard/types";
import { PageHeader } from "@/components/shell/app-shell";
import { planIndicator } from "@/components/shell/plan";
import { BUSINESS_TYPE_GLYPH } from "@/lib/business-types";
import { describeActivity } from "@/lib/dashboard/activity";
import { composeDashboard, focusAreas, hasPeriodData } from "@/lib/dashboard/compose";
import { arrangeDashboard } from "@/lib/dashboard/layout";
import {
  DASHBOARD_PERIODS,
  isExamplePreview,
  parsePeriod,
  type DashboardPeriod,
} from "@/lib/dashboard/preview";
import { greeting, setupTasks, storeStatusBadge } from "@/lib/dashboard/setup";
import { roleSummary, trialNote } from "@/lib/dashboard/summaries";
import type { WidgetKey } from "@/lib/dashboard/widgets";
import { orgPath, storePath } from "@/lib/ids";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Home" };

/**
 * The store home (brief §10–12): a widget composition shared by every
 * business type (lib/dashboard). Business type picks and words the widgets,
 * RBAC decides which exist (and which data is loaded at all), and the plan
 * decides which are locked. Widgets with no data (domains Storevia doesn't
 * collect yet, plan-locked features) are summarised in one "What you'll
 * track" strip rather than drawn as empty frames; ?preview=example draws
 * badged example data in development.
 */
export default async function StoreHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { storeId } = await params;
  const query = await searchParams;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}`);
  const preview = isExamplePreview(process.env, query["preview"]);
  const period = parsePeriod(query["range"]);

  const granted = await grantedFeatures(ctx);
  const dashboard = composeDashboard({
    businessType: ctx.storeBusinessType,
    permissions: ctx.permissions,
    grantedFeatures: granted,
  });
  const shows = (key: WidgetKey) => dashboard.widgets.some((w) => w.key === key);
  // Load only what a visible widget needs; each read enforces its own permission.
  const needsMembers =
    hasPermission(ctx, "member.read") && (shows("team") || hasPermission(ctx, "member.manage"));
  const [store, billing, members, activity] = await Promise.all([
    getStore(ctx),
    shows("plan-usage") ? getOrganisationBilling(ctx) : null,
    needsMembers ? listMembers(organisationOf(ctx)) : null,
    shows("activity") ? listRecentActivity(ctx, { limit: 5 }) : null,
  ]);

  const definition = BUSINESS_TYPE_DEFINITIONS[store.businessType];
  const now = new Date();
  const active = members?.filter((m) => m.status === "ACTIVE") ?? null;
  const billingHref = hasPermission(ctx, "billing.read")
    ? orgPath(ctx.organisationId, "/billing")
    : null;

  const scope: DashboardScope = {
    businessType: store.businessType,
    preview,
    period,
    today: now,
    format: { currency: store.currency, locale: store.locale },
    billingHref,
  };

  const plan = billing ? planIndicator(billing, orgPath(ctx.organisationId, "/billing")) : null;
  const note = billing ? trialNote(billing.subscription, store.timezone) : undefined;
  const live: LiveData = {
    setup: setupTasks({
      storeId: ctx.storeId,
      organisationId: ctx.organisationId,
      storeName: store.name,
      businessType: store.businessType,
      permissions: ctx.permissions,
      memberCount: active?.length ?? null,
    }),
    website: {
      hostname: store.primaryHostname,
      currency: store.currency,
      locale: store.locale,
      timezone: store.timezone,
      settingsHref: storePath(ctx.storeId, "/settings"),
    },
    plan:
      billing && plan
        ? {
            name: plan.name,
            ...(plan.status ? { status: plan.status } : {}),
            ...(note ? { note } : {}),
            usage: billing.usage.map((line) => ({
              key: line.key,
              label: line.name,
              used: Number(line.usage),
              limit: line.limit === "unlimited" ? "unlimited" : Number(line.limit),
            })),
            href: plan.href,
          }
        : null,
    team:
      active && shows("team")
        ? {
            organisationName: ctx.organisationName,
            people: active.map((m) => ({ name: m.name })),
            roles: roleSummary(active.map((m) => m.role)),
            href: orgPath(ctx.organisationId, "/members"),
            inviteHref: hasPermission(ctx, "member.manage")
              ? orgPath(ctx.organisationId, "/members#invite")
              : null,
          }
        : null,
    activity:
      activity?.map((entry) => describeActivity(entry, { now, timeZone: store.timezone })) ?? null,
    focus: focusAreas(store.businessType, ctx.permissions, granted).map((item) => ({
      ...item,
      href: storePath(ctx.storeId, item.area.segment),
    })),
  };

  const layout = arrangeDashboard(dashboard.widgets, preview);
  const status = storeStatusBadge(store.status);
  const home = storePath(ctx.storeId);
  const periodHrefs = Object.fromEntries(
    DASHBOARD_PERIODS.map((p) => [
      p,
      `${home}?${new URLSearchParams({ preview: "example", range: p }).toString()}`,
    ]),
  ) as Record<DashboardPeriod, string>;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <GlyphTile name={BUSINESS_TYPE_GLYPH[store.businessType]} size="sm" />
            {definition.label}
          </span>
        }
        title={store.name}
        meta={
          <Badge variant="dot" tone={status.tone}>
            {status.label}
          </Badge>
        }
        description={`${greeting(ctx.principal.name)} You're signed in as ${ROLE_LABELS[ctx.role]}.`}
        // The period control appears only when a chart has data to scope. The
        // page's create action lives in the shell's top bar (phones: Create).
        actions={
          hasPeriodData(dashboard.widgets, preview) ? (
            <PeriodPicker value={period} hrefs={periodHrefs} />
          ) : undefined
        }
      />

      {query["welcome"] === "1" ? (
        <Alert tone="success" title="Your store is ready" className="mb-6">
          It isn&apos;t visible to visitors yet: the storefront and site builder arrive in upcoming
          milestones.
        </Alert>
      ) : null}

      {preview ? (
        <Alert
          tone="neutral"
          icon={FlaskConical}
          title="Previewing example data — development only"
          className="mb-6"
          actions={
            <Link
              href={home}
              className="inline-flex items-center text-label font-medium text-brand-700 hover:underline max-lg:min-h-11 pointer-coarse:min-h-11"
            >
              Show this store&apos;s real state
            </Link>
          }
        >
          Figures marked Example data are generated for design review. They describe no real
          business, and deployed environments never show them.
        </Alert>
      ) : null}

      <DashboardGrid
        layout={layout}
        density={dashboard.density}
        render={(widget) => <DashboardWidget widget={widget} scope={scope} live={live} />}
        tracking={<TrackingCard groups={layout.tracking} billingHref={billingHref} />}
      />
    </>
  );
}
