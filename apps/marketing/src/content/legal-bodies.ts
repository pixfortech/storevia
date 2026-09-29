// The approved text of each final platform legal document (content/legal.ts),
// by document. Empty until counsel supplies the text: engineering never
// writes it. Each entry is the component exported by that document's
// contentFile, e.g. `terms: TermsOfService2027` imported from
// "./legal/terms-2027-01". A test checks that every final document has a
// body here and that nothing here belongs to a placeholder.
import type { ComponentType } from "react";
import type { LegalDocumentKey } from "./legal";

export const LEGAL_BODIES: Readonly<Partial<Record<LegalDocumentKey, ComponentType>>> = {};
