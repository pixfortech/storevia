import type { Metadata } from "next";
import { LegalPlaceholder } from "@/components/legal-placeholder";

export const metadata: Metadata = { title: "Privacy", robots: { index: false } };

export default function PrivacyPage() {
  return (
    <LegalPlaceholder
      title="Privacy policy"
      covers={[
        "What personal data Storevia collects and why",
        "How long it is kept and where it is stored",
        "Who it is shared with, including service providers",
        "Your rights and how to exercise them",
      ]}
    />
  );
}
