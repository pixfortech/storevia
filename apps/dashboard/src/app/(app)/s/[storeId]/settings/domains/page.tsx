import {
  hasPermission,
  listStoreDomains,
  type DomainRecordView,
  type StoreDomainView,
} from "@storevia/tenancy";
import { Alert, Badge, Card, CardBody, CardHeader } from "@storevia/ui/surfaces";
import { Info, Lock, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SettingsLayout, SettingsSection } from "@/components/areas/settings";
import { LinkTabs } from "@/components/catalogue/link-tabs";
import {
  AddDomainForm,
  CheckDomainButton,
  CopyButton,
  MakePrimaryButton,
  RemoveDomainButton,
} from "@/components/settings/domain-forms";
import { PageHeader } from "@/components/shell/app-shell";
import { orgPath } from "@/lib/ids";
import { settingsTabs } from "@/lib/settings-tabs";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Domains" };

// Settings → Domains (ADR-0032): the store's addresses, connecting its own
// domain with the DNS records to add, and choosing the primary one.

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

function statusBadge(domain: StoreDomainView): { label: string; tone: Tone } {
  switch (domain.status) {
    case "ACTIVE":
      return domain.message
        ? { label: "Active, check DNS", tone: "warning" }
        : { label: "Active", tone: "success" };
    case "FAILED":
      return { label: "Failed", tone: "danger" };
    case "PENDING":
      return { label: "Adding", tone: "neutral" };
    case "VERIFYING":
      return domain.https === "pending"
        ? { label: "Setting up HTTPS", tone: "info" }
        : { label: "Waiting for DNS", tone: "warning" };
  }
}

const HTTPS_LABEL: Record<StoreDomainView["https"], string> = {
  active: "HTTPS on",
  pending: "HTTPS pending",
  not_yet: "HTTPS after verification",
};

const RECORD_STATE: Record<DomainRecordView["state"], { label: string; tone: Tone }> = {
  found: { label: "Found", tone: "success" },
  waiting: { label: "Not found yet", tone: "warning" },
  check: { label: "Check this record", tone: "danger" },
};

const PURPOSE: Record<DomainRecordView["purpose"], string> = {
  ownership: "Proves you own the domain",
  routing: "Points the domain to your store",
  "provider-verification": "Confirms the domain with our hosting",
};

function formatChecked(date: Date | null): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function DnsRecords({ domain }: { domain: StoreDomainView }) {
  return (
    <div className="space-y-3">
      <p className="text-body-sm text-ink-muted">
        Add {domain.records.length === 1 ? "this record" : "these records"} where you manage your
        domain&apos;s DNS (usually where you bought it). Changes can take a few minutes, sometimes
        up to 48 hours. We check automatically.
      </p>
      {/* Wide screens: a table. Phones: one card per record. Long values wrap. */}
      <div className="hidden overflow-hidden rounded-md border border-line sm:block">
        <table className="w-full table-fixed text-left text-body-sm" data-testid="dns-records">
          <caption className="sr-only">DNS records for {domain.hostname}</caption>
          <thead className="bg-surface-sunken text-caption text-ink-muted">
            <tr>
              <th scope="col" className="w-20 px-3 py-2 font-medium">
                Type
              </th>
              <th scope="col" className="w-[32%] px-3 py-2 font-medium">
                Name
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Value
              </th>
              <th scope="col" className="w-32 px-3 py-2 font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {domain.records.map((record) => (
              <tr key={`${record.type}:${record.name}:${record.value}`} className="align-top">
                <td className="px-3 py-3 font-mono font-medium text-ink">{record.type}</td>
                <td className="px-3 py-3">
                  <span className="block font-mono break-all text-ink">{record.name}</span>
                  <CopyButton value={record.name} label={`${record.type} record name`} />
                </td>
                <td className="px-3 py-3">
                  <span className="block font-mono break-all text-ink">{record.value}</span>
                  <span className="block text-caption text-ink-muted">
                    {PURPOSE[record.purpose]}
                  </span>
                  <CopyButton value={record.value} label={`${record.type} record value`} />
                </td>
                <td className="px-3 py-3">
                  <Badge size="sm" variant="dot" tone={RECORD_STATE[record.state].tone}>
                    {RECORD_STATE[record.state].label}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 sm:hidden" aria-label={`DNS records for ${domain.hostname}`}>
        {domain.records.map((record) => (
          <li
            key={`${record.type}:${record.name}:${record.value}`}
            className="rounded-md border border-line p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-body-sm font-medium text-ink">
                {record.type} record
              </span>
              <Badge size="sm" variant="dot" tone={RECORD_STATE[record.state].tone}>
                {RECORD_STATE[record.state].label}
              </Badge>
            </div>
            <p className="mt-1 text-caption text-ink-muted">{PURPOSE[record.purpose]}</p>
            <dl className="mt-3 space-y-3 text-body-sm">
              <div>
                <dt className="text-caption text-ink-muted">Name</dt>
                <dd className="font-mono break-all text-ink">{record.name}</dd>
                <dd>
                  <CopyButton value={record.name} label={`${record.type} record name`} />
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Value</dt>
                <dd className="font-mono break-all text-ink">{record.value}</dd>
                <dd>
                  <CopyButton value={record.value} label={`${record.type} record value`} />
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function DomainsSettingsPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/settings/domains`);
  const data = await listStoreDomains(ctx);
  const locked = ctx.storeStatus === "ARCHIVED" || ctx.storeStatus === "SUSPENDED";
  const canManage = data.canManage && !locked;
  const canAdd = canManage && data.customDomainsIncluded;
  const customCount = data.domains.filter((d) => d.kind === "custom").length;
  const primary = data.primaryHostname;

  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Store settings"
        description="The web addresses your store is served at."
      />
      <LinkTabs
        label="Settings sections"
        className="mb-6 lg:mb-8"
        tabs={settingsTabs(ctx.storeId, "domains")}
      />
      {locked ? (
        <Alert tone="neutral" icon={Lock} className="mb-6 max-w-3xl lg:mb-8">
          This store is {ctx.storeStatus === "ARCHIVED" ? "archived" : "suspended"}, so its domains
          can&apos;t be changed.
        </Alert>
      ) : null}
      <SettingsLayout
        sections={[
          { id: "connect-domain", label: "Connect a domain" },
          { id: "domains", label: "Your domains" },
        ]}
      >
        <SettingsSection
          id="connect-domain"
          title="Connect a domain"
          description="Use a domain you own, like shop.example.com. Your store stays at its Storevia address too, and one of them is primary: the others redirect to it."
        >
          <CardBody className="py-6">
            {!data.canManage ? (
              <p className="text-body-sm text-ink-muted">
                Your role doesn&apos;t include managing domains. Ask an owner or admin if you need
                it.
              </p>
            ) : !data.customDomainsIncluded ? (
              <Alert tone="info" icon={Info} title="Custom domains aren't included in your plan">
                Upgrade to connect your own domain.{" "}
                {hasPermission(ctx, "billing.read") ? (
                  <Link
                    href={orgPath(ctx.organisationId, "/billing")}
                    className="font-medium underline"
                  >
                    See plans
                  </Link>
                ) : null}
              </Alert>
            ) : customCount >= data.limit ? (
              <p className="text-body-sm text-ink-muted">
                This store has {data.limit} custom domains, the most it can have. Remove one to add
                another.
              </p>
            ) : canAdd ? (
              <AddDomainForm storeId={storeId} />
            ) : (
              <p className="text-body-sm text-ink-muted">Domains can&apos;t be added right now.</p>
            )}
          </CardBody>
        </SettingsSection>

        <section id="domains" aria-labelledby="domains-title" className="scroll-mt-24 space-y-4">
          <h2 id="domains-title" className="font-display text-h4 font-semibold text-ink">
            Your domains
          </h2>
          {data.domains.map((domain) => {
            const status = statusBadge(domain);
            const isCurrentPlatform =
              domain.kind === "platform" && domain.hostname === data.platformHostname;
            const oldAddress = domain.kind === "platform" && !isCurrentPlatform;
            const checked = formatChecked(domain.lastCheckedAt);
            const showRecords =
              domain.kind === "custom" && (domain.status !== "ACTIVE" || domain.message !== null);
            return (
              <Card key={domain.id} data-testid="domain-row" data-hostname={domain.hostname}>
                <CardHeader
                  title={
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="min-w-0 font-mono break-all">{domain.hostname}</span>
                      {domain.isPrimary ? (
                        <Badge size="sm" tone="brand">
                          Primary
                        </Badge>
                      ) : null}
                    </span>
                  }
                  description={
                    domain.isPrimary
                      ? "Your store is served here."
                      : oldAddress
                        ? `An old store address. Redirects to ${primary ?? "your primary domain"}.`
                        : domain.status === "ACTIVE"
                          ? `Redirects to ${primary ?? "your primary domain"}.`
                          : domain.kind === "custom"
                            ? "Not connected yet."
                            : null
                  }
                />
                <CardBody className="space-y-4 pb-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge size="sm" variant="dot" tone={status.tone} data-testid="domain-status">
                      {status.label}
                    </Badge>
                    <Badge
                      size="sm"
                      variant="outline"
                      tone={domain.https === "active" ? "success" : "neutral"}
                    >
                      {HTTPS_LABEL[domain.https]}
                    </Badge>
                    <span className="text-caption text-ink-muted">
                      {domain.kind === "platform" ? "Storevia address" : "Custom domain"}
                      {checked && domain.kind === "custom" ? ` · Last checked ${checked} UTC` : ""}
                    </span>
                  </div>
                  {domain.message ? (
                    <Alert
                      tone={domain.status === "FAILED" ? "danger" : "warning"}
                      icon={TriangleAlert}
                    >
                      {domain.message}
                    </Alert>
                  ) : null}
                  {showRecords ? (
                    <DnsRecords domain={domain} />
                  ) : domain.kind === "custom" && domain.records.length > 0 ? (
                    <details className="text-body-sm">
                      <summary className="cursor-pointer font-medium text-ink">
                        DNS records
                      </summary>
                      <div className="mt-3">
                        <DnsRecords domain={domain} />
                      </div>
                    </details>
                  ) : null}
                  {canManage && (domain.kind === "custom" || isCurrentPlatform) ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {domain.status === "ACTIVE" &&
                      !domain.isPrimary &&
                      (domain.kind === "platform" || data.customDomainsIncluded) ? (
                        <MakePrimaryButton
                          storeId={storeId}
                          domainId={domain.id}
                          hostname={domain.hostname}
                        />
                      ) : null}
                      {domain.kind === "custom" && data.customDomainsIncluded ? (
                        <CheckDomainButton
                          storeId={storeId}
                          domainId={domain.id}
                          hostname={domain.hostname}
                        />
                      ) : null}
                      {domain.kind === "custom" ? (
                        <RemoveDomainButton
                          storeId={storeId}
                          domainId={domain.id}
                          hostname={domain.hostname}
                          isPrimary={domain.isPrimary}
                          fallbackHostname={data.platformHostname}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            );
          })}
        </section>
      </SettingsLayout>
    </>
  );
}
