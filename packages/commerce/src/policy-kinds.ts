// Store policy kinds (final pass, Phase 2A): client-safe definitions shared
// by the dashboard, the storefront and the launch checks. Storevia never
// writes a policy's text: a starter is headings only, marked as a template,
// and a policy can't be published until the merchant writes its body.

export type StorePolicyKind =
  "SHIPPING" | "REFUND" | "CANCELLATION" | "PRIVACY" | "TERMS" | "CONTACT";

/** When a store needs the policy published before it can go live. */
export type PolicyRequirement = "always" | "when-shipping" | "optional";

export interface PolicyDefinition {
  readonly kind: StorePolicyKind;
  /** The storefront path segment: /policies/{handle}. */
  readonly handle: string;
  readonly defaultTitle: string;
  /** What the policy covers, for the dashboard. */
  readonly description: string;
  readonly requirement: PolicyRequirement;
  /** Starter section headings (a template the merchant replaces or keeps). */
  readonly starterHeadings: readonly string[];
}

export const POLICY_DEFINITIONS: readonly PolicyDefinition[] = [
  {
    kind: "SHIPPING",
    handle: "shipping",
    defaultTitle: "Shipping policy",
    description: "Where you ship, how long delivery takes and what it costs.",
    requirement: "when-shipping",
    starterHeadings: [
      "Where we ship",
      "Processing and delivery times",
      "Shipping charges",
      "Tracking your order",
    ],
  },
  {
    kind: "REFUND",
    handle: "refunds",
    defaultTitle: "Returns and refunds",
    description: "Which items can be returned, within what time, and how refunds are paid.",
    requirement: "always",
    starterHeadings: [
      "Returns",
      "Items that can't be returned",
      "Refunds",
      "Damaged or wrong items",
    ],
  },
  {
    kind: "CANCELLATION",
    handle: "cancellation",
    defaultTitle: "Cancellation policy",
    description: "When and how a customer can cancel an order.",
    requirement: "optional",
    starterHeadings: ["Cancelling an order", "Cancellations after dispatch"],
  },
  {
    kind: "PRIVACY",
    handle: "privacy",
    defaultTitle: "Privacy policy",
    description:
      "What personal data your store collects, why, and how customers can reach you about it.",
    requirement: "always",
    starterHeadings: [
      "What we collect",
      "How we use it",
      "Who we share it with",
      "Your choices",
      "Contact",
    ],
  },
  {
    kind: "TERMS",
    handle: "terms",
    defaultTitle: "Terms of service",
    description: "The terms on which your store sells to customers.",
    requirement: "always",
    starterHeadings: [
      "About these terms",
      "Orders and pricing",
      "Payment",
      "Liability",
      "Governing law",
    ],
  },
  {
    kind: "CONTACT",
    handle: "contact",
    defaultTitle: "Contact us",
    description:
      "Anything to add to your contact page (your seller details are shown automatically).",
    requirement: "optional",
    starterHeadings: ["Customer support hours", "Grievance officer"],
  },
];

export const policyDefinition = (kind: StorePolicyKind): PolicyDefinition => {
  const found = POLICY_DEFINITIONS.find((d) => d.kind === kind);
  if (!found) throw new Error(`unknown policy kind ${kind}`);
  return found;
};

export const policyByHandle = (handle: string): PolicyDefinition | undefined =>
  POLICY_DEFINITIONS.find((d) => d.handle === handle);

export const isPolicyKind = (value: unknown): value is StorePolicyKind =>
  typeof value === "string" && POLICY_DEFINITIONS.some((d) => d.kind === value);

/** The storefront path of a policy page. */
export const policyPath = (kind: StorePolicyKind): string =>
  `/policies/${policyDefinition(kind).handle}`;

/** Whether a store needs this policy published to go live. */
export function policyRequired(kind: StorePolicyKind, sellsShippableProducts: boolean): boolean {
  const { requirement } = policyDefinition(kind);
  return requirement === "always" || (requirement === "when-shipping" && sellsShippableProducts);
}
