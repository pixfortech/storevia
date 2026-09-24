import type { Metadata } from "next";
import { LegalPlaceholder } from "@/components/legal-placeholder";

export const metadata: Metadata = { title: "Terms", robots: { index: false } };

export default function TermsPage() {
  return (
    <LegalPlaceholder
      title="Terms of service"
      covers={[
        "Using Storevia and your account",
        "Plans, billing and cancellation",
        "Your content and acceptable use",
        "Availability, liability and changes to the terms",
      ]}
    />
  );
}
