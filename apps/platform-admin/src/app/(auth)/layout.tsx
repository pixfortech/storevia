import type { ReactNode } from "react";
import { StaffAuthFrame } from "@/components/auth/staff-auth-frame";
import { env } from "@/lib/env";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <StaffAuthFrame stage={env().STOREVIA_ENV}>{children}</StaffAuthFrame>;
}
