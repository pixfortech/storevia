import { getTaxSettings, type TaxRateView } from "@storevia/commerce";
import { getStore, hasPermission } from "@storevia/tenancy";
import { Button } from "@storevia/ui/button";
import { DataList, type DataColumn } from "@storevia/ui/data";
import { Alert, CardBody } from "@storevia/ui/surfaces";
import { Info, Lock } from "lucide-react";
import type { Metadata } from "next";
import { AccessNotice } from "@/components/areas/access-notice";
import { SettingsLayout, SettingsSection } from "@/components/areas/settings";
import { LinkTabs } from "@/components/catalogue/link-tabs";
import {
  DeleteTaxRateButton,
  TaxOptionsForm,
  TaxRateDialog,
} from "@/components/settings/tax-forms";
import { PageHeader } from "@/components/shell/app-shell";
import { COUNTRY_OPTIONS } from "@/lib/options";
import { settingsTabs } from "@/lib/settings-tabs";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Tax settings" };

const COUNTRIES = COUNTRY_OPTIONS.map((c) => ({ value: c.value, label: c.label }));
const countryName = (code: string) => COUNTRIES.find((c) => c.value === code)?.label ?? code;

export default async function TaxSettingsPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/settings/tax`);
  if (!hasPermission(ctx, "settings.manage")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Tax" />
        <AccessNotice title="You don't have access to tax settings">
          Your role doesn&apos;t include managing store settings. Ask an owner or admin if you need
          it.
        </AccessNotice>
      </>
    );
  }
  const [tax, store] = await Promise.all([getTaxSettings(ctx), getStore(ctx)]);
  const canEdit = ctx.storeStatus !== "ARCHIVED";
  const columns: DataColumn<TaxRateView>[] = [
    {
      key: "name",
      header: "Name",
      primary: true,
      cell: (r) => <span className="font-medium break-words text-ink">{r.name}</span>,
    },
    { key: "country", header: "Country", cell: (r) => countryName(r.countryCode) },
    { key: "region", header: "Region", cell: (r) => r.regionCode ?? "Whole country" },
    {
      key: "rate",
      header: "Rate",
      align: "end",
      cell: (r) => <span className="tabular-nums">{r.rate}%</span>,
    },
    ...(canEdit
      ? [
          {
            key: "actions",
            header: "Actions",
            align: "end" as const,
            cell: (r: TaxRateView) => (
              <div className="flex justify-end gap-2">
                <TaxRateDialog
                  storeId={storeId}
                  countries={COUNTRIES}
                  defaultCountry={store.country}
                  rate={{
                    id: r.id,
                    name: r.name,
                    countryCode: r.countryCode,
                    regionCode: r.regionCode ?? "",
                    rate: r.rate,
                  }}
                  trigger={
                    <Button size="sm" variant="secondary">
                      Edit<span className="sr-only"> {r.name}</span>
                    </Button>
                  }
                />
                <DeleteTaxRateButton storeId={storeId} rateId={r.id} rateName={r.name} />
              </div>
            ),
          },
        ]
      : []),
  ];
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Store settings"
        description="The tax your store charges at checkout."
      />
      <LinkTabs
        label="Settings sections"
        className="mb-6 lg:mb-8"
        tabs={settingsTabs(ctx.storeId, "tax")}
      />
      {!canEdit ? (
        <Alert tone="neutral" icon={Lock} className="mb-6 max-w-3xl lg:mb-8">
          This store is archived, so its settings can&apos;t be changed.
        </Alert>
      ) : null}
      <SettingsLayout
        sections={[
          { id: "tax-options", label: "Tax options" },
          { id: "tax-rates", label: "Tax rates" },
        ]}
      >
        <Alert tone="info" icon={Info} title="Manual rates only">
          Storevia charges exactly the rates you enter here. It doesn&apos;t calculate tax
          automatically, look up rates for you or file returns, so check the rates that apply to
          your business with your tax adviser.
        </Alert>
        <SettingsSection
          id="tax-options"
          title="Tax options"
          description="How your prices and shipping are taxed."
        >
          <TaxOptionsForm
            storeId={storeId}
            canEdit={canEdit}
            values={{
              pricesIncludeTax: tax.pricesIncludeTax,
              chargeTaxOnShipping: tax.chargeTaxOnShipping,
              taxRegistrationId: tax.taxRegistrationId ?? "",
            }}
          />
        </SettingsSection>
        <SettingsSection
          id="tax-rates"
          title="Tax rates"
          description="Charged by the shipping address. A country-wide rate and a region's rate both apply to addresses in that region; they're added together, never compounded."
          actions={
            canEdit ? (
              <TaxRateDialog
                storeId={storeId}
                countries={COUNTRIES}
                defaultCountry={store.country}
              />
            ) : undefined
          }
        >
          <DataList
            rows={tax.rates}
            columns={columns}
            rowKey={(r) => r.id}
            rowTestId="tax-rate-row"
            caption="Tax rates"
            empty={
              <CardBody className="text-body-sm text-ink-muted">
                No tax rates yet, so checkout charges no tax.
              </CardBody>
            }
          />
        </SettingsSection>
      </SettingsLayout>
    </>
  );
}
