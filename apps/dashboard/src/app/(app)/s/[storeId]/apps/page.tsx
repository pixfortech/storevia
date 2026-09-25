import { Badge, Card, EmptyState, Glyph } from "@storevia/ui";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/app-shell";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Apps" };

// An honest placeholder: Storevia has no apps or integrations yet, so this
// page lists none and has no controls. It reads nothing beyond store access.
export default async function AppsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/apps`);
  return (
    <>
      <PageHeader
        title="Apps"
        meta={
          <Badge variant="outline" tone="neutral">
            On the roadmap
          </Badge>
        }
        description={`Apps will add features to ${ctx.storeName} and connect it to services you already use.`}
      />
      <Card className="max-w-3xl">
        <EmptyState
          icon={<Glyph name="integrations" className="size-6" />}
          title="Apps and integrations are on the roadmap"
          description="There's nothing to install yet. When apps and integrations arrive, you'll add and manage them for this store here."
        />
      </Card>
    </>
  );
}
