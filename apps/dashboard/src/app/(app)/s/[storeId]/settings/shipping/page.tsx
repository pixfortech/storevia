import { getShippingSettings, type ShippingRateView } from "@storevia/commerce";
import { fromJSON, toDecimalString, type MoneyJson } from "@storevia/commerce/money";
import { getStore, hasPermission } from "@storevia/tenancy";
import { Button } from "@storevia/ui/button";
import { Alert, Badge, Card, CardBody, EmptyState } from "@storevia/ui/surfaces";
import { Lock } from "lucide-react";
import type { Metadata } from "next";
import { AccessNotice } from "@/components/areas/access-notice";
import { SettingsLayout, SettingsSection } from "@/components/areas/settings";
import { LinkTabs } from "@/components/catalogue/link-tabs";
import {
  DeleteRateButton,
  DeleteZoneButton,
  RateDialog,
  ZoneDialog,
  type RateValues,
} from "@/components/settings/shipping-forms";
import { PageHeader } from "@/components/shell/app-shell";
import { formatMoney } from "@/lib/catalogue";
import { COUNTRY_OPTIONS } from "@/lib/options";
import { settingsTabs } from "@/lib/settings-tabs";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Shipping settings" };

const countryName = (code: string) => COUNTRY_OPTIONS.find((c) => c.value === code)?.label ?? code;

const decimal = (value: MoneyJson | null) => (value ? toDecimalString(fromJSON(value)) : "");

const isZero = (value: MoneyJson) => BigInt(value.amount) === 0n;

/** "Orders of ₹999 and over", "Orders up to ₹500", "Orders ₹500 – ₹999", "All orders". */
function rangeText(rate: ShippingRateView): string {
  if (rate.type === "FLAT") return "All orders";
  const { minSubtotal: min, maxSubtotal: max } = rate;
  if (min && max) return `Orders ${formatMoney(min)} – ${formatMoney(max)}`;
  if (min) return `Orders of ${formatMoney(min)} and over`;
  if (max) return `Orders up to ${formatMoney(max)}`;
  return "All orders";
}

export default async function ShippingSettingsPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/settings/shipping`);
  if (!hasPermission(ctx, "settings.manage")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Shipping" />
        <AccessNotice title="You don't have access to shipping settings">
          Your role doesn&apos;t include managing store settings. Ask an owner or admin if you need
          it.
        </AccessNotice>
      </>
    );
  }
  const [zones, store] = await Promise.all([getShippingSettings(ctx), getStore(ctx)]);
  const canEdit = ctx.storeStatus !== "ARCHIVED";
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Store settings"
        description="Where you ship and what shoppers pay for it, in your store's currency."
        actions={canEdit && zones.length > 0 ? <ZoneDialog storeId={storeId} /> : undefined}
      />
      <LinkTabs
        label="Settings sections"
        className="mb-6 lg:mb-8"
        tabs={settingsTabs(ctx.storeId, "shipping")}
      />
      {!canEdit ? (
        <Alert tone="neutral" icon={Lock} className="mb-6 max-w-3xl lg:mb-8">
          This store is archived, so its settings can&apos;t be changed.
        </Alert>
      ) : null}
      {zones.length === 0 ? (
        <Card className="max-w-3xl">
          <EmptyState
            titleAs="h2"
            title="No shipping zones yet"
            description="Add a zone for the countries you ship to, then give it at least one rate. Shoppers outside every zone can't be offered shipping."
            action={canEdit ? <ZoneDialog storeId={storeId} /> : undefined}
          />
        </Card>
      ) : (
        <SettingsLayout sections={zones.map((z) => ({ id: `zone-${z.id}`, label: z.name }))}>
          {zones.map((zone) => {
            const regions = zone.countries[0]?.regionCodes ?? [];
            const zoneValues = {
              id: zone.id,
              name: zone.name,
              countries: zone.countries.map((c) => c.countryCode).join(", "),
              regions: regions.join(", "),
            };
            return (
              <SettingsSection
                key={zone.id}
                id={`zone-${zone.id}`}
                title={zone.name}
                description={
                  <>
                    {zone.countries.map((c) => countryName(c.countryCode)).join(", ")}
                    {regions.length > 0 ? (
                      <span className="block">Regions: {regions.join(", ")}</span>
                    ) : null}
                  </>
                }
                actions={
                  canEdit ? (
                    <>
                      <ZoneDialog
                        storeId={storeId}
                        zone={zoneValues}
                        trigger={
                          <Button size="sm" variant="secondary">
                            Edit zone<span className="sr-only"> {zone.name}</span>
                          </Button>
                        }
                      />
                      <DeleteZoneButton storeId={storeId} zoneId={zone.id} zoneName={zone.name} />
                    </>
                  ) : undefined
                }
              >
                {zone.rates.length === 0 ? (
                  <CardBody className="text-body-sm text-ink-muted">
                    No rates yet. Shoppers in this zone can&apos;t be offered shipping until you add
                    one.
                  </CardBody>
                ) : (
                  <ul className="divide-y divide-line" aria-label={`Rates for ${zone.name}`}>
                    {zone.rates.map((rate) => {
                      const values: RateValues = {
                        id: rate.id,
                        name: rate.name,
                        type: rate.type,
                        amount: decimal(rate.amount),
                        minSubtotal: decimal(rate.minSubtotal),
                        maxSubtotal: decimal(rate.maxSubtotal),
                        active: rate.active,
                      };
                      return (
                        <li
                          key={rate.id}
                          data-testid="shipping-rate-row"
                          className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                        >
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                              <span className="min-w-0 break-words">{rate.name}</span>
                              <Badge size="sm" variant="outline">
                                {rate.type === "FLAT" ? "Flat rate" : "By order subtotal"}
                              </Badge>
                              {!rate.active ? (
                                <Badge size="sm" tone="warning" variant="dot">
                                  Inactive
                                </Badge>
                              ) : null}
                            </p>
                            <p className="mt-0.5 text-caption text-ink-muted">
                              <span className="font-medium text-ink tabular-nums">
                                {isZero(rate.amount) ? "Free" : formatMoney(rate.amount)}
                              </span>
                              {" · "}
                              {rangeText(rate)}
                            </p>
                          </div>
                          {canEdit ? (
                            <div className="flex shrink-0 gap-2">
                              <RateDialog
                                storeId={storeId}
                                zoneId={zone.id}
                                zoneName={zone.name}
                                currency={store.currency}
                                rate={values}
                                trigger={
                                  <Button size="sm" variant="secondary">
                                    Edit<span className="sr-only"> {rate.name}</span>
                                  </Button>
                                }
                              />
                              <DeleteRateButton
                                storeId={storeId}
                                rateId={rate.id}
                                rateName={rate.name}
                              />
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {canEdit ? (
                  <div className="border-t border-line px-5 py-3.5 sm:px-6">
                    <RateDialog
                      storeId={storeId}
                      zoneId={zone.id}
                      zoneName={zone.name}
                      currency={store.currency}
                    />
                  </div>
                ) : null}
              </SettingsSection>
            );
          })}
        </SettingsLayout>
      )}
    </>
  );
}
