import { AVAILABILITY_LABELS } from "@storevia/entitlements/availability";
import { Glyph } from "@storevia/ui/icons";
import { Badge, Card, EmptyState } from "@storevia/ui/surfaces";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/app-shell";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Apps" };

// Storevia has no apps or integrations (API, webhooks) yet, so navigation
// doesn't link here (DB-5). The route stays for anyone with an old link, and
// says so plainly, with no controls and no dates. It reads nothing beyond
// store access.
export default async function AppsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/apps`);
  return (
    <>
      <PageHeader
        title="Apps"
        meta={
          <Badge variant="outline" tone="neutral">
            {AVAILABILITY_LABELS.planned}
          </Badge>
        }
        description={`Apps and integrations aren't available for ${ctx.storeName}.`}
      />
      <Card className="max-w-3xl">
        <EmptyState
          icon={<Glyph name="integrations" className="size-6" />}
          title="Apps and integrations aren't available"
          description="Storevia doesn't offer apps, an API or webhooks. There's nothing to install or connect here."
        />
      </Card>
    </>
  );
}
