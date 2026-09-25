// What needs a staff member's attention on an organisation, most severe
// first. Pure: the page passes in what it has already loaded.
import { formatDateTime, humanise } from "./format";

export type RiskTone = "danger" | "warning" | "info";

export interface RiskItem {
  readonly tone: RiskTone;
  readonly text: string;
}

export interface RiskInput {
  readonly organisationStatus: string;
  readonly subscription: {
    readonly status: string;
    readonly source: string;
    readonly graceEndsAt: Date | null;
    readonly expiresAt: Date | null;
  } | null;
  /** Whether the live subscription grants its plan right now. */
  readonly entitling: boolean;
  readonly usage: readonly { readonly name: string; readonly overLimit: boolean }[];
  readonly overrides: readonly { readonly expiresAt: Date | null }[];
  readonly now: Date;
}

const RANK: Record<RiskTone, number> = { danger: 0, warning: 1, info: 2 };

/** Overrides still in force (no expiry, or expiring later). */
export function activeOverrideCount(
  overrides: readonly { readonly expiresAt: Date | null }[],
  now: Date,
): number {
  return overrides.filter((o) => o.expiresAt === null || o.expiresAt > now).length;
}

export function riskItems(input: RiskInput): RiskItem[] {
  const { subscription: sub, now } = input;
  const items: RiskItem[] = [];
  if (input.organisationStatus !== "ACTIVE") {
    items.push({
      tone: "danger",
      text: `Organisation is ${humanise(input.organisationStatus).toLowerCase()}.`,
    });
  }
  if (sub && !input.entitling) {
    items.push({
      tone: "danger",
      text: "Subscription no longer grants its plan: system defaults apply.",
    });
  }
  if (sub?.status === "PAST_DUE") {
    items.push({
      tone: "warning",
      text: `Payment overdue. Grace ends ${formatDateTime(sub.graceEndsAt)}.`,
    });
  }
  if (sub?.status === "CANCELLED") {
    items.push({
      tone: "warning",
      text: `Cancelled. Access ends ${formatDateTime(sub.expiresAt)}.`,
    });
  }
  for (const line of input.usage) {
    if (line.overLimit) {
      items.push({ tone: "danger", text: `Over the ${line.name.toLowerCase()} limit.` });
    }
  }
  const overrides = activeOverrideCount(input.overrides, now);
  if (overrides > 0) {
    items.push({
      tone: "info",
      text: `${String(overrides)} active entitlement ${overrides === 1 ? "override" : "overrides"}.`,
    });
  }
  if (sub?.source === "MOCK") {
    items.push({ tone: "info", text: "Subscription comes from mock billing (test only)." });
  }
  // Array.prototype.sort is stable, so items keep their order within a tone.
  return items.sort((a, b) => RANK[a.tone] - RANK[b.tone]);
}
