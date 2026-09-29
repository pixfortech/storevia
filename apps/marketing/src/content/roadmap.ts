// The public roadmap, stage by stage, in delivery order: what's built, then
// what's planned. It agrees with capabilities.ts and features.ts: update a
// stage's status in the same change that ships it. Order may change, and no
// dates or internal milestone numbers are given.
import type { Status } from "./capabilities";

export interface RoadmapStage {
  readonly id: string;
  readonly title: string;
  readonly status: Status;
  readonly summary: string;
  readonly items: readonly string[];
}

export const ROADMAP: readonly RoadmapStage[] = [
  {
    id: "foundations",
    title: "Foundations",
    status: "available",
    summary: "Everything a business needs before it sells: accounts, teams, stores and plans.",
    items: [
      "Accounts with email verification, signed-in devices and password confirmation",
      "Organisations with several online stores",
      "Team members, invitations and roles",
      "Plans, usage limits and a dashboard for desktop, tablet and phone",
    ],
  },
  {
    id: "catalogue",
    title: "Catalogue",
    status: "available",
    summary: "Real product data, built for real stock.",
    items: [
      "Products, options and variants, with tags and categories",
      "Collections and a media library",
      "Inventory by location, with a movement history",
      "Search, bulk editing and CSV export",
    ],
  },
  {
    id: "storefront",
    title: "Storefront",
    status: "available",
    summary: "Stores become visible on the web.",
    items: [
      "Your store at its Storevia address, live when you choose",
      "Product pages, collections, cart and search",
    ],
  },
  {
    id: "builder",
    title: "Visual builder and themes",
    status: "available",
    summary: "Design every page yourself.",
    items: [
      "Ready-made sections with desktop, tablet and phone previews",
      "Autosave, drafts, preview and publishing",
      "Two themes with presets and customisation, menus and content pages",
    ],
  },
  {
    id: "checkout",
    title: "Checkout and orders",
    status: "available",
    summary: "Stores take orders.",
    items: [
      "Checkout with server-side pricing, shipping and tax, paid through your own Razorpay account",
      "Orders, customers, discount codes, fulfilment, shipment tracking, refunds and cancellation",
      "Order emails and a private order page for your customers",
    ],
  },
  {
    id: "domains",
    title: "Custom domains",
    status: "available",
    summary: "Your own address.",
    items: [
      "Connect your own domain, with clear DNS instructions and verification",
      "HTTPS certificates issued and renewed automatically",
    ],
  },
  {
    id: "hardening",
    title: "Your data and security",
    status: "available",
    summary: "Control over your data, and the checks behind it.",
    items: [
      "Data export, and account and organisation deletion",
      "An audit log of changes to your organisation",
      "Security hardening across sign-in, payments and public forms",
    ],
  },
  {
    id: "next",
    title: "What we're planning",
    status: "roadmap",
    summary: "Not built yet. The order may change, and we don't give dates.",
    items: [
      "Storefront visitors, conversion and a reports area",
      "Automatic discounts, abandoned-cart recovery and cash on delivery",
      "Two-step sign-in and signing in with Google",
      "Business websites, blogs and portfolios",
      "An API and webhooks",
    ],
  },
];
