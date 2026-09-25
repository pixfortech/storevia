import { PLATFORM_ROLE_LABELS } from "@storevia/tenancy/platform-rbac";
import { DescriptionList } from "@storevia/ui/data";
import { Icon } from "@storevia/ui/icons";
import { Avatar, Badge, Card, CardBody, CardHeader, PageHeader } from "@storevia/ui/surfaces";
import { Check } from "lucide-react";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { permissionLabel } from "@/lib/format";
import { stepUpReturnPath } from "@/lib/navigation";
import { ConfirmPasswordForm } from "./confirm-form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireStaff("/account");
  const { principal } = ctx;
  // Staff sent here from an organisation page get a way back to it.
  const from = (await searchParams)["from"];
  const returnTo = stepUpReturnPath(typeof from === "string" ? from : null);
  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        eyebrow="Staff account"
        title="Account"
        description="Your staff identity, what your role allows and the password confirmation that sensitive changes need."
      />

      <Card>
        <CardBody className="flex flex-wrap items-center gap-4 sm:gap-5">
          <Avatar name={principal.name} size="xl" />
          <div className="min-w-40 flex-1">
            <h2 className="truncate font-display text-h4 text-ink">{principal.name}</h2>
            <p className="truncate text-body-sm text-ink-muted">{principal.email}</p>
          </div>
          <Badge tone="brand">{PLATFORM_ROLE_LABELS[ctx.role]}</Badge>
        </CardBody>
        <div className="border-t border-line px-5 py-5 sm:px-6">
          <DescriptionList
            items={[
              {
                term: "Permissions",
                detail: (
                  <ul className="space-y-2">
                    {[...ctx.permissions].map((permission) => (
                      <li key={permission} className="flex items-start gap-2">
                        <Icon icon={Check} size="sm" className="mt-0.5 text-success-600" />
                        <span className="min-w-0">
                          {permissionLabel(permission)}
                          <code className="block font-mono text-[11px] break-all text-ink-faint">
                            {permission}
                          </code>
                        </span>
                      </li>
                    ))}
                  </ul>
                ),
              },
              {
                term: "Session",
                detail: "Signs out after 30 minutes without activity, and after 12 hours at most.",
              },
            ]}
          />
        </div>
      </Card>

      <Card id="confirm" className="scroll-mt-28">
        <CardHeader
          title="Confirm your password"
          description="Plan, subscription and override changes need a password confirmation in the last 10 minutes."
          actions={
            principal.recentlyAuthenticated ? (
              <Badge tone="success" dot>
                Confirmed recently
              </Badge>
            ) : (
              <Badge variant="dot">Not confirmed</Badge>
            )
          }
        />
        <CardBody className="max-w-md">
          <ConfirmPasswordForm returnTo={returnTo} />
        </CardBody>
      </Card>
    </div>
  );
}
