import { PLATFORM_ROLE_LABELS } from "@storevia/tenancy/platform-rbac";
import { Badge, Card, CardBody, CardHeader } from "@storevia/ui";
import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { ConfirmPasswordForm } from "./confirm-form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const ctx = await requireStaff("/account");
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
      <Card>
        <CardHeader title={ctx.principal.name} description={ctx.principal.email} />
        <CardBody className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="brand">{PLATFORM_ROLE_LABELS[ctx.role]}</Badge>
          <span className="text-ink-muted">Permissions: {[...ctx.permissions].join(", ")}</span>
        </CardBody>
      </Card>
      <Card id="confirm">
        <CardHeader
          title="Confirm your password"
          description="Plan, subscription and override changes need a password confirmation in the last 10 minutes."
          actions={
            ctx.principal.recentlyAuthenticated ? (
              <Badge tone="success">Confirmed recently</Badge>
            ) : null
          }
        />
        <CardBody>
          <ConfirmPasswordForm />
        </CardBody>
      </Card>
    </div>
  );
}
