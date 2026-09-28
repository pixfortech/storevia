import "server-only";
import { staffNotifications } from "@storevia/commerce";
import { requireOrganisationAccess, type Principal } from "@storevia/tenancy";
import { isDomainError } from "@storevia/types";
import { requestInfo } from "./request";

// The notification centre (post-M7), shared by its GET endpoint and the
// mark-read action. The organisation id is only a request: the membership
// check decides, the database shows a member only their own notifications,
// and the service keeps to stores they can still open with order.read.

export interface BellItem {
  readonly id: string;
  readonly title: string;
  readonly storeName: string;
  readonly href: string;
  /** ISO. */
  readonly createdAt: string;
  readonly read: boolean;
}

export interface BellState {
  readonly unread: number;
  readonly items: readonly BellItem[];
}

export const EMPTY_BELL: BellState = { unread: 0, items: [] };

export async function organisationForBell(principal: Principal, orgId: unknown) {
  return requireOrganisationAccess(principal, orgId, await requestInfo());
}

export async function bellState(principal: Principal | null, orgId: unknown): Promise<BellState> {
  if (!principal) return EMPTY_BELL;
  try {
    const list = await staffNotifications(await organisationForBell(principal, orgId), {
      limit: 20,
    });
    return {
      unread: list.unread,
      items: list.items.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
    };
  } catch (error) {
    // A lost membership, a foreign or malformed id: nothing to show.
    if (isDomainError(error)) return EMPTY_BELL;
    throw error;
  }
}
