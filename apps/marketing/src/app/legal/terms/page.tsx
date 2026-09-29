import { LegalDocumentPage, legalMetadata } from "@/components/legal-document";

// Storevia's terms of service: a marked placeholder until counsel's text is
// published (content/legal.ts; production refuses to start without it).
export const metadata = legalMetadata("terms");

export default function TermsPage() {
  return <LegalDocumentPage documentKey="terms" />;
}
