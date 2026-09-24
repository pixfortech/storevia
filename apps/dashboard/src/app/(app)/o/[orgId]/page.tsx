import { hasPermission, listStores } from "@storevia/tenancy";
import { Badge, buttonClasses, Card, EmptyState } from "@storevia/ui";
import { ChevronRight, Plus, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/app-shell";
import { orgPath, storePath } from "@/lib/ids";
import { organisationContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Stores" };

const STATUS_TONE = {
  DRAFT: "neutral",
  ACTIVE: "success",
  SUSPENDED: "danger",
  ARCHIVED: "neutral",
} as const;

export default async function OrganisationPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await organisationContextOr404(orgId, `/o/${orgId}`);
  const stores = await listStores(ctx);
  const canCreate = hasPermission(ctx, "store.create");
  const newStoreHref = orgPath(ctx.organisationId, "/stores/new");
  return (
    <>
      <PageHeader
        title="Stores"
        description={`Stores in ${ctx.organisationName}`}
        actions={
          canCreate && stores.length > 0 ? (
            <Link href={newStoreHref} className={buttonClasses("primary")}>
              <Plus aria-hidden="true" className="size-4" /> Create store
            </Link>
          ) : null
        }
      />
      {stores.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Store aria-hidden="true" className="size-6" />}
            title="Create your first store"
            description={
              canCreate
                ? "A store has its own products, orders, website and address on the web."
                : "There are no stores you can access yet. Ask an owner or admin to give you access."
            }
            action={
              canCreate ? (
                <Link href={newStoreHref} className={buttonClasses("primary")}>
                  <Plus aria-hidden="true" className="size-4" /> Create store
                </Link>
              ) : null
            }
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {stores.map((store) => (
              <li key={store.id}>
                <Link
                  href={storePath(store.id)}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-subtle"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-50 text-brand-700">
                    <Store aria-hidden="true" className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{store.name}</span>
                    <span className="block truncate text-sm text-ink-muted">
                      {store.primaryHostname}
                    </span>
                  </span>
                  <Badge tone={STATUS_TONE[store.status]}>
                    {store.status === "DRAFT" ? "Not launched" : store.status.toLowerCase()}
                  </Badge>
                  <ChevronRight aria-hidden="true" className="size-4 text-ink-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
