import { ICON_STROKE } from "@storevia/ui";
import { Database, KeyRound, ListChecks, ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Section, SectionHeading } from "@/components/section";
import { StatusBadge } from "@/components/status-badge";
import { CAPABILITIES } from "@/content/capabilities";

export const metadata: Metadata = {
  title: "Resources",
  description: "Storevia's roadmap and how we keep your data safe.",
};

// The public roadmap, in delivery order. Kept in step with capabilities.ts.
const ROADMAP: readonly { stage: string; title: string; items: readonly string[] }[] = [
  {
    stage: "Available now",
    title: "Foundations",
    items: [
      "Accounts with email verification, session management and password confirmation",
      "Organisations, stores and business types",
      "Team members, invitations, roles and store-level access",
      "Plans, usage limits and the responsive dashboard",
    ],
  },
  {
    stage: "Next",
    title: "Catalogue",
    items: [
      "Products, options and variants",
      "Collections and a media library",
      "Inventory by location",
    ],
  },
  {
    stage: "Then",
    title: "Storefront",
    items: ["Your store on the web at its Storevia address", "A default theme, cart and search"],
  },
  {
    stage: "Then",
    title: "Visual builder",
    items: ["Drag-and-drop pages with responsive editing", "Drafts, publishing and history"],
  },
  {
    stage: "Then",
    title: "Checkout and orders",
    items: ["Checkout, payments and orders", "Customers, discounts, refunds and fulfilment"],
  },
  {
    stage: "Then",
    title: "Domains and themes",
    items: ["Custom domains with automatic HTTPS", "Theme customisation and a second theme"],
  },
];

const SECURITY = [
  {
    icon: Database,
    title: "Isolation in the database",
    body: "Each organisation's rows are protected by row-level security in PostgreSQL, so one business can't read another's data even if application code makes a mistake.",
  },
  {
    icon: KeyRound,
    title: "Access checked on every request",
    body: "Your membership and role are verified for every page and action. An organisation or store ID in a URL is only ever a request, never proof of access.",
  },
  {
    icon: ListChecks,
    title: "Confirmation for sensitive changes",
    body: "Granting admin rights and other sensitive actions ask you to confirm your password first.",
  },
  {
    icon: ScrollText,
    title: "An audit trail",
    body: "Changes to members, roles, stores and plans are recorded with who made them and when.",
  },
];

export default function ResourcesPage() {
  const inDevelopment = CAPABILITIES.filter((c) => c.status === "in-development").map(
    (c) => c.title,
  );
  return (
    <>
      <Section className="pb-8" labelledBy="resources-title">
        <SectionHeading
          as="h1"
          id="resources-title"
          eyebrow="Resources"
          title="Roadmap and security"
          lead="Guides and help articles will arrive with the storefront. Until then, here is what we're building and how we protect your data."
        />
      </Section>

      <Section id="roadmap" tone="tinted" labelledBy="roadmap-heading">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading id="roadmap-heading" title="Roadmap" />
          <p className="text-sm text-ink-muted">In development now: {inDevelopment.join(", ")}</p>
        </div>
        <ol className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ROADMAP.map((step, index) => (
            <li
              key={step.title}
              className="rounded-panel border border-line bg-surface p-6 shadow-card"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-ink-faint tabular">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {index === 0 ? (
                  <StatusBadge status="available" />
                ) : index === 1 ? (
                  <StatusBadge status="in-development" />
                ) : (
                  <StatusBadge status="roadmap" />
                )}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-ink">{step.title}</h3>
              <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
                {step.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-ink-faint">
          Order reflects our plan today and may change. Dates aren&apos;t promised.
        </p>
      </Section>

      <Section id="security" labelledBy="security-heading">
        <SectionHeading
          id="security-heading"
          title="How we keep your data safe"
          lead="Security and separation between businesses are the first things we build and the last things we compromise."
        />
        <ul className="mt-10 grid gap-8 md:grid-cols-2">
          {SECURITY.map((item) => (
            <li key={item.title} className="flex gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-card bg-brand-50 text-brand-700">
                <item.icon aria-hidden="true" strokeWidth={ICON_STROKE} className="size-5" />
              </span>
              <div>
                <h3 className="font-semibold text-ink">{item.title}</h3>
                <p className="mt-1 text-ink-muted">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-sm text-ink-muted">
          Found a security issue?{" "}
          <Link
            href="/contact?topic=security"
            className="font-medium text-brand-700 hover:underline"
          >
            Tell us privately
          </Link>
          .
        </p>
      </Section>
    </>
  );
}
