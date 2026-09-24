import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { storeShellData } from "@/lib/shell";
import { storeContextOr404 } from "@/lib/tenant";

export default async function StoreLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}`);
  return <AppShell data={await storeShellData(ctx)}>{children}</AppShell>;
}
