// Small read-only summaries for the live widgets (team and plan). Pure, so
// the wording is unit-tested; the page passes data it was allowed to read.
import { MEMBER_ROLES, ROLE_LABELS, type MemberRole } from "@storevia/tenancy/rbac";

// Role labels that read as a function, not a person, don't take a plural.
const UNCOUNTABLE: ReadonlySet<MemberRole> = new Set(["MARKETING", "SUPPORT"]);

/** "1 owner · 2 designers · 1 viewer": the team's roles, most common first. */
export function roleSummary(roles: readonly MemberRole[], limit = 3): string {
  const counts = new Map<MemberRole, number>();
  for (const role of roles) counts.set(role, (counts.get(role) ?? 0) + 1);
  const ordered = [...counts].sort(
    ([a, x], [b, y]) => y - x || MEMBER_ROLES.indexOf(a) - MEMBER_ROLES.indexOf(b),
  );
  const parts = ordered.slice(0, limit).map(([role, count]) => {
    const label = ROLE_LABELS[role].toLowerCase();
    return `${String(count)} ${count > 1 && !UNCOUNTABLE.has(role) ? `${label}s` : label}`;
  });
  const rest = ordered.slice(limit).reduce((sum, [, count]) => sum + count, 0);
  return rest > 0 ? [...parts, `${String(rest)} more`].join(" · ") : parts.join(" · ");
}

/** "Trial ends 8 Oct 2026" while a trial runs; nothing otherwise. */
export function trialNote(
  subscription: { readonly status: string; readonly trialEndsAt: Date | null } | null,
  timeZone = "UTC",
  locale = "en-GB",
): string | undefined {
  if (subscription?.status !== "TRIAL" || !subscription.trialEndsAt) return undefined;
  const date = new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium" }).format(
    subscription.trialEndsAt,
  );
  return `Trial ends ${date}`;
}
