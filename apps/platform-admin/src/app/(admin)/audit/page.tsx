import { listPlatformAuditLog, type AuditActorFilter } from "@storevia/billing";
import { hasPlatformPermission } from "@storevia/tenancy/platform";
import { parseTypeId, toTypeId } from "@storevia/types";
import { Button, buttonClasses } from "@storevia/ui/button";
import { DataList } from "@storevia/ui/data";
import { SearchInput } from "@storevia/ui/form";
import { Alert, Badge, Card, CardHeader, PageHeader } from "@storevia/ui/surfaces";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Audit log" };

// The platform audit log (M8). Read-only: no control here changes or removes
// an entry, and the platform database role can't. IP addresses and user
// agents aren't shown; emails in details are masked (listPlatformAuditLog).

const DESCRIPTION =
  "Every recorded change across organisations, and staff sign-ins. Read-only: entries can't be edited or removed.";

const ACTORS: Record<AuditActorFilter, string> = {
  ALL: "All actors",
  USER: "Merchants",
  PLATFORM_STAFF: "Storevia staff",
  SYSTEM: "System",
};

const isActor = (value: string): value is AuditActorFilter => value in ACTORS;

const ACTOR_LABEL: Record<string, string> = {
  USER: "Merchant",
  PLATFORM_STAFF: "Staff",
  SYSTEM: "System",
  API_KEY: "API key",
  APP: "App",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireStaff("/audit");
  if (!hasPlatformPermission(ctx, "platform.audit.read")) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="Operations" title="Audit log" description={DESCRIPTION} />
        <Alert tone="warning" title="You can't view the audit log">
          Your platform role doesn&apos;t include audit visibility.
        </Alert>
      </div>
    );
  }
  const params = await searchParams;
  const org = params["org"] ?? "";
  const organisationId = org ? (parseTypeId("organisation", org) ?? undefined) : undefined;
  const requestedActor = (params["actor"] ?? "ALL").toUpperCase();
  const actor = isActor(requestedActor) ? requestedActor : "ALL";
  const action = (params["action"] ?? "").trim().slice(0, 64);
  const before = params["before"] ?? null;
  const page = await listPlatformAuditLog(ctx, { organisationId, actor, action, before });
  const next = (cursor: string | null) => {
    const search = new URLSearchParams();
    if (organisationId) search.set("org", org);
    if (actor !== "ALL") search.set("actor", actor);
    if (action) search.set("action", action);
    if (cursor) search.set("before", cursor);
    const text = search.toString();
    return text ? `/audit?${text}` : "/audit";
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operations"
        title="Audit log"
        description={DESCRIPTION}
        meta={<Badge variant="outline">Read-only</Badge>}
      />
      <Card data-testid="audit-card">
        <CardHeader
          title={organisationId ? "One organisation" : "All entries"}
          description={before ? "Older entries" : "Newest first"}
        />
        <div className="border-b border-line px-5 py-4 sm:px-6">
          <Form
            action="/audit"
            role="search"
            aria-label="Audit log"
            className="flex flex-wrap gap-2"
          >
            {organisationId ? <input type="hidden" name="org" value={org} /> : null}
            <label htmlFor="action" className="sr-only">
              Action starts with
            </label>
            <SearchInput
              id="action"
              name="action"
              defaultValue={action}
              placeholder="Action, e.g. billing. or auth.platform"
              className="min-w-0 flex-1 pointer-coarse:h-11"
            />
            <label htmlFor="actor" className="sr-only">
              Actor
            </label>
            <select
              id="actor"
              name="actor"
              defaultValue={actor}
              className="h-10 rounded-md border border-line-strong bg-surface px-3 text-body-sm pointer-coarse:h-11"
            >
              {(Object.keys(ACTORS) as AuditActorFilter[]).map((key) => (
                <option key={key} value={key}>
                  {ACTORS[key]}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary" className="pointer-coarse:h-11">
              Filter
            </Button>
          </Form>
          {organisationId ? (
            <p className="mt-3 text-body-sm text-ink-muted">
              Showing one organisation.{" "}
              <Link href="/audit" className="font-medium text-brand-700 hover:underline">
                Show all
              </Link>
            </p>
          ) : null}
        </div>
        <DataList
          caption="Audit log entries"
          rows={page.entries}
          rowKey={(e) => e.id}
          rowTestId="audit-row"
          empty={<p className="px-5 py-6 text-body-sm text-ink-muted sm:px-6">No entries match.</p>}
          columns={[
            {
              key: "action",
              header: "Action",
              primary: true,
              cell: (e) => (
                <code className="font-mono text-[13px] break-all text-ink">{e.action}</code>
              ),
            },
            {
              key: "actor",
              header: "Actor",
              cell: (e) => (
                <span className="grid">
                  <span>{ACTOR_LABEL[e.actorType] ?? e.actorType}</span>
                  {e.actorName ? (
                    <span className="text-caption text-ink-muted">{e.actorName}</span>
                  ) : null}
                </span>
              ),
            },
            {
              key: "organisation",
              header: "Organisation",
              cell: (e) =>
                e.organisation ? (
                  <Link
                    href={`/audit?org=${toTypeId("organisation", e.organisation.id)}`}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {e.organisation.name}
                  </Link>
                ) : (
                  <span className="text-ink-muted">Platform</span>
                ),
            },
            {
              key: "details",
              header: "Details",
              hideOnMobile: true,
              cell: (e) => {
                const pairs = Object.entries(e.metadata);
                return pairs.length === 0 ? (
                  <span className="text-ink-faint">—</span>
                ) : (
                  <span className="text-caption break-all text-ink-muted">
                    {pairs.map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
                  </span>
                );
              },
            },
            {
              key: "when",
              header: "When",
              className: "whitespace-nowrap tabular-nums text-ink-muted",
              cell: (e) => (
                <span className="grid">
                  <span>{formatDateTime(e.occurredAt)}</span>
                  {e.requestId ? (
                    <code className="font-mono text-caption">{e.requestId.slice(0, 36)}</code>
                  ) : null}
                </span>
              ),
            },
          ]}
        />
      </Card>
      <div className="flex flex-wrap gap-3">
        {before ? (
          <Link href={next(null)} className={buttonClasses("secondary", "md")}>
            Newest entries
          </Link>
        ) : null}
        {page.nextCursor ? (
          <Link href={next(page.nextCursor)} className={buttonClasses("secondary", "md")}>
            Older entries
          </Link>
        ) : null}
      </div>
    </div>
  );
}
