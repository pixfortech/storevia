import { hasPermission, listStores } from "@storevia/tenancy";
import { BUSINESS_TYPE_DEFINITIONS } from "@storevia/tenancy/business-types";
import { Badge, buttonClasses, Card, EmptyState, GlyphTile, ICON_STROKE } from "@storevia/ui";
import { ChevronRight, Plus, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/app-shell";
import { BUSINESS_TYPE_GLYPH } from "@/lib/business-types";
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
              <Plus aria-hidden="true" strokeWidth={2} className="size-4" /> Create store
            </Link>
          ) : null
        }
      />
      {stores.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Store aria-hidden="true" strokeWidth={ICON_STROKE} className="size-6" />}
            title="Create your first store"
            description={
              canCreate
                ? "A store is an online store, business website, publication or portfolio, with its own address on the web."
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
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stores.map((store) => (
            <li key={store.id}>
              <Link
                href={storePath(store.id)}
                className="group flex h-full flex-col rounded-card border border-line bg-surface p-5 shadow-card transition-colors hover:border-line-strong"
              >
                <span className="flex items-start justify-between gap-3">
                  <GlyphTile name={BUSINESS_TYPE_GLYPH[store.businessType]} />
                  <Badge tone={STATUS_TONE[store.status]}>
                    {store.status === "DRAFT" ? "Not launched" : store.status.toLowerCase()}
                  </Badge>
                </span>
                <span className="mt-4 block truncate text-base font-semibold text-ink">
                  {store.name}
                </span>
                <span className="mt-0.5 block text-sm text-ink-muted">
                  {BUSINESS_TYPE_DEFINITIONS[store.businessType].label}
                </span>
                <span className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3 text-sm text-ink-faint">
                  <span className="truncate">{store.primaryHostname}</span>
                  <ChevronRight
                    aria-hidden="true"
                    strokeWidth={ICON_STROKE}
                    className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
