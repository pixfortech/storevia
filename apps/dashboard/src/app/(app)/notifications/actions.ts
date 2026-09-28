"use server";

import { markStaffNotificationsRead, staffNotifications } from "@storevia/commerce";
import { requireOrganisationAccess } from "@storevia/tenancy";
import { isDomainError } from "@storevia/types";
import { requireActionPrincipal } from "@/lib/auth";
import { requestInfo } from "@/lib/request";

// The notification centre (post-M7). The organisation id arrives from the
// client and is re-verified against the session's memberships on every
// call; the database shows a member only their own notifications, and the
// service keeps to stores they can still access with order.read.

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

const EMPTY: BellState = { unread: 0, items: [] };

async function context(orgId: string) {
  return requireOrganisationAccess(await requireActionPrincipal(), orgId, await requestInfo());
}

export async function loadNotificationsAction(orgId: string): Promise<BellState> {
  try {
    const list = await staffNotifications(await context(orgId), { limit: 20 });
    return {
      unread: list.unread,
      items: list.items.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
    };
  } catch (error) {
    // A lost membership or signed-out session: nothing to show.
    if (isDomainError(error)) return EMPTY;
    throw error;
  }
}

export async function markNotificationsReadAction(
  orgId: string,
  ids: readonly string[] | "all",
): Promise<BellState> {
  try {
    const ctx = await context(orgId);
    await markStaffNotificationsRead(
      ctx,
      ids === "all" ? "all" : ids.filter((id) => typeof id === "string").slice(0, 50),
    );
  } catch (error) {
    if (isDomainError(error)) return EMPTY;
    throw error;
  }
  return loadNotificationsAction(orgId);
}
