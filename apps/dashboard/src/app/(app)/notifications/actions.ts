"use server";

import { markStaffNotificationsRead } from "@storevia/commerce";
import { isDomainError } from "@storevia/types";
import { requireActionPrincipal } from "@/lib/auth";
import { bellState, EMPTY_BELL, organisationForBell, type BellState } from "@/lib/notifications";

// Marking notifications read (the bell's only write). The organisation id
// arrives from the client and is re-verified against the session; ids that
// aren't the member's own match nothing.

export async function markNotificationsReadAction(
  orgId: string,
  ids: readonly string[] | "all",
): Promise<BellState> {
  const principal = await requireActionPrincipal();
  try {
    await markStaffNotificationsRead(
      await organisationForBell(principal, orgId),
      ids === "all" ? "all" : ids.filter((id) => typeof id === "string").slice(0, 50),
    );
  } catch (error) {
    if (isDomainError(error)) return EMPTY_BELL;
    throw error;
  }
  return bellState(principal, orgId);
}
