import "server-only";
import {
  getAllowance,
  getOrganisationBilling,
  grantedFeatures,
  hasPermission,
  listMyOrganisations,
  listStores,
  organisationOf,
  type OrganisationContext,
  type StoreContext,
} from "@storevia/tenancy";
import { BUSINESS_TYPE_DEFINITIONS, storeNavigation } from "@storevia/tenancy/business-types";
import { atLimit, planIndicator } from "@/components/shell/plan";
import type { ShellAction, ShellData, ShellLink } from "@/components/shell/types";
import { BUSINESS_TYPE_GLYPH } from "./business-types";
import { orgPath, storePath } from "./ids";

async function common(ctx: OrganisationContext) {
  const mayCreateStore = hasPermission(ctx, "store.create");
  const mayReadBilling = hasPermission(ctx, "billing.read");
  const billingHref = orgPath(ctx.organisationId, "/billing");
  const [organisations, stores, billing, storeAllowance] = await Promise.all([
    listMyOrganisations(ctx.principal),
    listStores(ctx),
    // The plan indicator is for members who may read billing; others get none.
    mayReadBilling ? getOrganisationBilling(ctx) : null,
    // Billing already carries the store line; otherwise read that line alone.
    mayCreateStore && !mayReadBilling ? getAllowance(ctx, "store_count") : null,
  ]);
  // A hint only, like the store list's: createStore enforces the limit on the
  // server. At the limit the shell stops offering "Create store" (a dead end).
  const storeLimitReached =
    mayCreateStore &&
    atLimit(billing?.usage.find((line) => line.key === "store_count") ?? storeAllowance);
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
      glyph: BUSINESS_TYPE_GLYPH[s.businessType],
    })),
    canCreateStore: mayCreateStore && !storeLimitReached,
    createStoreHref: orgPath(ctx.organisationId, "/stores/new"),
    storeLimit: storeLimitReached ? { href: mayReadBilling ? billingHref : undefined } : undefined,
    plan: billing ? planIndicator(billing, billingHref) : undefined,
  };
}

/** Organisation-level destinations, filtered by permission. */
function organisationLinks(ctx: OrganisationContext, primary: boolean): ShellLink[] {
  const links: ShellLink[] = [
    {
      // "Stores" in either scope, as the page's own heading says.
      key: "stores",
      label: "Stores",
      href: orgPath(ctx.organisationId),
      icon: "stores",
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
function createActionsFor(
  ctx: OrganisationContext,
  canCreateStore: boolean,
  organisationScope: boolean,
): ShellAction[] {
  const actions: ShellAction[] = [];
  const members = orgPath(ctx.organisationId, "/members");
  if (hasPermission(ctx, "member.manage")) {
    // In a store, inviting is the everyday action; in the organisation, only on Members.
    actions.push({
      key: "invite-member",
      label: "Invite member",
      description: `Give someone access to ${ctx.organisationName}, with the role they need.`,
      href: `${members}#invite`,
      under: organisationScope ? members : undefined,
    });
  }
  if (canCreateStore) {
    actions.push({
      key: "create-store",
      label: "Create store",
      description: "Add an online store, business website, publication or portfolio.",
      href: orgPath(ctx.organisationId, "/stores/new"),
      // Inside a store the page's action stays "Invite member"; creating
      // another store is offered in the Create sheet and the command menu.
      sheetOnly: !organisationScope,
      // The store list has its own "Create store" button.
      offeredOn: [orgPath(ctx.organisationId)],
    });
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
  const areas: ShellLink[] = storeNavigation(ctx.storeBusinessType, ctx.permissions, (feature) =>
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
  // Apps sit with Settings: an honest placeholder (no app catalogue exists).
  const apps: ShellLink = {
    key: "apps",
    label: "Apps",
    href: storePath(ctx.storeId, "/apps"),
    icon: "apps",
    soon: "On the roadmap",
  };
  const settings = areas.findIndex((area) => area.key === "settings");
  const links =
    settings === -1
      ? [...areas, apps]
      : [...areas.slice(0, settings), apps, ...areas.slice(settings)];
  const createActions = createActionsFor(organisation, base.canCreateStore, false);
  if (hasPermission(ctx, "product.create") && ctx.storeStatus !== "ARCHIVED") {
    // Offered on the catalogue's pages; the product list and form show it themselves.
    const products = storePath(ctx.storeId, "/products");
    createActions.unshift({
      key: "create-product",
      label: "Add product",
      description: "A product with its price, stock and images.",
      href: `${products}/new`,
      under: products,
      offeredOn: [products, `${products}/new`],
    });
  }
  return {
    ...base,
    store: {
      id: ctx.storeId,
      name: ctx.storeName,
      href: storePath(ctx.storeId),
      kind: BUSINESS_TYPE_DEFINITIONS[ctx.storeBusinessType].label,
      glyph: BUSINESS_TYPE_GLYPH[ctx.storeBusinessType],
    },
    links,
    organisationLinks: organisationLinks(organisation, false),
    createActions,
  };
}

export async function organisationShellData(ctx: OrganisationContext): Promise<ShellData> {
  const base = await common(ctx);
  return {
    ...base,
    links: organisationLinks(ctx, true),
    organisationLinks: [],
    createActions: createActionsFor(ctx, base.canCreateStore, true),
  };
}
