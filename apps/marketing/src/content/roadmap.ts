// The public roadmap, milestone by milestone, in delivery order. It follows
// docs/roadmap/implementation-roadmap.md and agrees with capabilities.ts:
// update a stage's status in the same change that ships it. Order may change
// and no dates are promised.
import type { Status } from "./capabilities";

export interface RoadmapStage {
  readonly id: string;
  /** "Milestones 0–2.5", "Milestone 3". */
  readonly milestone: string;
  readonly title: string;
  readonly status: Status;
  readonly summary: string;
  readonly items: readonly string[];
}

export const ROADMAP: readonly RoadmapStage[] = [
  {
    id: "foundations",
    milestone: "Milestones 0–2.5",
    title: "Foundations",
    status: "available",
    summary: "Everything a business needs before it sells: accounts, teams, stores and plans.",
    items: [
      "Accounts with email verification, signed-in devices and password confirmation",
      "Organisations, stores and business types",
      "Team members, invitations, roles and store-level access",
      "Plans, usage limits and the responsive dashboard",
    ],
  },
  {
    id: "catalogue",
    milestone: "Milestone 3",
    title: "Catalogue",
    status: "in-development",
    summary: "Real product data, built for real stock.",
    items: [
      "Products, options and variants",
      "Collections and a media library",
      "Inventory by location, with a movement history",
      "A catalogue API",
    ],
  },
  {
    id: "storefront",
    milestone: "Milestone 4",
    title: "Storefront",
    status: "roadmap",
    summary: "Stores become visible on the web.",
    items: [
      "Your store at its Storevia address",
      "A default theme, product pages, cart and search",
    ],
  },
  {
    id: "builder",
    milestone: "Milestone 5",
    title: "Visual builder",
    status: "roadmap",
    summary: "Design every page yourself.",
    items: [
      "Drag-and-drop pages with responsive editing",
      "Autosave, drafts, publishing and history",
    ],
  },
  {
    id: "checkout",
    milestone: "Milestone 6",
    title: "Checkout and orders",
    status: "roadmap",
    summary: "Stores take orders.",
    items: ["Checkout, payments and orders", "Customers, discounts, refunds and fulfilment"],
  },
  {
    id: "domains-themes",
    milestone: "Milestone 7",
    title: "Domains and themes",
    status: "roadmap",
    summary: "Your own address and your own look.",
    items: ["Custom domains with automatic HTTPS", "Theme customisation and a second theme"],
  },
  {
    id: "launch",
    milestone: "Milestone 8",
    title: "Launch readiness",
    status: "roadmap",
    summary: "The last checks before a public launch.",
    items: [
      "An external security review and performance budgets",
      "Data export, account deletion and two-step sign-in",
    ],
  },
];
