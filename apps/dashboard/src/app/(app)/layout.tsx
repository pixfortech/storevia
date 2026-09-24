import type { ReactNode } from "react";
import { requirePrincipal } from "@/lib/auth";

/** Every route in this group requires a signed-in, verified user. */
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  await requirePrincipal();
  return children;
}
