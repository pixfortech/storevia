import { grantedFeatures, hasPermission } from "@storevia/tenancy";
import {
  BUSINESS_TYPE_DEFINITIONS,
  STORE_AREAS,
  type StoreArea,
} from "@storevia/tenancy/business-types";
import { Alert, Badge, Card, EmptyState, Icon, Illustration } from "@storevia/ui";
import { ArrowRight, Compass, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessNotice } from "@/components/areas/access-notice";
import { PageHeader } from "@/components/shell/app-shell";
import { NAV_ICONS } from "@/components/shell/icons";
import { AREA_ILLUSTRATION, areaScheduleLabel } from "@/lib/areas/store-areas";
import { orgPath, storePath } from "@/lib/ids";
import { storeContextOr404 } from "@/lib/tenant";

// Honest placeholders for store areas delivered in later milestones. They
// render no controls, so nothing looks functional that isn't. Every area is
// reachable whatever the business type (a type only changes emphasis), but
// each still requires its own permission.

function upcomingArea(segment: string): StoreArea | undefined {
  return Object.values(STORE_AREAS).find(
    (area) => area.availability !== undefined && area.segment === `/${segment}`,
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ area: string }>;
}): Promise<Metadata> {
  const { area } = await params;
  return { title: upcomingArea(area)?.label ?? "Not found" };
}

const LINK = "font-medium text-brand-700 underline-offset-2 hover:underline";

export default async function AreaPlaceholderPage({
  params,
}: {
  params: Promise<{ storeId: string; area: string }>;
}) {
  const { storeId, area: segment } = await params;
  const area = upcomingArea(segment);
  if (!area) notFound();
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/${segment}`);
  const AreaIcon = NAV_ICONS[area.key];
  const eyebrow = (
    <span className="inline-flex items-center gap-2">
      <Icon icon={AreaIcon} size="sm" />
      {ctx.storeName}
    </span>
  );
  if (!hasPermission(ctx, area.permission)) {
    return (
      <>
        <PageHeader eyebrow={eyebrow} title={area.label} />
        <AccessNotice title="You don't have access to this area">
          Your role doesn&apos;t include {area.label.toLowerCase()}. Ask an owner or admin if you
          need it.
        </AccessNotice>
      </>
    );
  }
  const granted = await grantedFeatures(ctx);
  const locked = area.feature !== undefined && !granted.has(area.feature);
  const definition = BUSINESS_TYPE_DEFINITIONS[ctx.storeBusinessType];
  const inNavigation = definition.navigation.includes(area.key);
  const schedule = areaScheduleLabel(area.availability);
  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={area.label}
        description={area.description}
        meta={
          <>
            <Badge variant="outline">{schedule}</Badge>
            {locked ? (
              <Badge variant="outline" icon={Lock}>
                Not in your plan
              </Badge>
            ) : null}
          </>
        }
      />
      <div className="max-w-3xl space-y-4">
        <Card>
          <EmptyState
            illustration={<Illustration name={AREA_ILLUSTRATION[area.key]} />}
            title={`${area.label} is coming in ${area.availability ?? "a later release"}`}
            description={`There's nothing to set up here yet. ${area.label} will open in this place for ${ctx.storeName} when it ships.`}
            secondaryAction={
              <Link
                href={storePath(ctx.storeId)}
                className="inline-flex h-10 items-center gap-1.5 rounded-control px-3 text-label font-medium text-brand-700 transition-colors hover:bg-brand-50 pointer-coarse:h-11"
              >
                Back to home
                <Icon icon={ArrowRight} size="sm" />
              </Link>
            }
          />
        </Card>
        {locked ? (
          <Alert tone="info" icon={Lock} title="Not included in your current plan">
            When {area.label.toLowerCase()} ships, it will need a plan that includes it.{" "}
            {hasPermission(ctx, "billing.read") ? (
              <Link href={orgPath(ctx.organisationId, "/billing")} className={LINK}>
                See what your plan includes
              </Link>
            ) : (
              "Your organisation's owner can see what the plan includes."
            )}
          </Alert>
        ) : null}
        {!inNavigation ? (
          <p className="flex items-start gap-2 text-body-sm text-ink-muted">
            <Icon icon={Compass} size="sm" className="mt-0.5 text-ink-faint" />
            <span>
              {area.label} isn&apos;t in the navigation for {definition.label.toLowerCase()} stores,
              but it stays available here.
            </span>
          </p>
        ) : null}
      </div>
    </>
  );
}
