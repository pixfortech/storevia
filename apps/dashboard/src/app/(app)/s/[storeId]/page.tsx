import { getStore, hasPermission, ROLE_LABELS } from "@storevia/tenancy";
import { Alert, Badge, buttonClasses, Card, CardBody, CardHeader } from "@storevia/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell/app-shell";
import { orgPath, storePath } from "@/lib/ids";
import { STORE_NAV } from "@/lib/navigation";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Home" };

export default async function StoreHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { storeId } = await params;
  const welcome = (await searchParams)["welcome"] === "1";
  const ctx = await storeContextOr404(storeId, `/s/${storeId}`);
  const store = await getStore(ctx);
  const upcoming = STORE_NAV.filter(
    (item) => item.availability && ctx.permissions.has(item.permission),
  );
  return (
    <>
      <PageHeader title={store.name} description={`Signed in as ${ROLE_LABELS[ctx.role]}`} />
      {welcome ? (
        <Alert tone="success" title="Your store is ready" className="mb-6">
          It isn't visible to shoppers yet: the storefront and product catalogue arrive in upcoming
          milestones.
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Store overview"
            actions={
              <Badge>
                {store.status === "DRAFT" ? "Not launched" : store.status.toLowerCase()}
              </Badge>
            }
          />
          <CardBody>
            <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-muted">Web address</dt>
                <dd className="mt-0.5 font-medium">{store.primaryHostname}</dd>
                <dd className="text-xs text-ink-faint">
                  Goes live when storefronts launch (Milestone 4)
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Currency</dt>
                <dd className="mt-0.5 font-medium">{store.currency}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Language</dt>
                <dd className="mt-0.5 font-medium">{store.locale}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Time zone</dt>
                <dd className="mt-0.5 font-medium">{store.timezone}</dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                href={storePath(ctx.storeId, "/settings")}
                className={buttonClasses("secondary", "sm")}
              >
                Store settings
              </Link>
              {hasPermission(ctx, "member.read") ? (
                <Link
                  href={orgPath(ctx.organisationId, "/members")}
                  className={buttonClasses("secondary", "sm")}
                >
                  Team members
                </Link>
              ) : null}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Coming next" description="Areas that unlock in upcoming releases." />
          <CardBody>
            <ul className="space-y-3 text-sm">
              {upcoming.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-2">
                  <span>{item.label}</span>
                  <span className="text-xs text-ink-faint">{item.availability}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
