import "server-only";
import {
  grantedFeatures,
  hasPermission,
  listMyOrganisations,
  listStores,
  organisationOf,
  type OrganisationContext,
  type StoreContext,
} from "@storevia/tenancy";
import { BUSINESS_TYPE_DEFINITIONS, storeNavigation } from "@storevia/tenancy/business-types";
import type { ShellAction, ShellData, ShellLink } from "@/components/shell/types";
import { orgPath, storePath } from "./ids";

async function common(ctx: OrganisationContext) {
  const [organisations, stores] = await Promise.all([
    listMyOrganisations(ctx.principal),
    listStores(ctx),
  ]);
  return {
    user: { name: ctx.principal.name, email: ctx.principal.email },
    organisation: {
      id: ctx.organisationId,
      name: ctx.organisationName,
      href: orgPath(ctx.organisationId),
    },
    organisations: organisations.map((o) => ({ id: o.id, label: o.name, href: orgPath(o.id) })),
    stores: stores.map((s) => ({
      id: s.id,
      label: s.name,
      href: storePath(s.id),
      description: BUSINESS_TYPE_DEFINITIONS[s.businessType].label,
    })),
    canCreateStore: hasPermission(ctx, "store.create"),
    createStoreHref: orgPath(ctx.organisationId, "/stores/new"),
  };
}

/** Organisation-level destinations, filtered by permission. */
function organisationLinks(ctx: OrganisationContext, primary: boolean): ShellLink[] {
  const links: ShellLink[] = [
    {
      key: "stores",
      label: primary ? "Stores" : "Overview",
      href: orgPath(ctx.organisationId),
      icon: primary ? "stores" : "organisation",
      primaryOnMobile: true,
      exact: true,
    },
  ];
  if (hasPermission(ctx, "member.read")) {
    links.push({
      key: "members",
      label: "Members",
      href: orgPath(ctx.organisationId, "/members"),
      icon: "members",
      primaryOnMobile: true,
    });
  }
  if (hasPermission(ctx, "billing.read")) {
    links.push({
      key: "billing",
      label: "Billing",
      href: orgPath(ctx.organisationId, "/billing"),
      icon: "billing",
    });
  }
  if (primary) {
    links.push({
      key: "settings",
      label: "Settings",
      href: orgPath(ctx.organisationId, "/settings"),
      icon: "settings",
      primaryOnMobile: true,
    });
  }
  return links;
}

/** Real create actions only, each gated by the permission it needs. */
function createActions(
  ctx: OrganisationContext,
  canCreateStore: boolean,
  organisationScope: boolean,
): ShellAction[] {
  const actions: ShellAction[] = [];
  const members = orgPath(ctx.organisationId, "/members");
  if (hasPermission(ctx, "member.manage")) {
    // In a store, inviting is the everyday action; in the organisation, only on Members.
    actions.push({
      label: "Invite member",
      href: `${members}#invite`,
      under: organisationScope ? members : undefined,
    });
  }
  if (organisationScope && canCreateStore) {
    actions.push({ label: "Create store", href: orgPath(ctx.organisationId, "/stores/new") });
  }
  return actions;
}

/**
 * Store navigation comes from the store's business type (ADR-0024): the type
 * picks and orders the areas, the member's permissions filter them and the
 * plan marks locked ones. Presentation only: every route and action still
 * enforces its own permission and entitlement.
 */
export async function storeShellData(ctx: StoreContext): Promise<ShellData> {
  const organisation = organisationOf(ctx);
  const [base, granted] = await Promise.all([common(organisation), grantedFeatures(ctx)]);
  const links: ShellLink[] = storeNavigation(ctx.storeBusinessType, ctx.permissions, (feature) =>
    granted.has(feature),
  ).map((area) => ({
    key: area.key,
    label: area.label,
    href: storePath(ctx.storeId, area.segment),
    icon: area.key,
    soon: area.availability,
    locked: area.locked,
    primaryOnMobile: area.primaryOnMobile,
    exact: area.segment === "",
  }));
  return {
    ...base,
    store: {
      id: ctx.storeId,
      name: ctx.storeName,
      href: storePath(ctx.storeId),
      kind: BUSINESS_TYPE_DEFINITIONS[ctx.storeBusinessType].label,
    },
    links,
    organisationLinks: organisationLinks(organisation, false),
    createActions: createActions(organisation, base.canCreateStore, false),
  };
}

export async function organisationShellData(ctx: OrganisationContext): Promise<ShellData> {
  const base = await common(ctx);
  return {
    ...base,
    links: organisationLinks(ctx, true),
    organisationLinks: [],
    createActions: createActions(ctx, base.canCreateStore, true),
  };
}
