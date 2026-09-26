// Storevia's release history, newest first, compiled from the repository:
// every entry is a milestone tag or a group of commits in `git log`, dated by
// its commit date (UTC). Add an entry when a release lands; never add one for
// work that hasn't been committed.

export interface Release {
  /** Anchor on /changelog. */
  readonly id: string;
  /** Commit date, YYYY-MM-DD (UTC). For work in progress, the date it started. */
  readonly date: string;
  /** "Milestone 2", "Design", "Engineering". */
  readonly label: string;
  readonly title: string;
  readonly status: "released" | "in-progress";
  readonly summary: string;
  readonly changes: readonly string[];
  /** The git tag that marks the release, when there is one. */
  readonly tag?: string;
}

export const RELEASES: readonly Release[] = [
  {
    id: "milestone-3",
    date: "2026-09-25",
    label: "Milestone 3",
    title: "Catalogue, inventory and media",
    status: "released",
    tag: "milestone-3",
    summary:
      "Stores get real product data: products with variants, stock by location with a full history, and a media library.",
    changes: [
      "Products with descriptions, options, variants, prices, SKUs and barcodes, saved as drafts until you activate them, and archived rather than deleted",
      "Collections you arrange by hand",
      "Stock by location, with every change recorded with its reason, note and who made it",
      "A media library that checks each file is the image it claims to be, removes hidden location data and resizes it for every screen",
      "Search, filters, bulk editing with a report of anything that couldn't change, and CSV export",
      "Product and media limits enforced by plan, and real product and stock counts on each store's home",
    ],
  },
  {
    id: "redesign",
    date: "2026-09-24",
    label: "Design",
    title: "A new look for Storevia",
    status: "in-progress",
    summary:
      "A visual reset of every surface, starting from a new design system. The marketing site, the dashboard and the staff tools are being redesigned on it now.",
    changes: [
      "A design system of type, colour, icons, charts and motion, with every text colour pair tested for accessible contrast",
      "The Storevia mark redrawn as a vector, and a set of product glyphs and line illustrations in the same style",
      "A recent-activity service for each store's home in the dashboard",
    ],
  },
  {
    id: "toolchain",
    date: "2026-09-24",
    label: "Engineering",
    title: "Up-to-date foundations",
    status: "released",
    summary:
      "A written policy that keeps Storevia's runtime and dependencies current, with every update tested before it lands.",
    changes: [
      "An evergreen runtime policy, tested on every supported Node.js version and on Windows",
      "Automated dependency updates that wait for new releases to settle, then pass the full test suite",
    ],
  },
  {
    id: "milestone-2-5",
    date: "2026-09-24",
    label: "Milestone 2.5",
    title: "Business types, background jobs and the public site",
    status: "released",
    summary:
      "Stores learned what they are, the platform learned to work in the background, and Storevia got its public website.",
    changes: [
      "Business types for each store (online store, business website, publication or portfolio), shaping navigation, the store's home and suggested roles",
      "Five new roles for business types: inventory manager, site manager, content manager, editor and author",
      "Onboarding by business type and a dashboard designed for desktop, tablet and phone",
      "Background jobs that end expired subscriptions and keep usage counts accurate",
      "The public site, with pricing read from the live plan catalogue and a working contact form",
      "Clearer staff tools, with a risk summary and confirmation before high-risk actions",
    ],
  },
  {
    id: "milestone-2",
    date: "2026-09-24",
    label: "Milestone 2",
    title: "Plans, limits and subscriptions",
    status: "released",
    tag: "milestone-2",
    summary:
      "The commercial control plane: plans are data, limits are enforced, and subscriptions can come from any source.",
    changes: [
      "Plans and features stored as data, so pricing changes need no code",
      "Store and team-member limits enforced by plan, safely under concurrent changes",
      "Subscriptions set up by our team, with a test billing pipeline ready for a payment provider",
      "A billing page in the dashboard showing your plan and usage",
      "Fixes from an independent security review, each with a regression test",
    ],
  },
  {
    id: "milestone-1",
    date: "2026-09-24",
    label: "Milestone 1",
    title: "Accounts, teams and the dashboard",
    status: "released",
    tag: "milestone-1",
    summary: "Sign up, create an organisation and a store, and invite your team, securely.",
    changes: [
      "Accounts with email verification, password reset and signed-in devices",
      "Organisations, stores, memberships, invitations and roles",
      "Each organisation's data isolated in the database, with an isolation test suite run on every change",
      "The merchant dashboard with team management",
      "Password confirmation before sensitive actions",
    ],
  },
  {
    id: "milestone-0",
    date: "2026-09-24",
    label: "Milestone 0",
    title: "Architecture",
    status: "released",
    tag: "milestone-0",
    summary:
      "The plan before the product: architecture, data model, security model and roadmap, reviewed and approved.",
    changes: [
      "Architecture decisions recorded for every foundational choice",
      "The data model, the threat model and the milestone roadmap",
      "Repository tooling and continuous integration",
    ],
  },
];

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "24 September 2026". */
export function formatReleaseDate(date: string): string {
  return DATE.format(new Date(`${date}T00:00:00Z`));
}

export interface ReleaseDay {
  /** YYYY-MM-DD. */
  readonly date: string;
  readonly releases: readonly Release[];
}

/**
 * Releases grouped by the day they landed, newest first. Several releases
 * can share a day (the foundations landed together), and a timeline shows
 * that day once instead of repeating it on every entry.
 */
export function releasesByDay(releases: readonly Release[] = RELEASES): ReleaseDay[] {
  const days: { date: string; releases: Release[] }[] = [];
  for (const release of releases) {
    const last = days.at(-1);
    if (last?.date === release.date) last.releases.push(release);
    else days.push({ date: release.date, releases: [release] });
  }
  return days;
}

/** Labels of the releases marked by a git tag ("Milestone 0", …), oldest first. */
export function taggedMilestones(releases: readonly Release[] = RELEASES): string[] {
  return releases
    .filter((release) => release.tag)
    .map((release) => release.label)
    .reverse();
}
