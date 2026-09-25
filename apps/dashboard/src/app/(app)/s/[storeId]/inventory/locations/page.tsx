import { listLocations } from "@storevia/commerce";
import { getStore, hasPermission } from "@storevia/tenancy";
import { Card, EmptyState } from "@storevia/ui/surfaces";
import type { Metadata } from "next";
import { AccessNotice } from "@/components/areas/access-notice";
import { LinkTabs } from "@/components/catalogue/link-tabs";
import { LocationDialog, LocationRowActions } from "@/components/catalogue/location-forms";
import { PageHeader } from "@/components/shell/app-shell";
import { inventoryTabs } from "@/lib/catalogue";
import { COUNTRY_OPTIONS } from "@/lib/options";
import { storeContextOr404 } from "@/lib/tenant";
import { Badge } from "@storevia/ui/surfaces";

export const metadata: Metadata = { title: "Locations" };

export default async function LocationsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/inventory/locations`);
  if (!hasPermission(ctx, "inventory.read")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Locations" />
        <AccessNotice title="You don't have access to inventory">
          Ask an owner or admin if you need it.
        </AccessNotice>
      </>
    );
  }
  const [locations, store] = await Promise.all([listLocations(ctx), getStore(ctx)]);
  const canManage = hasPermission(ctx, "location.manage") && ctx.storeStatus !== "ARCHIVED";
  const countries = COUNTRY_OPTIONS.map((c) => ({ value: c.value, label: c.label }));
  const countryName = (code: string) => countries.find((c) => c.value === code)?.label ?? code;
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Inventory"
        description="Where your stock is kept: a shop, a warehouse, a studio. Every store keeps at least one active location."
        actions={
          canManage ? (
            <LocationDialog
              storeId={storeId}
              countries={countries}
              defaultCountry={store.country}
            />
          ) : undefined
        }
      />
      <LinkTabs
        label="Inventory sections"
        className="mb-6"
        tabs={inventoryTabs(ctx.storeId, "locations")}
      />
      <Card className="overflow-hidden">
        {locations.length === 0 ? (
          <EmptyState
            compact
            titleAs="h2"
            title="No locations yet"
            description="Your main location is created automatically when you first record stock. You can also add one now."
            action={
              canManage ? (
                <LocationDialog
                  storeId={storeId}
                  countries={countries}
                  defaultCountry={store.country}
                />
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {locations.map((l) => (
              <li
                key={l.id}
                data-testid="location-row"
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                    {l.name}
                    <Badge size="sm" variant="outline">
                      {l.code}
                    </Badge>
                    {!l.isActive ? (
                      <Badge size="sm" tone="warning" variant="dot">
                        Inactive
                      </Badge>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate text-caption text-ink-muted">
                    {[l.addressLine1, l.city, countryName(l.countryCode)]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  <p className="mt-0.5 text-caption text-ink-faint">
                    {l.available.toLocaleString("en-IN")} units across {l.stockedVariants}{" "}
                    {l.stockedVariants === 1 ? "variant" : "variants"}
                    {l.fulfilsOnlineOrders ? " · Fulfils online orders" : ""}
                  </p>
                </div>
                {canManage ? (
                  <LocationRowActions storeId={storeId} location={l} countries={countries} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
