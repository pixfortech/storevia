// The store home's identity header and "Get set up" steps. Pure: every step
// stays permission-gated exactly as before, and completion is shown only
// where Storevia can know it (never assumed).
import {
  BUSINESS_TYPE_DEFINITIONS,
  STORE_AREAS,
  type BusinessType,
} from "@storevia/tenancy/business-types";
import type { Permission } from "@storevia/tenancy/rbac";
import { orgPath, storePath } from "@/lib/ids";

export type StoreStatus = "DRAFT" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";

/** A store's status as a badge. Words carry the meaning; the tone supports them. */
export function storeStatusBadge(status: StoreStatus): {
  label: string;
  tone: "neutral" | "success" | "warning";
} {
  switch (status) {
    case "ACTIVE":
      return { label: "Active", tone: "success" };
    case "SUSPENDED":
      return { label: "Suspended", tone: "warning" };
    case "ARCHIVED":
      return { label: "Archived", tone: "neutral" };
    default:
      return { label: "Not launched", tone: "neutral" };
  }
}

/**
 * When the storefront engine serves sites (docs/roadmap, "Milestone 4 —
 * Storefront engine"). It has no store area of its own, so it is named here
 * once; the builder's schedule comes from STORE_AREAS.
 */
export const STOREFRONT_LAUNCH = "Milestone 4";

/** When a store's web address starts working, and when the builder arrives. */
export function websiteLaunchNote(): string {
  const builder = STORE_AREAS.website.availability;
  const reach = `Visitors can reach this address once storefronts launch in ${STOREFRONT_LAUNCH}.`;
  return builder ? `${reach} The site builder arrives in ${builder}.` : reach;
}

/** "Welcome back, Priya." from the member's display name. */
export function greeting(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Welcome back, ${first}.` : "Welcome back.";
}

export interface SetupTask {
  readonly key: "create-store" | "store-details" | "invite-team" | "business-type";
  readonly title: string;
  readonly description: string;
  /** Known to be done. Steps Storevia can't check stay open. */
  readonly done: boolean;
  readonly href?: string;
  readonly action?: string;
}

export interface SetupInput {
  readonly storeId: string;
  readonly organisationId: string;
  readonly storeName: string;
  readonly businessType: BusinessType;
  readonly permissions: ReadonlySet<Permission>;
  /** Active members of the organisation, when the member may read the team. */
  readonly memberCount: number | null;
}

export function setupTasks({
  storeId,
  organisationId,
  storeName,
  businessType,
  permissions,
  memberCount,
}: SetupInput): SetupTask[] {
  const definition = BUSINESS_TYPE_DEFINITIONS[businessType];
  const type = definition.label.toLowerCase();
  const canUpdate = permissions.has("store.update");
  const presets = definition.rolePresets.filter((p) => p.role !== "ADMIN" && p.role !== "VIEWER");
  const tasks: SetupTask[] = [
    {
      key: "create-store",
      title: "Create your store",
      description: `${storeName} is set up as ${type}.`,
      done: true,
    },
    {
      key: "store-details",
      title: "Check your store details",
      description: "Name, language, time zone and contact emails.",
      done: false,
      href: storePath(storeId, "/settings"),
      action: canUpdate ? "Review" : "View",
    },
  ];
  if (permissions.has("member.manage")) {
    tasks.push({
      key: "invite-team",
      title: "Invite your team",
      description:
        presets.length > 0
          ? `Suggested for ${type}: ${presets
              .slice(0, 3)
              .map((p) => p.label.toLowerCase())
              .join(", ")}.`
          : "Give teammates the access they need.",
      // Someone besides the owner has joined: the step is done.
      done: memberCount !== null && memberCount > 1,
      href: orgPath(organisationId, "/members#invite"),
      action: "Invite",
    });
  }
  if (canUpdate) {
    tasks.push({
      key: "business-type",
      title: "Confirm what you're building",
      description: "Your business type shapes navigation and suggestions. Change it any time.",
      done: false,
      href: storePath(storeId, "/settings#business-type"),
      action: "Change",
    });
  }
  return tasks;
}
