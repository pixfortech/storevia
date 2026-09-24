import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { organisationShellData } from "@/lib/shell";
import { organisationContextOr404 } from "@/lib/tenant";

export default async function OrganisationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const ctx = await organisationContextOr404(orgId, `/o/${orgId}`);
  return <AppShell data={await organisationShellData(ctx)}>{children}</AppShell>;
}
