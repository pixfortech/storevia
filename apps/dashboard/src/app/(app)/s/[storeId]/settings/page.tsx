import { getOnlineStore, getStore, hasPermission, storefrontRootDomain } from "@storevia/tenancy";
import { buttonClasses } from "@storevia/ui/button";
import { CardBody } from "@storevia/ui/surfaces";
import { Alert, Badge } from "@storevia/ui/surfaces";
import { ExternalLink, Lock } from "lucide-react";
import type { Metadata } from "next";
import {
  DangerRow,
  DangerZone,
  SettingsLayout,
  SettingsSection,
  type SettingsSectionLink,
} from "@/components/areas/settings";
import { PageHeader } from "@/components/shell/app-shell";
import { formatLongDate } from "@/lib/areas/dates";
import { storeStatusBadge } from "@/lib/dashboard/setup";
import { COUNTRY_OPTIONS, CURRENCY_OPTIONS } from "@/lib/options";
import { storeContextOr404 } from "@/lib/tenant";
import {
  ArchiveStoreForm,
  BusinessTypeForm,
  StoreAddressForm,
  StoreSettingsForm,
  StorefrontStatusForm,
} from "./settings-forms";

export const metadata: Metadata = { title: "Store settings" };

const labelFor = (options: readonly { value: string; label: string }[], value: string) =>
  options.find((o) => o.value === value)?.label ?? value;

export default async function StoreSettingsPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/settings`);
  const [store, online] = await Promise.all([getStore(ctx), getOnlineStore(ctx)]);
  const archived = store.status === "ARCHIVED";
  const canEdit = hasPermission(ctx, "store.update") && !archived;
  const canArchive = hasPermission(ctx, "store.archive") && !archived;
  const status = storeStatusBadge(store.status);
  const live = online.status === "ACTIVE";
  const canPublish = hasPermission(ctx, "store.update") && (live || online.status === "DRAFT");
  const canPreview = hasPermission(ctx, "design.edit") && online.url !== null;
  const canChangeAddress =
    hasPermission(ctx, "domain.manage") && !archived && online.status !== "SUSPENDED";
  const sections: SettingsSectionLink[] = [
    { id: "general", label: "General" },
    { id: "storefront", label: "Storefront" },
    // The shell and the store home link to #business-type.
    { id: "business-type", label: "Business type" },
    ...(canArchive ? [{ id: "danger-zone", label: "Danger zone", danger: true }] : []),
  ];
  return (
    <>
      <PageHeader
        eyebrow={store.name}
        title="Store settings"
        description={store.primaryHostname ?? undefined}
        meta={
          <Badge variant="dot" tone={status.tone}>
            {status.label}
          </Badge>
        }
      />
      {!canEdit ? (
        <Alert tone="neutral" icon={Lock} className="mb-6 max-w-3xl lg:mb-8">
          {archived
            ? "This store is archived, so its settings can't be changed."
            : "You can view these settings but not change them."}
        </Alert>
      ) : null}
      <SettingsLayout sections={sections}>
        <SettingsSection
          id="general"
          title="General"
          description="Your store's name, contact addresses and region."
        >
          <StoreSettingsForm
            storeId={storeId}
            canEdit={canEdit}
            values={{
              name: store.name,
              locale: store.locale,
              timezone: store.timezone,
              contactEmail: store.contactEmail ?? "",
              supportEmail: store.supportEmail ?? "",
            }}
            fixed={[
              { term: "Web address", detail: store.primaryHostname ?? "No address yet" },
              { term: "Currency", detail: labelFor(CURRENCY_OPTIONS, store.currency) },
              { term: "Country", detail: labelFor(COUNTRY_OPTIONS, store.country) },
              { term: "Created", detail: formatLongDate(store.createdAt, store.timezone) },
            ]}
          />
        </SettingsSection>

        <SettingsSection
          id="storefront"
          title="Storefront"
          description="Where shoppers find your store, and whether it's open to them."
        >
          <CardBody className="space-y-4 py-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="dot" tone={live ? "success" : "neutral"}>
                {live ? "Live" : online.status === "DRAFT" ? "Coming soon" : "Unavailable"}
              </Badge>
              {online.url ? (
                <a
                  href={online.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-body-sm font-medium text-brand-700 underline-offset-2 hover:underline"
                >
                  {online.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              ) : null}
            </div>
            <p className="text-body-sm text-ink-muted">
              {live
                ? "Shoppers can browse your products and add them to a cart."
                : online.status === "DRAFT"
                  ? "Shoppers see a coming-soon page. Preview your store, then go live when you're ready."
                  : "Your storefront is unavailable. Contact Storevia support for help."}
            </p>
            {online.redirectingHosts.length > 0 ? (
              <p className="text-body-sm text-ink-muted">
                Also redirects from: {online.redirectingHosts.join(", ")}
              </p>
            ) : null}
            {canPreview ? (
              <a
                href={`/s/${storeId}/preview`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses("secondary", "sm")}
              >
                Preview storefront
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : null}
          </CardBody>
          <StorefrontStatusForm storeId={storeId} live={live} canEdit={canPublish} />
        </SettingsSection>

        {canChangeAddress ? (
          <SettingsSection
            id="store-address"
            title="Store address"
            description="Change the web address your store is served at."
          >
            <StoreAddressForm
              storeId={storeId}
              slug={online.slug}
              rootDomain={storefrontRootDomain()}
            />
          </SettingsSection>
        ) : null}

        <SettingsSection
          id="business-type"
          title="Business type"
          description="Shapes this store's navigation, home and suggested team roles. Your content, plan and permissions stay the same."
        >
          <BusinessTypeForm storeId={storeId} current={store.businessType} canEdit={canEdit} />
        </SettingsSection>

        {canArchive ? (
          <DangerZone>
            <DangerRow
              title="Archive store"
              description="Archived stores are hidden from your store list. Their data is kept."
              action={<ArchiveStoreForm storeId={storeId} storeName={store.name} />}
            />
          </DangerZone>
        ) : null}
      </SettingsLayout>
    </>
  );
}
