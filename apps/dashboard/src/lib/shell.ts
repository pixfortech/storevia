import "server-only";
import {
  hasPermission,
  listMyOrganisations,
  listStores,
  organisationOf,
  type OrganisationContext,
  type StoreContext,
} from "@storevia/tenancy";
import type { ShellData, ShellLink } from "@/components/shell/types";
import { orgPath, storePath } from "./ids";
import { visibleNav } from "./navigation";

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
      description: s.primaryHostname ?? undefined,
    })),
    canCreateStore: hasPermission(ctx, "store.create"),
    createStoreHref: orgPath(ctx.organisationId, "/stores/new"),
  };
}

export async function storeShellData(ctx: StoreContext): Promise<ShellData> {
  const links: ShellLink[] = visibleNav(ctx.permissions).map((item) => ({
    key: item.key,
    label: item.label,
    href: storePath(ctx.storeId, item.segment),
    icon: item.icon,
    badge: item.availability ? "Soon" : undefined,
    primaryOnMobile: item.primaryOnMobile,
  }));
  return {
    ...(await common(organisationOf(ctx))),
    store: { id: ctx.storeId, name: ctx.storeName, href: storePath(ctx.storeId) },
    links,
  };
}

export async function organisationShellData(ctx: OrganisationContext): Promise<ShellData> {
  const links: ShellLink[] = [
    {
      key: "stores",
      label: "Stores",
      href: orgPath(ctx.organisationId),
      icon: "stores",
      primaryOnMobile: true,
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
  links.push({
    key: "settings",
    label: "Settings",
    href: orgPath(ctx.organisationId, "/settings"),
    icon: "settings",
    primaryOnMobile: true,
  });
  return { ...(await common(ctx)), links };
}
