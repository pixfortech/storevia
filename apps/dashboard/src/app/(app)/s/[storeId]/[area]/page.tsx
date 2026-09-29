import { hasPermission } from "@storevia/tenancy";
import { STORE_AREAS, type StoreArea } from "@storevia/tenancy/business-types";
import { Icon } from "@storevia/ui/icons";
import { Illustration } from "@storevia/ui/illustrations";
import { Badge, Card, EmptyState } from "@storevia/ui/surfaces";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessNotice } from "@/components/areas/access-notice";
import { PageHeader } from "@/components/shell/app-shell";
import { NAV_ICONS } from "@/components/shell/icons";
import { AREA_ILLUSTRATION, areaScheduleLabel } from "@/lib/areas/store-areas";
import { storePath } from "@/lib/ids";
import { storeContextOr404 } from "@/lib/tenant";

// Store areas that aren't built (STORE_AREAS availability "planned"). No
// navigation links here (DB-5); the route stays for old links and says
// plainly that the area isn't available: no controls, no dates, and no plan
// upsell (a plan can't unlock something that doesn't exist, AN-6). Each
// still requires its own permission.

function plannedArea(segment: string): StoreArea | undefined {
  return Object.values(STORE_AREAS).find(
    (area) => area.availability === "planned" && area.segment === `/${segment}`,
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ area: string }>;
}): Promise<Metadata> {
  const { area } = await params;
  return { title: plannedArea(area)?.label ?? "Not found" };
}

export default async function AreaPlaceholderPage({
  params,
}: {
  params: Promise<{ storeId: string; area: string }>;
}) {
  const { storeId, area: segment } = await params;
  const area = plannedArea(segment);
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
  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={area.label}
        description={area.description}
        meta={<Badge variant="outline">{areaScheduleLabel(area.availability)}</Badge>}
      />
      <div className="max-w-3xl space-y-4">
        <Card>
          <EmptyState
            illustration={<Illustration name={AREA_ILLUSTRATION[area.key]} />}
            title={`${area.label} isn't available`}
            description={`Storevia doesn't offer ${area.label.toLowerCase()} yet, so there's nothing to set up here for ${ctx.storeName}.`}
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
      </div>
    </>
  );
}
