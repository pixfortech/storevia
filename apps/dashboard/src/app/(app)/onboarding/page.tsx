import { listMyOrganisations } from "@storevia/tenancy";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@storevia/ui";
import { requirePrincipal } from "@/lib/auth";
import { CreateOrganisationForm } from "./create-organisation-form";

export const metadata: Metadata = { title: "Set up your business" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const principal = await requirePrincipal("/onboarding");
  const creatingAnother = (await searchParams)["new"] === "1";
  const organisations = await listMyOrganisations(principal);
  if (organisations.length > 0 && !creatingAnother) redirect("/");
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center px-4 py-10 sm:justify-center">
      <Logo className="mb-8 text-lg" />
      <div className="w-full max-w-[480px] rounded-card border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Step 1 of 2</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          {creatingAnother
            ? "Create another organisation"
            : `Welcome, ${principal.name.split(" ")[0] ?? ""}`}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          An organisation holds your stores, team and billing. You'll be its owner.
        </p>
        <div className="mt-6">
          <CreateOrganisationForm />
        </div>
      </div>
      {creatingAnother ? (
        <Link href="/" className="mt-6 text-sm font-medium text-brand-700 hover:underline">
          Cancel
        </Link>
      ) : null}
    </main>
  );
}
