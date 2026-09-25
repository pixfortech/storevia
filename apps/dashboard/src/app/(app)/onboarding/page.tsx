import { listMyOrganisations } from "@storevia/tenancy";
import { BUSINESS_TYPE_DEFINITIONS, BUSINESS_TYPES } from "@storevia/tenancy/business-types";
import { cn } from "@storevia/ui/cn";
import { Icon } from "@storevia/ui/icons";
import { BusinessScene } from "@storevia/ui/illustrations";
import { Badge } from "@storevia/ui/surfaces";
import { UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton, StandaloneHeader } from "@/components/areas/standalone";
import { requirePrincipal } from "@/lib/auth";
import { CreateOrganisationForm } from "./create-organisation-form";

export const metadata: Metadata = { title: "Set up your business" };

// The two setup steps the "Step 1 of 2" indicator counts.
const SETUP_STEPS = [
  { title: "Create your organisation", body: "It holds your stores, team and plan." },
  {
    title: "Create your first store",
    body: "An online store, business website, publication or portfolio.",
  },
];

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const principal = await requirePrincipal("/onboarding");
  const creatingAnother = (await searchParams)["new"] === "1";
  const organisations = await listMyOrganisations(principal);
  if (organisations.length > 0 && !creatingAnother) redirect("/");
  const firstName = principal.name.split(" ")[0] ?? "";
  return (
    <div className="flex min-h-dvh flex-col">
      <StandaloneHeader>
        <span className="hidden truncate text-body-sm text-ink-muted sm:inline">
          {principal.email}
        </span>
        <SignOutButton />
      </StandaloneHeader>
      <main id="main" className="grid flex-1 lg:grid-cols-2">
        <div className="flex justify-center px-4 pt-10 pb-16 sm:px-8 sm:pt-16 lg:items-center lg:pt-10">
          <div className="w-full max-w-md">
            <div className="flex items-center gap-3">
              <p className="text-overline text-brand-700 uppercase">Step 1 of 2</p>
              <div aria-hidden="true" className="flex gap-1.5">
                <span className="h-1 w-8 rounded-pill bg-brand-600" />
                <span className="h-1 w-8 rounded-pill bg-muted" />
              </div>
            </div>
            <h1 className="mt-4 font-display text-h3 text-ink sm:text-h2">
              {creatingAnother ? "Create another organisation" : `Welcome, ${firstName}`}
            </h1>
            <p className="mt-3 text-body text-ink-muted">
              An organisation holds your stores, team and billing. You&apos;ll be its owner.
            </p>
            <div className="mt-8">
              <CreateOrganisationForm />
            </div>
            {creatingAnother ? (
              <p className="mt-6 text-center">
                <Link
                  href="/"
                  className="inline-flex h-10 items-center rounded-control px-3 text-label font-medium text-brand-700 hover:bg-brand-50"
                >
                  Cancel
                </Link>
              </p>
            ) : null}
          </div>
        </div>
        <div className="hidden border-l border-line bg-subtle lg:flex lg:items-center lg:justify-center lg:px-12">
          <div className="w-full max-w-md py-16">
            <p className="text-overline text-ink-faint uppercase">What you can build</p>
            <ul className="mt-4 grid grid-cols-2 gap-3">
              {BUSINESS_TYPES.map((type) => (
                <li
                  key={type}
                  className="rounded-card border border-line bg-surface px-4 pt-4 pb-3.5 shadow-card"
                >
                  <BusinessScene type={type} className="mx-auto max-w-36" />
                  <p className="mt-3 text-label text-ink">
                    {BUSINESS_TYPE_DEFINITIONS[type].label}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-10 text-overline text-ink-faint uppercase">What happens next</p>
            <ol className="mt-4 space-y-4">
              {SETUP_STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-3.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-caption font-semibold ring-1 ring-inset",
                      index === 0
                        ? "bg-brand-600 text-white ring-brand-600"
                        : "bg-surface text-ink-muted ring-line-strong",
                    )}
                  >
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-body-sm font-semibold text-ink">{step.title}</p>
                    <p className="mt-0.5 text-body-sm text-ink-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex gap-3.5 border-t border-line pt-5">
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong bg-surface text-ink-faint"
              >
                <Icon icon={UserPlus} size="xs" />
              </span>
              <div>
                <p className="flex flex-wrap items-center gap-2 text-body-sm font-semibold text-ink">
                  Invite your team
                  <Badge size="sm" variant="outline">
                    Optional, any time
                  </Badge>
                </p>
                <p className="mt-0.5 text-body-sm text-ink-muted">
                  Give each person the role they need, when you&apos;re ready.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
