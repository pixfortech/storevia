// Recent activity as sentences (the store home's activity widget). The input
// is the audit trail from listRecentActivity(): real events only, already
// limited to display-safe fields. Pure and deterministic (the caller passes
// "now"), so every sentence is unit-tested.
import type { ActivityEntry } from "@storevia/tenancy";
import {
  STATUS_LABELS,
  SUBSCRIPTION_STATUSES,
  type SubscriptionStatus,
} from "@storevia/billing/state-machine";
import { BUSINESS_TYPE_DEFINITIONS, isBusinessType } from "@storevia/tenancy/business-types";
import { ROLE_LABELS, isMemberRole } from "@storevia/tenancy/rbac";

/** Picks the icon beside an event. */
export type ActivityCategory =
  "team" | "store" | "catalogue" | "stock" | "plan" | "organisation" | "security" | "other";

export interface ActivityItem {
  readonly id: string;
  /** Who did it: "You", a member's name, "Storevia staff"… */
  readonly actor: string;
  /** What they did, continuing the actor: "invited a new member as Viewer". */
  readonly summary: string;
  /** The two joined, for assistive technology and tests. */
  readonly sentence: string;
  readonly category: ActivityCategory;
  /** ISO timestamp for <time dateTime>. */
  readonly at: string;
  /** "5 minutes ago", "yesterday", "12 Sep". */
  readonly when: string;
  /** The exact time, for a tooltip. */
  readonly exact: string;
}

type Details = ActivityEntry["details"];

function actorName(actor: ActivityEntry["actor"]): string {
  switch (actor.kind) {
    case "you":
      return "You";
    case "member":
      return actor.name ?? "A former member";
    case "staff":
      return "Storevia staff";
    case "app":
      return "An app";
    default:
      return "Storevia";
  }
}

const text = (value: Details[keyof Details]): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

function roleLabel(value: Details[keyof Details]): string | undefined {
  const role = text(value);
  return role && isMemberRole(role) ? ROLE_LABELS[role] : undefined;
}

function typeLabel(value: Details[keyof Details]): string | undefined {
  const type = text(value);
  return type && isBusinessType(type) ? BUSINESS_TYPE_DEFINITIONS[type].label : undefined;
}

/** Plan keys ("business", "enterprise") as names ("Business"). */
function planLabel(value: Details[keyof Details]): string | undefined {
  const plan = text(value);
  if (!plan) return undefined;
  const words = plan.replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function statusLabel(value: Details[keyof Details]): string | undefined {
  const status = text(value);
  return status && (SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
    ? STATUS_LABELS[status as SubscriptionStatus]
    : undefined;
}

const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);
/** "an online store", "a portfolio". */
const article = (label: string) => `${/^[aeiou]/i.test(label) ? "an" : "a"} ${lower(label)}`;
const quoted = (name: string | undefined) => (name ? ` ${name}` : "");
const thePlan = (details: Details) => {
  const plan = planLabel(details.plan);
  return plan ? `the ${plan} plan` : "the plan";
};

const ENTITY_NOUNS: Readonly<Record<string, string>> = {
  Store: "a store",
  Organisation: "the organisation",
  Membership: "the team",
  Invitation: "an invitation",
  Subscription: "the plan",
  OrganisationFeatureOverride: "the plan",
  Product: "a product",
  ProductVariant: "a product",
  Collection: "a collection",
  Location: "a location",
  MediaAsset: "the media library",
};

/** What happened, as the rest of a sentence that starts with the actor. */
function summarise(entry: ActivityEntry): { summary: string; category: ActivityCategory } {
  const d = entry.details;
  const role = roleLabel(d.role);
  switch (entry.action) {
    case "member.invited":
      return {
        summary: role ? `invited a new member as ${role}` : "invited a new member",
        category: "team",
      };
    case "member.invitation_accepted":
      return { summary: role ? `joined the team as ${role}` : "joined the team", category: "team" };
    case "member.invitation_revoked":
      return { summary: "withdrew an invitation", category: "team" };
    case "member.role_changed": {
      const previous = roleLabel(d.previousRole);
      return {
        summary:
          previous && role
            ? `changed a member's role from ${previous} to ${role}`
            : role
              ? `changed a member's role to ${role}`
              : "changed a member's role",
        category: "team",
      };
    }
    case "member.removed":
      return { summary: "removed a member from the team", category: "team" };
    case "member.left":
      return { summary: "left the team", category: "team" };
    case "member.suspended":
      return { summary: "suspended a member", category: "team" };
    case "member.reactivated":
      return { summary: "reactivated a member", category: "team" };
    case "member.store_access_changed":
      return { summary: "changed a member's store access", category: "team" };
    case "store.created": {
      const type = typeLabel(d.businessType);
      return {
        summary: `created the store${quoted(text(d.name))}${type ? ` as ${article(type)}` : ""}`,
        category: "store",
      };
    }
    case "store.updated":
      return { summary: "updated the store's details", category: "store" };
    case "store.business_type_changed": {
      const from = typeLabel(d.previousBusinessType);
      const to = typeLabel(d.businessType);
      return {
        summary:
          from && to
            ? `changed the business type from ${lower(from)} to ${lower(to)}`
            : to
              ? `changed the business type to ${lower(to)}`
              : "changed the business type",
        category: "store",
      };
    }
    case "store.archived":
      return { summary: `archived the store${quoted(text(d.name))}`, category: "store" };
    case "organisation.created":
      return {
        summary: `created the organisation${quoted(text(d.name))}`,
        category: "organisation",
      };
    case "organisation.updated":
      return { summary: "updated the organisation's details", category: "organisation" };
    case "organisation.ownership_transferred":
      return { summary: "transferred ownership of the organisation", category: "organisation" };
    case "billing.subscription.assigned":
      return { summary: `moved the organisation to ${thePlan(d)}`, category: "plan" };
    case "billing.subscription.trial_started": {
      const plan = planLabel(d.plan);
      return { summary: plan ? `started a ${plan} trial` : "started a trial", category: "plan" };
    }
    case "billing.subscription.changed": {
      const from = planLabel(d.previousPlan);
      const to = planLabel(d.plan);
      return {
        summary:
          from && to && from !== to
            ? `changed the plan from ${from} to ${to}`
            : `updated ${thePlan(d)}`,
        category: "plan",
      };
    }
    case "billing.subscription.activated":
      return { summary: `activated ${thePlan(d)}`, category: "plan" };
    case "billing.subscription.cancelled":
      return { summary: `cancelled ${thePlan(d)}`, category: "plan" };
    case "billing.subscription.expired":
      return { summary: `ended ${thePlan(d)}`, category: "plan" };
    case "billing.subscription.superseded":
      return { summary: `replaced ${thePlan(d)}`, category: "plan" };
    case "billing.subscription.synced": {
      const status = statusLabel(d.status);
      return {
        summary: status
          ? `updated the plan's status to ${lower(status)}`
          : "updated the plan's status",
        category: "plan",
      };
    }
    case "product.created":
      return { summary: `added the product${quoted(text(d.title))}`, category: "catalogue" };
    case "product.activated":
      return {
        summary: `made${quoted(text(d.title)) || " a product"} active`,
        category: "catalogue",
      };
    case "product.drafted":
      return {
        summary: `set${quoted(text(d.title)) || " a product"} back to draft`,
        category: "catalogue",
      };
    case "product.archived":
      return { summary: `archived${quoted(text(d.title)) || " a product"}`, category: "catalogue" };
    case "product.restored":
      return { summary: `restored${quoted(text(d.title)) || " a product"}`, category: "catalogue" };
    case "product.updated":
      return { summary: "updated a product's details", category: "catalogue" };
    case "product.options_changed":
    case "product.variants_updated":
      return { summary: "updated a product's variants", category: "catalogue" };
    case "product.media_added":
    case "product.media_removed":
    case "product.media_reordered":
      return { summary: "updated a product's images", category: "catalogue" };
    case "product.exported":
      return { summary: "exported the product list", category: "catalogue" };
    case "collection.created":
      return { summary: `created the collection${quoted(text(d.title))}`, category: "catalogue" };
    case "collection.updated":
      return { summary: `updated the collection${quoted(text(d.title))}`, category: "catalogue" };
    case "collection.archived":
      return { summary: "archived a collection", category: "catalogue" };
    case "collection.restored":
      return { summary: "restored a collection", category: "catalogue" };
    case "collection.products_added":
    case "collection.products_removed":
    case "collection.reordered":
      return { summary: "changed the products in a collection", category: "catalogue" };
    case "media.uploaded":
      return { summary: "uploaded an image", category: "catalogue" };
    case "media.deleted":
      return { summary: "deleted an image", category: "catalogue" };
    case "inventory.adjusted":
      return { summary: "updated stock", category: "stock" };
    case "inventory.moved":
      return { summary: "moved stock between locations", category: "stock" };
    case "inventory.tracking_changed":
      return { summary: "changed stock tracking for a product", category: "stock" };
    case "location.created":
      return { summary: `added the location${quoted(text(d.name))}`, category: "stock" };
    case "location.updated":
      return { summary: `updated the location${quoted(text(d.name))}`, category: "stock" };
    case "location.activated":
      return { summary: "reopened a location", category: "stock" };
    case "location.deactivated":
      return { summary: "closed a location", category: "stock" };
    case "billing.override.created":
    case "billing.override.updated":
    case "billing.override.removed":
      return { summary: "adjusted a plan limit for the organisation", category: "plan" };
    case "billing.usage.reconciled":
      return { summary: "recounted the plan's usage", category: "plan" };
    case "billing.simulation.requested":
    case "billing.simulation.delivered":
      return { summary: "ran a billing test", category: "plan" };
    default: {
      if (entry.action.startsWith("auth.")) {
        return { summary: "changed a security setting", category: "security" };
      }
      const noun = entry.entityType ? ENTITY_NOUNS[entry.entityType] : undefined;
      return { summary: noun ? `made a change to ${noun}` : "made a change", category: "other" };
    }
  }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "just now", "5 minutes ago", "3 hours ago", "yesterday", "4 days ago",
 * then the date ("12 Sep", with the year once it differs from now's).
 */
export function relativeTime(date: Date, now: Date, locale = "en-GB", timeZone = "UTC"): string {
  const elapsed = now.getTime() - date.getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return rtf.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return rtf.format(-Math.floor(elapsed / HOUR), "hour");
  if (elapsed < 7 * DAY) return rtf.format(-Math.floor(elapsed / DAY), "day");
  const year = (d: Date) =>
    new Intl.DateTimeFormat(locale, { timeZone, year: "numeric" }).format(d);
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "numeric",
    month: "short",
    ...(year(date) === year(now) ? {} : { year: "numeric" }),
  }).format(date);
}

export interface DescribeOptions {
  readonly now: Date;
  readonly locale?: string;
  /** The store's time zone, for dates and exact times. */
  readonly timeZone?: string;
}

export function describeActivity(entry: ActivityEntry, options: DescribeOptions): ActivityItem {
  const { now, locale = "en-GB", timeZone = "UTC" } = options;
  const actor = actorName(entry.actor);
  const { summary, category } = summarise(entry);
  return {
    id: entry.id,
    actor,
    summary,
    sentence: `${actor} ${summary}.`,
    category,
    at: entry.occurredAt.toISOString(),
    when: relativeTime(entry.occurredAt, now, locale, timeZone),
    exact: new Intl.DateTimeFormat(locale, {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(entry.occurredAt),
  };
}
