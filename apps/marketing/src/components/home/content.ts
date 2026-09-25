// The home page's words. Statuses come from content/capabilities.ts and
// content/plan-features.ts, so the home page can't claim more than the
// product delivers; where a part has no capability of its own it takes the
// status of the capability it ships with.
import type { GlyphName } from "@storevia/ui";
import { capability, type Status } from "@/content/capabilities";
import { FEATURE_STATUS } from "@/content/plan-features";

export interface HomeItem {
  readonly title: string;
  readonly description: string;
  readonly status: Status;
  readonly glyph: GlyphName;
}

const commerce = capability("commerce");
const builder = capability("builder");
const content = capability("content");
const analytics = capability("analytics");
const teams = capability("teams");

/** 03: the six parts of the platform. */
export const PLATFORM: readonly HomeItem[] = [
  {
    title: "Website",
    description: "Design pages visually for every screen, then publish on your own domain.",
    status: builder.status,
    glyph: "website",
  },
  {
    title: "Commerce",
    description: "Products, variants and stock by location, then checkout and orders.",
    status: commerce.status,
    glyph: "commerce",
  },
  {
    title: "Content",
    description: "Posts, pages, categories and authors for publishers and businesses.",
    status: content.status,
    glyph: "content",
  },
  {
    title: "Customers",
    description: "Customer records, addresses and order history, arriving with checkout.",
    // Customers ship with orders, after the catalogue.
    status: "roadmap",
    glyph: "orders",
  },
  {
    title: "Analytics",
    description: "Traffic, engagement and sales reports, with history set by your plan.",
    status: analytics.status,
    glyph: "analytics",
  },
  {
    title: "Teams",
    description: "Invite your team and give everyone exactly the access they need.",
    status: teams.status,
    glyph: "teams",
  },
];

/** 07: commerce, part by part. */
export const COMMERCE_PARTS: readonly { title: string; status: Status }[] = [
  { title: "Products and collections", status: commerce.status },
  { title: "Options and variants", status: commerce.status },
  { title: "Inventory by location", status: commerce.status },
  { title: "Media library", status: FEATURE_STATUS.media_storage },
  { title: "Checkout and orders", status: "roadmap" },
  { title: "Customers", status: "roadmap" },
  { title: "Discounts", status: FEATURE_STATUS.discounts },
  { title: "Sales analytics", status: FEATURE_STATUS.analytics },
];

/** 06: what each numbered marker on the editor points at. */
export const BUILDER_PARTS: readonly { title: string; description: string }[] = [
  {
    title: "Page structure",
    description: "Every page and its sections as a tree you can reorder.",
  },
  {
    title: "Text editing",
    description: "Edit words where they sit, with type from your theme.",
  },
  {
    title: "Layout control",
    description: "Stack, split or grid, with alignment and spacing.",
  },
  {
    title: "Responsive views",
    description: "Check and adjust desktop, tablet and phone.",
  },
  {
    title: "Themes",
    description: "Start from a first-party theme and make it yours.",
  },
];

/** 09: publishing, part by part. */
export const CONTENT_PARTS: readonly { title: string; description: string; status: Status }[] = [
  {
    title: "Posts",
    description: "Drafts, editing and publishing, with a clear status on every post.",
    status: content.status,
  },
  {
    title: "Authors",
    description: "Author profiles on your posts. The author and editor roles exist today.",
    status: content.status,
  },
  {
    title: "Categories",
    description: "Sections readers can browse, from Guides to Studio notes.",
    status: content.status,
  },
  {
    title: "Media",
    description: "One library of images and files, shared across your site.",
    status: FEATURE_STATUS.media_storage,
  },
  {
    title: "Search previews",
    description: "Titles and descriptions for search, set per page and per post.",
    status: content.status,
  },
];
