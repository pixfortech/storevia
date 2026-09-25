// Pure presentation logic for the shell: how the business type's areas are
// grouped, what the phone's bottom bar holds, which create action fits the
// page and where the breadcrumb trail ends. No React or Next here, so it is
// unit-tested directly (navigation.test.ts). It only arranges links the
// server already filtered by permission; it never adds destinations.
import type { ShellAction, ShellData, ShellLink } from "./types";

export function isActive(pathname: string, link: Pick<ShellLink, "href" | "exact">): boolean {
  return link.exact
    ? pathname === link.href
    : pathname === link.href || pathname.startsWith(`${link.href}/`);
}

export type NavGroupKey =
  "overview" | "sell" | "content" | "website" | "grow" | "store" | "organisation";

export interface NavGroup {
  readonly key: NavGroupKey;
  /** Visible heading; Home and the secondary items (Apps, Settings) need none. */
  readonly label?: string | undefined;
  readonly links: readonly ShellLink[];
}

// The heading each store area sits under. The business type still picks and
// orders the areas (ADR-0024); this only decides the headings.
const AREA_GROUP: ReadonlyMap<string, NavGroupKey> = new Map([
  ["home", "overview"],
  ["orders", "sell"],
  ["products", "sell"],
  ["inventory", "sell"],
  ["customers", "sell"],
  ["posts", "content"],
  ["categories", "content"],
  ["authors", "content"],
  ["projects", "content"],
  ["blog", "content"],
  ["media", "content"],
  ["website", "website"],
  ["pages", "website"],
  ["marketing", "grow"],
  ["analytics", "grow"],
  ["apps", "store"],
  ["settings", "store"],
]);

const GROUP_ORDER: readonly NavGroupKey[] = [
  "overview",
  "sell",
  "content",
  "website",
  "grow",
  "store",
];

const GROUP_LABEL: Partial<Record<NavGroupKey, string>> = {
  sell: "Sell",
  content: "Content",
  website: "Website",
  grow: "Grow",
  organisation: "Organisation",
};

/**
 * Store navigation in groups: Overview, then Sell or Content, then Website,
 * then Grow, then Apps and Settings, then the organisation's links.
 * Organisation pages keep their short list as one group without a heading.
 */
export function navigationGroups(
  data: Pick<ShellData, "store" | "links" | "organisationLinks">,
): NavGroup[] {
  if (!data.store) {
    return data.links.length > 0 ? [{ key: "organisation", links: data.links }] : [];
  }
  const buckets = new Map<NavGroupKey, ShellLink[]>();
  for (const link of data.links) {
    // An area this map doesn't know yet still shows, with the secondary items.
    const key = AREA_GROUP.get(link.key) ?? "store";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(link);
    else buckets.set(key, [link]);
  }
  const groups: NavGroup[] = [];
  for (const key of GROUP_ORDER) {
    const links = buckets.get(key);
    if (links) groups.push({ key, label: GROUP_LABEL[key], links });
  }
  if (data.organisationLinks.length > 0) {
    groups.push({
      key: "organisation",
      label: GROUP_LABEL.organisation,
      links: data.organisationLinks,
    });
  }
  return groups;
}

/**
 * The phone's bottom bar (design plan §12): Home, the type's primary area,
 * Create (centre, drawn by the bar when there is something to create),
 * Website and More. `start` goes before Create and `end` after it.
 * - Home: the store home, or the organisation's overview.
 * - Primary: the first of the type's mobile areas that isn't Home or Website
 *   (Orders for an online store, Pages for a business website, Posts for a
 *   publication, Projects for a portfolio).
 * - Fourth: Website where the member has it, otherwise the next mobile area.
 * Everything, including these, is also in the More sheet.
 */
export function bottomBarTabs(links: readonly ShellLink[]): {
  start: ShellLink[];
  end: ShellLink[];
} {
  const home = links.find((l) => l.key === "home") ?? links.find((l) => l.exact) ?? links[0];
  const rest = links.filter((l) => l !== home);
  const primary = rest.find((l) => l.primaryOnMobile && l.key !== "website");
  const fourth =
    rest.find((l) => l.key === "website") ?? rest.find((l) => l.primaryOnMobile && l !== primary);
  return {
    start: [home, primary].filter((l): l is ShellLink => l !== undefined),
    end: fourth ? [fourth] : [],
  };
}

/**
 * The create action that fits this page, or none where the page already
 * offers it (its own page, or one listed in `offeredOn`): one primary
 * action per screen.
 */
export function fittingCreateAction(
  actions: readonly ShellAction[],
  pathname: string,
): ShellAction | undefined {
  const fitting = actions
    .filter((a) => !a.sheetOnly)
    .filter((a) => a.under === undefined || isActive(pathname, { href: a.under }))
    .sort((a, b) => (b.under?.length ?? 0) - (a.under?.length ?? 0))[0];
  if (!fitting) return undefined;
  const pageOffersIt =
    fitting.href.split("#")[0] === pathname || (fitting.offeredOn ?? []).includes(pathname);
  return pageOffersIt ? undefined : fitting;
}

export interface Crumb {
  readonly label: string;
  /** Omitted for the current page. */
  readonly href?: string;
}

// Pages below a section that no navigation link names.
const LEAF_LABELS: ReadonlyMap<string, string> = new Map([["/stores/new", "Create store"]]);

/** Organisation › store › section, ending at the current page. */
export function breadcrumbTrail(
  data: Pick<ShellData, "organisation" | "store" | "links" | "organisationLinks">,
  pathname: string,
): Crumb[] {
  const scopeHome = data.store?.href ?? data.organisation.href;
  const section = [...data.links, ...data.organisationLinks]
    .filter((l) => l.href !== scopeHome)
    .find((l) => isActive(pathname, l));
  const leaf = section ? undefined : LEAF_LABELS.get(pathname.slice(scopeHome.length));
  const trail: { label: string; href: string }[] = [
    { label: data.organisation.name, href: data.organisation.href },
    ...(data.store ? [{ label: data.store.name, href: data.store.href }] : []),
    ...(section ? [{ label: section.label, href: section.href }] : []),
    ...(leaf ? [{ label: leaf, href: pathname }] : []),
  ];
  return trail.map((crumb, index) => (index === trail.length - 1 ? { label: crumb.label } : crumb));
}

/** A quiet status for a destination: "Soon" for unbuilt areas, the plan lock otherwise. */
export function linkStatus(link: Pick<ShellLink, "soon" | "locked">): string | undefined {
  const parts = [link.soon ? "Soon" : null, link.locked ? "Not in your plan" : null];
  const text = parts.filter((p): p is string => p !== null).join(" · ");
  return text || undefined;
}
