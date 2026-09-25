// Presentation helpers for the Members page: client-side filtering of the
// members the page already loaded (it fetches nothing new) and how each
// member's store access reads. Pure, so the wording is unit-tested.

export type MemberStatusFilter = "all" | "active" | "suspended";

export interface FilterableMember {
  readonly name: string;
  readonly email: string;
  readonly roleLabel: string;
  readonly status: "ACTIVE" | "SUSPENDED";
}

/** The filter bar appears once the list is long enough to need it. */
export const MEMBER_FILTER_THRESHOLD = 6;

/** Members whose name, email or role contains every word of `query`, with the status. */
export function filterMembers<T extends FilterableMember>(
  members: readonly T[],
  query: string,
  status: MemberStatusFilter = "all",
): T[] {
  const words = query.toLocaleLowerCase("en-GB").split(/\s+/).filter(Boolean);
  return members.filter((member) => {
    if (status === "active" && member.status !== "ACTIVE") return false;
    if (status === "suspended" && member.status !== "SUSPENDED") return false;
    const haystack = `${member.name} ${member.email} ${member.roleLabel}`.toLocaleLowerCase(
      "en-GB",
    );
    return words.every((word) => haystack.includes(word));
  });
}

/**
 * "All stores", or the stores a store-scoped member may open: "Acme Outlet",
 * "Acme Outlet and 1 more", "2 stores" (when the viewer can't see their
 * names) or "No stores".
 */
export function storeAccessLabel(
  allStores: boolean,
  storeIds: readonly string[],
  storeNames: ReadonlyMap<string, string>,
): string {
  if (allStores) return "All stores";
  if (storeIds.length === 0) return "No stores";
  const named = storeIds
    .map((id) => storeNames.get(id))
    .filter((name): name is string => name !== undefined);
  const first = named[0];
  if (first === undefined) {
    return `${String(storeIds.length)} ${storeIds.length === 1 ? "store" : "stores"}`;
  }
  const others = storeIds.length - 1;
  return others === 0 ? first : `${first} and ${String(others)} more`;
}
