import { describe, expect, it } from "vitest";
import {
  bottomBarTabs,
  breadcrumbTrail,
  fittingCreateAction,
  isActive,
  linkStatus,
  navigationGroups,
} from "./navigation";
import type { ShellAction, ShellData, ShellLink } from "./types";

const STORE = "/s/store_1";
const ORG = "/o/org_1";

function area(key: string, extra: Partial<ShellLink> = {}): ShellLink {
  return {
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    href: key === "home" ? STORE : `${STORE}/${key}`,
    icon: "home",
    exact: key === "home",
    ...extra,
  };
}

const orgLinks: ShellLink[] = [
  { key: "stores", label: "Stores", href: ORG, icon: "stores", exact: true },
  { key: "members", label: "Members", href: `${ORG}/members`, icon: "members" },
  { key: "billing", label: "Billing", href: `${ORG}/billing`, icon: "billing" },
];

const organisation = { id: "org_1", name: "Acme Supplies", href: ORG };
const store = {
  id: "store_1",
  name: "Acme Flagship",
  href: STORE,
  kind: "Online store",
  glyph: "online-store" as const,
};

// The online store's navigation as lib/shell.ts builds it for an owner.
const ecommerce = [
  area("home", { primaryOnMobile: true }),
  area("orders", { primaryOnMobile: true, soon: "Milestone 6" }),
  area("products", { primaryOnMobile: true, soon: "Milestone 3" }),
  area("inventory"),
  area("customers"),
  area("website", { soon: "Milestone 5", locked: true }),
  area("pages"),
  area("marketing"),
  area("analytics", { locked: true }),
  area("apps", { soon: "On the roadmap" }),
  area("settings"),
];

const keys = (links: readonly ShellLink[]) => links.map((l) => l.key);

describe("navigationGroups", () => {
  it("groups an online store as Overview, Sell, Website, Grow, then Apps and Settings", () => {
    const groups = navigationGroups({ store, links: ecommerce, organisationLinks: orgLinks });
    expect(groups.map((g) => [g.key, g.label, keys(g.links)])).toEqual([
      ["overview", undefined, ["home"]],
      ["sell", "Sell", ["orders", "products", "inventory", "customers"]],
      ["website", "Website", ["website", "pages"]],
      ["grow", "Grow", ["marketing", "analytics"]],
      ["store", undefined, ["apps", "settings"]],
      ["organisation", "Organisation", ["stores", "members", "billing"]],
    ]);
  });

  it("puts a publication's writing under Content, keeping the type's order", () => {
    const links = ["home", "posts", "categories", "authors", "pages", "media", "website"].map(
      (key) => area(key),
    );
    const groups = navigationGroups({ store, links, organisationLinks: [] });
    expect(groups.map((g) => [g.key, keys(g.links)])).toEqual([
      ["overview", ["home"]],
      ["content", ["posts", "categories", "authors", "media"]],
      ["website", ["pages", "website"]],
    ]);
  });

  it("only arranges the links it is given (permission filtering happens on the server)", () => {
    const viewer = ["home", "products", "analytics", "settings"].map((key) => area(key));
    const groups = navigationGroups({ store, links: viewer, organisationLinks: [] });
    expect(groups.flatMap((g) => keys(g.links))).toEqual(keys(viewer));
    expect(groups.map((g) => g.key)).toEqual(["overview", "sell", "grow", "store"]);
  });

  it("keeps an area it doesn't know, with the secondary items", () => {
    const links = [area("home"), area("reviews"), area("settings")];
    const groups = navigationGroups({ store, links, organisationLinks: [] });
    expect(groups.at(-1)).toMatchObject({ key: "store" });
    expect(keys(groups.at(-1)?.links ?? [])).toEqual(["reviews", "settings"]);
  });

  it("shows organisation pages as one list without a heading", () => {
    const groups = navigationGroups({ store: undefined, links: orgLinks, organisationLinks: [] });
    expect(groups).toEqual([{ key: "organisation", links: orgLinks }]);
  });
});

describe("bottomBarTabs", () => {
  const byType = (mobile: string[], all: string[]) =>
    all.map((key) => area(key, { primaryOnMobile: mobile.includes(key) }));

  it.each([
    ["an online store", ["home", "orders", "products"], ecommerce.map((l) => l.key), "orders"],
    [
      "a business website",
      ["home", "website", "pages"],
      ["home", "website", "pages", "blog", "media", "analytics", "settings"],
      "pages",
    ],
    [
      "a publication",
      ["home", "posts", "pages"],
      ["home", "posts", "categories", "authors", "pages", "media", "website", "settings"],
      "posts",
    ],
    [
      "a portfolio",
      ["home", "projects", "media"],
      ["home", "projects", "media", "pages", "blog", "website", "analytics", "settings"],
      "projects",
    ],
  ])("%s: Home, its primary area, then Website", (_type, mobile, all, primary) => {
    const { start, end } = bottomBarTabs(byType(mobile, all));
    expect(keys(start)).toEqual(["home", primary]);
    expect(keys(end)).toEqual(["website"]);
  });

  it("falls back to the next mobile area when the member has no Website", () => {
    const viewer = byType(["home", "orders", "products"], ["home", "products", "analytics"]);
    const { start, end } = bottomBarTabs(viewer);
    expect(keys(start)).toEqual(["home", "products"]);
    expect(end).toEqual([]);
  });

  it("uses the organisation's overview as Home on organisation pages", () => {
    const links: ShellLink[] = [
      {
        key: "stores",
        label: "Stores",
        href: ORG,
        icon: "stores",
        exact: true,
        primaryOnMobile: true,
      },
      {
        key: "members",
        label: "Members",
        href: `${ORG}/members`,
        icon: "members",
        primaryOnMobile: true,
      },
      { key: "billing", label: "Billing", href: `${ORG}/billing`, icon: "billing" },
      {
        key: "settings",
        label: "Settings",
        href: `${ORG}/settings`,
        icon: "settings",
        primaryOnMobile: true,
      },
    ];
    const { start, end } = bottomBarTabs(links);
    expect(keys(start)).toEqual(["stores", "members"]);
    expect(keys(end)).toEqual(["settings"]);
  });

  it("never repeats a destination and copes with no links", () => {
    expect(bottomBarTabs([])).toEqual({ start: [], end: [] });
    const only = [area("home", { primaryOnMobile: true })];
    expect(bottomBarTabs(only)).toEqual({ start: only, end: [] });
  });
});

describe("fittingCreateAction", () => {
  const invite: ShellAction = {
    key: "invite-member",
    label: "Invite member",
    description: "",
    href: `${ORG}/members#invite`,
    under: `${ORG}/members`,
  };
  const createStore: ShellAction = {
    key: "create-store",
    label: "Create store",
    description: "",
    href: `${ORG}/stores/new`,
  };

  it("prefers the most specific action for the page", () => {
    expect(fittingCreateAction([invite, createStore], `${ORG}/members/roles`)).toBe(invite);
    expect(fittingCreateAction([invite, createStore], `${ORG}/billing`)).toBe(createStore);
  });

  it("offers nothing on the action's own page (it has its own form there)", () => {
    expect(fittingCreateAction([invite, createStore], `${ORG}/members`)).toBeUndefined();
    expect(fittingCreateAction([createStore], `${ORG}/stores/new`)).toBeUndefined();
  });

  it("doesn't repeat an action on a page that shows it already", () => {
    const listed = { ...createStore, offeredOn: [ORG] };
    expect(fittingCreateAction([invite, listed], ORG)).toBeUndefined();
    expect(fittingCreateAction([invite, listed], `${ORG}/billing`)).toBe(listed);
  });

  it("never offers a sheet-only action as the page's primary action", () => {
    const sheetOnly = { ...createStore, sheetOnly: true };
    expect(fittingCreateAction([sheetOnly], STORE)).toBeUndefined();
    const everywhere = { ...invite, under: undefined };
    expect(fittingCreateAction([everywhere, sheetOnly], STORE)).toBe(everywhere);
  });
});

describe("breadcrumbTrail", () => {
  const data: Pick<ShellData, "organisation" | "store" | "links" | "organisationLinks"> = {
    organisation,
    store,
    links: ecommerce,
    organisationLinks: orgLinks,
  };

  it("ends at the store on its home page", () => {
    expect(breadcrumbTrail(data, STORE)).toEqual([
      { label: "Acme Supplies", href: ORG },
      { label: "Acme Flagship" },
    ]);
  });

  it("adds the section, linking the levels above it", () => {
    expect(breadcrumbTrail(data, `${STORE}/settings`)).toEqual([
      { label: "Acme Supplies", href: ORG },
      { label: "Acme Flagship", href: STORE },
      { label: "Settings" },
    ]);
  });

  it("names organisation pages, including ones below a section", () => {
    const org = { organisation, store: undefined, links: orgLinks, organisationLinks: [] };
    expect(breadcrumbTrail(org, ORG)).toEqual([{ label: "Acme Supplies" }]);
    expect(breadcrumbTrail(org, `${ORG}/members`)).toEqual([
      { label: "Acme Supplies", href: ORG },
      { label: "Members" },
    ]);
    expect(breadcrumbTrail(org, `${ORG}/stores/new`)).toEqual([
      { label: "Acme Supplies", href: ORG },
      { label: "Create store" },
    ]);
  });
});

describe("isActive and linkStatus", () => {
  it("matches section homes exactly and sections by prefix", () => {
    expect(isActive(`${STORE}/settings`, { href: STORE, exact: true })).toBe(false);
    expect(isActive(`${STORE}/settings/x`, { href: `${STORE}/settings` })).toBe(true);
    expect(isActive(`${STORE}/settingsx`, { href: `${STORE}/settings` })).toBe(false);
  });

  it("says Soon for unbuilt areas, never a milestone", () => {
    expect(linkStatus({ soon: "Milestone 6" })).toBe("Soon");
    expect(linkStatus({ soon: "a later release", locked: true })).toBe("Soon · Not in your plan");
    expect(linkStatus({ locked: true })).toBe("Not in your plan");
    expect(linkStatus({})).toBeUndefined();
  });
});
