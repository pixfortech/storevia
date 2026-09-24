import { getStore, hasPermission } from "@storevia/tenancy";
import { Card, CardBody, CardHeader } from "@storevia/ui";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/app-shell";
import { storeContextOr404 } from "@/lib/tenant";
import { ArchiveStoreForm, StoreSettingsForm } from "./settings-forms";

export const metadata: Metadata = { title: "Store settings" };

export default async function StoreSettingsPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/settings`);
  const store = await getStore(ctx);
  const canEdit = hasPermission(ctx, "store.update") && store.status !== "ARCHIVED";
  return (
    <>
      <PageHeader title="Store settings" description={store.primaryHostname ?? undefined} />
      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader
            title="General"
            description={canEdit ? undefined : "You can view these settings but not change them."}
          />
          <CardBody>
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
              fixed={{
                currency: store.currency,
                country: store.country,
                address: store.primaryHostname ?? "",
              }}
            />
          </CardBody>
        </Card>
        {hasPermission(ctx, "store.archive") && store.status !== "ARCHIVED" ? (
          <Card>
            <CardHeader
              title="Archive store"
              description="Archived stores are hidden from your store list. Their data is kept."
            />
            <CardBody>
              <ArchiveStoreForm storeId={storeId} storeName={store.name} />
            </CardBody>
          </Card>
        ) : null}
      </div>
    </>
  );
}
