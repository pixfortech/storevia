import { getAllowance, hasPermission, listStores } from "@storevia/tenancy";
import { BUSINESS_TYPE_DEFINITIONS, BUSINESS_TYPES } from "@storevia/tenancy/business-types";
import { buttonClasses } from "@storevia/ui/button";
import { Glyph, Icon } from "@storevia/ui/icons";
import { BusinessScene } from "@storevia/ui/illustrations";
import { Badge, Card, cardClasses, EmptyState } from "@storevia/ui/surfaces";
import { ArrowRight, Globe, Info, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/app-shell";
import { BUSINESS_TYPE_GLYPH } from "@/lib/business-types";
import { storeStatusBadge } from "@/lib/dashboard/setup";
import { orgPath, storePath } from "@/lib/ids";
import { organisationContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Stores" };

export default async function OrganisationPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const ctx = await organisationContextOr404(orgId, `/o/${orgId}`);
  const canCreate = hasPermission(ctx, "store.create");
  const [stores, allowance] = await Promise.all([
    listStores(ctx),
    // A hint only; createStore enforces the limit atomically on the server.
    canCreate ? getAllowance(ctx, "store_count") : null,
  ]);
  const newStoreHref = orgPath(ctx.organisationId, "/stores/new");
  const billingHref = hasPermission(ctx, "billing.read")
    ? orgPath(ctx.organisationId, "/billing")
    : null;
  const limit = allowance && allowance.limit !== "unlimited" ? Number(allowance.limit) : null;
  const used = allowance ? Number(allowance.usage) : 0;
  const atLimit = limit !== null && used >= limit;

  if (stores.length === 0) {
    return (
      <>
        <PageHeader eyebrow={ctx.organisationName} title="Stores" />
        <Card>
          <EmptyState
            illustration={
              <div aria-hidden="true" className="grid w-72 grid-cols-2 gap-x-6 gap-y-2 sm:w-80">
                {BUSINESS_TYPES.map((type) => (
                  <BusinessScene key={type} type={type} />
                ))}
              </div>
            }
            title={canCreate ? "Create your first store" : "No stores to show yet"}
            description={
              canCreate
                ? "A store is an online store, business website, publication or portfolio, with its own address on the web."
                : "There are no stores you can access yet. Ask an owner or admin to give you access."
            }
            action={
              canCreate ? (
                <Link href={newStoreHref} className={buttonClasses("primary")}>
                  <Icon icon={Plus} size="sm" strokeWidth={2} /> Create store
                </Link>
              ) : null
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={ctx.organisationName}
        title="Stores"
        description={`Every store in ${ctx.organisationName} shares its plan and team.`}
        actions={
          canCreate && !atLimit ? (
            <Link href={newStoreHref} className={buttonClasses("primary")}>
              <Icon icon={Plus} size="sm" strokeWidth={2} /> Create store
            </Link>
          ) : null
        }
      />
      <ul className="grid gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
        {stores.map((store) => {
          const status = storeStatusBadge(store.status);
          const definition = BUSINESS_TYPE_DEFINITIONS[store.businessType];
          return (
            <li key={store.id} className="min-w-0">
              <Link
                href={storePath(store.id)}
                className={cardClasses(
                  "interactive",
                  "group flex h-full overflow-hidden sm:flex-col",
                )}
              >
                {/* Phones: a thumbnail beside the details; wider: a cover above them. */}
                <span className="flex w-28 shrink-0 items-center justify-center border-r border-line bg-subtle px-3 sm:h-40 sm:w-auto sm:items-end sm:border-r-0 sm:border-b sm:px-10 sm:pt-9">
                  <BusinessScene type={store.businessType} className="sm:max-w-44" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col px-4 py-3.5 sm:px-6 sm:pt-5 sm:pb-4">
                  {/* Phones: type, name, then status on its own row, so every card
                      keeps one rhythm; wider: status beside the type. */}
                  <span className="grid grid-cols-1 items-center gap-x-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <span className="flex min-w-0 items-center gap-2 text-overline text-ink-faint uppercase">
                      <Glyph
                        name={BUSINESS_TYPE_GLYPH[store.businessType]}
                        className="size-4 shrink-0"
                      />
                      <span className="truncate">{definition.label}</span>
                    </span>
                    <Badge
                      variant="dot"
                      size="sm"
                      tone={status.tone}
                      className="order-last mt-2 justify-self-start sm:order-none sm:mt-0 sm:justify-self-end"
                    >
                      {status.label}
                    </Badge>
                    <span className="mt-1.5 block truncate font-display text-body font-semibold text-ink sm:col-span-2 sm:text-h4">
                      {store.name}
                    </span>
                  </span>
                  <span className="mt-auto flex items-center justify-between gap-3 pt-3 text-body-sm text-ink-muted sm:pt-5">
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon icon={Globe} size="sm" className="text-ink-faint" />
                      <span className="truncate">{store.primaryHostname ?? "No address yet"}</span>
                    </span>
                    <Icon
                      icon={ArrowRight}
                      size="sm"
                      className="shrink-0 text-ink-faint transition-transform duration-(--duration-fast) group-hover:translate-x-0.5 group-hover:text-brand-700 motion-reduce:transition-none"
                    />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
        {canCreate && !atLimit ? (
          <li className="min-w-0">
            <Link
              href={newStoreHref}
              className={cardClasses(
                "dashed",
                "group flex h-full flex-row items-center gap-4 p-5 transition-colors hover:border-brand-500/50 hover:bg-brand-25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-72 sm:flex-col sm:justify-center sm:p-6 sm:text-center",
              )}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-100 ring-inset">
                <Icon icon={Plus} size="md" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-body font-semibold text-ink">
                  Add another store
                </span>
                <span className="mt-1 block text-body-sm text-ink-muted">
                  {limit === null
                    ? "Your plan has no store limit."
                    : `${String(limit - used)} of ${String(limit)} still available on your plan.`}
                </span>
              </span>
            </Link>
          </li>
        ) : null}
      </ul>
      {canCreate && atLimit ? (
        <div className="mt-6 flex flex-col gap-4 rounded-card border border-line bg-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="flex items-start gap-3 text-body-sm text-ink-muted">
            <Icon icon={Info} size="md" className="text-ink-faint" />
            <span>
              <span className="font-semibold text-ink">
                Your plan&apos;s store limit has been reached.
              </span>{" "}
              {ctx.organisationName} uses {used} of {limit} {limit === 1 ? "store" : "stores"}.
              Archive a store, or contact Storevia to change your plan.
            </span>
          </p>
          {billingHref ? (
            <Link
              href={billingHref}
              className="-mx-2 inline-flex h-9 w-fit shrink-0 items-center gap-1.5 rounded-control px-2 text-label font-medium text-brand-700 transition-colors hover:bg-brand-50 max-sm:ml-6.5 pointer-coarse:h-11"
            >
              View plan and usage
              <Icon icon={ArrowRight} size="sm" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
