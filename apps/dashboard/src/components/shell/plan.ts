// The sidebar's plan indicator, derived from the billing read model
// (getOrganisationBilling). Presentation only: it reads what the billing page
// already shows and never decides access. Pure, so it is unit-tested.
import { STATUS_LABELS } from "@storevia/billing/state-machine";
import type { UsageLine } from "@storevia/entitlements";
import type { OrganisationBilling } from "@storevia/tenancy";
import type { ShellPlan } from "./types";

type Subscription = NonNullable<OrganisationBilling["subscription"]>;

/** A status only when the plan needs attention; an active plan stays quiet. */
function planStatus(subscription: Subscription | null): ShellPlan["status"] {
  if (!subscription) return undefined;
  if (!subscription.entitling) return { label: "Ended", tone: "neutral" };
  switch (subscription.status) {
    case "TRIAL":
      return { label: STATUS_LABELS.TRIAL, tone: "info" };
    case "PAST_DUE":
    case "CANCELLED":
      return { label: STATUS_LABELS[subscription.status], tone: "warning" };
    default:
      return undefined;
  }
}

/**
 * The usage line closest to its limit: over-limit lines first, then the
 * highest share of the limit; unlimited lines last. Ties keep catalogue order.
 */
export function tightestUsage(lines: readonly UsageLine[]): ShellPlan["meter"] {
  let best: ShellPlan["meter"];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const line of lines) {
    const used = Number(line.usage);
    const limit = line.limit === "unlimited" ? null : Number(line.limit);
    const score =
      limit === null ? -1 : limit <= 0 ? (used > 0 ? Number.POSITIVE_INFINITY : 1) : used / limit;
    if (score > bestScore) {
      best = { label: line.name, used, limit };
      bestScore = score;
    }
  }
  return best;
}

/** A usage line at or past its limit. Unlimited (or unknown) lines never are. */
export function atLimit(line: Pick<UsageLine, "usage" | "limit"> | null | undefined): boolean {
  if (!line || line.limit === "unlimited") return false;
  return line.usage >= line.limit;
}

export function planIndicator(
  billing: Pick<OrganisationBilling, "subscription" | "usage">,
  href: string,
): ShellPlan {
  const subscription = billing.subscription;
  return {
    name: subscription ? `${subscription.planName} plan` : "Free allowance",
    status: planStatus(subscription),
    href,
    meter: tightestUsage(billing.usage),
  };
}
