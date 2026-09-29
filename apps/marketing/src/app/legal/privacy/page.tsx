import { LegalDocumentPage, legalMetadata } from "@/components/legal-document";

// Storevia's privacy policy: a marked placeholder until counsel's text is
// published (content/legal.ts; production refuses to start without it).
export const metadata = legalMetadata("privacy");

export default function PrivacyPage() {
  return <LegalDocumentPage documentKey="privacy" />;
}
