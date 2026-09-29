import { getCatalogueOverview, storeCustomerSummary, storeSalesSummary } from "@storevia/commerce";
import { listPages } from "@storevia/site-admin";
import { isByteFeature } from "@storevia/entitlements/format";
import {
  getOrganisationBilling,
  getStore,
  grantedFeatures,
  hasPermission,
  launchReadiness,
  listMembers,
  listRecentActivity,
  organisationOf,
  ROLE_LABELS,
} from "@storevia/tenancy";
import { BUSINESS_TYPE_DEFINITIONS } from "@storevia/tenancy/business-types";
import { GlyphTile } from "@storevia/ui/icons";
import { Alert, Badge } from "@storevia/ui/surfaces";
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
import { describeActivity, relativeTime } from "@/lib/dashboard/activity";
import { inventoryPath, productPath, productsPath } from "@/lib/catalogue";
import {
  composeDashboard,
  focusAreas,
  hasPeriodData,
  widgetDisplay,
} from "@/lib/dashboard/compose";
import { arrangeDashboard } from "@/lib/dashboard/layout";
import {
  DASHBOARD_PERIODS,
  isExamplePreview,
  parsePeriod,
  PERIOD_DAYS,
  type DashboardPeriod,
} from "@/lib/dashboard/preview";
import { greeting, setupTasks, storeStatusBadge } from "@/lib/dashboard/setup";
import { roleSummary, trialNote } from "@/lib/dashboard/summaries";
import type { WidgetKey } from "@/lib/dashboard/widgets";
import { orgPath, storePath } from "@/lib/ids";
import { builderPath, pagesPath } from "@/lib/site";
import { launchCheckHref, storeLaunchChecks } from "@/lib/launch-readiness";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Home" };

/**
 * The store home (brief §10–12): a widget composition shared by every
 * business type (lib/dashboard). Business type picks and words the widgets,
 * RBAC decides which exist (and which data is loaded at all), and the plan
 * decides which are locked. Order and customer figures are real, for the
 * period in ?range= (zeros before the first order). Widgets with no data
 * (domains Storevia doesn't collect yet, plan-locked features) are
 * summarised in one "What you'll track" strip rather than drawn as empty
 * frames; ?preview=example draws badged example data in development.
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
  // Real figures, for widgets that draw them (a preview draws example data).
  const showsLive = (key: WidgetKey) =>
    dashboard.widgets.some((w) => w.key === key && widgetDisplay(w, preview) === "live");
  const needsSales = (["revenue", "orders", "sales-trend", "top-products"] as const).some(
    showsLive,
  );
  const days = PERIOD_DAYS[period];
  // Load only what a visible widget needs; each read enforces its own permission.
  const needsMembers =
    hasPermission(ctx, "member.read") && (shows("team") || hasPermission(ctx, "member.manage"));
  const [store, billing, members, activity, overview, pages, sales, customers, launch] =
    await Promise.all([
      getStore(ctx),
      shows("plan-usage") ? getOrganisationBilling(ctx) : null,
      needsMembers ? listMembers(organisationOf(ctx)) : null,
      shows("activity") ? listRecentActivity(ctx, { limit: 5 }) : null,
      shows("catalogue") || shows("stock-alerts") ? getCatalogueOverview(ctx) : null,
      shows("content-updates") ? listPages(ctx) : null,
      needsSales ? storeSalesSummary(ctx, { days }) : null,
      showsLive("customers") ? storeCustomerSummary(ctx, { days }) : null,
      shows("setup") ? launchReadiness(ctx, storeLaunchChecks(ctx.storeId)) : null,
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
      launch:
        launch && (store.status === "DRAFT" || store.status === "ACTIVE")
          ? {
              live: store.status === "ACTIVE",
              checks: launch.map((c) => ({ ...c, href: launchCheckHref(ctx.storeId, c.key) })),
            }
          : null,
    }),
    website: {
      live: store.status === "ACTIVE",
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
              ...(isByteFeature(line.key) ? { bytes: true } : {}),
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
    catalogue: overview
      ? {
          products: overview.products,
          lowStockVariants: overview.lowStockVariants,
          outOfStockVariants: overview.outOfStockVariants,
          lowStockThreshold: overview.lowStockThreshold,
          recentlyUpdated: overview.recentlyUpdated.map((p) => ({
            title: p.title,
            status: p.status,
            href: productPath(ctx.storeId, p.id),
            when: relativeTime(p.updatedAt, now),
          })),
          lowStock: overview.lowStock.map((l) => ({
            label:
              l.variantTitle === "Default"
                ? l.productTitle
                : `${l.productTitle} · ${l.variantTitle}`,
            available: l.available,
            href: productPath(ctx.storeId, l.productId),
          })),
          productsHref: productsPath(ctx.storeId),
          newProductHref: hasPermission(ctx, "product.create")
            ? productsPath(ctx.storeId, "/new")
            : null,
          inventoryHref: inventoryPath(ctx.storeId),
        }
      : null,
    content: pages
      ? {
          recentlyUpdated: [...pages]
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(0, 5)
            .map((p) => ({
              title: p.title,
              status: p.status,
              href: builderPath(ctx.storeId, p.id),
              when: relativeTime(p.updatedAt, now),
            })),
          pagesHref: pagesPath(ctx.storeId),
        }
      : null,
    sales: sales ? { figures: sales, ordersHref: storePath(ctx.storeId, "/orders") } : null,
    customers: customers
      ? { figures: customers, customersHref: storePath(ctx.storeId, "/customers") }
      : null,
    focus: focusAreas(store.businessType, ctx.permissions, granted).map((item) => ({
      ...item,
      href: storePath(ctx.storeId, item.area.segment),
    })),
  };

  const layout = arrangeDashboard(dashboard.widgets, preview);
  const status = storeStatusBadge(store.status);
  const home = storePath(ctx.storeId);
  // A preview's period links stay in the preview.
  const periodHrefs = Object.fromEntries(
    DASHBOARD_PERIODS.map((p) => [
      p,
      `${home}?${new URLSearchParams(preview ? { preview: "example", range: p } : { range: p }).toString()}`,
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
          It isn&apos;t visible to visitors yet. Add products and design your site, then go live
          from Settings when you&apos;re ready.
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
