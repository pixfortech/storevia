import { getStore, hasPermission } from "@storevia/tenancy";
import { Alert, Badge } from "@storevia/ui/surfaces";
import { Lock } from "lucide-react";
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
import { ArchiveStoreForm, BusinessTypeForm, StoreSettingsForm } from "./settings-forms";

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
  const store = await getStore(ctx);
  const archived = store.status === "ARCHIVED";
  const canEdit = hasPermission(ctx, "store.update") && !archived;
  const canArchive = hasPermission(ctx, "store.archive") && !archived;
  const status = storeStatusBadge(store.status);
  const sections: SettingsSectionLink[] = [
    { id: "general", label: "General" },
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
