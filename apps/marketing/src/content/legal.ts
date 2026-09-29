// Storevia's own legal documents (MK-1): the one place that says whether
// each is still a placeholder or the final, counsel-approved text. The legal
// pages, the sitemap, the marketing app's boot check and `pnpm check:launch`
// all read this list, so a placeholder can't reach production unnoticed:
// with STOREVIA_ENV=production the marketing site refuses to start while any
// document here is a placeholder (docs/operations/launch-checklist.md §12).
// Development, test, preview and staging keep booting, and show the
// placeholders clearly marked as such.
//
// Engineering never writes legal text. To publish a document: add counsel's
// approved text as a component module (contentFile, under apps/marketing/src),
// register it in LEGAL_BODIES (content/legal-bodies.ts), then mark the document
// "final" with its version and effective date.
//
// Pure data and functions, with no imports: the launch check script runs it
// directly.

export type LegalDocumentKey = "terms" | "privacy";

interface LegalDocumentBase {
  readonly key: LegalDocumentKey;
  readonly title: string;
  /** The page's path on the marketing site. */
  readonly path: string;
  /** What the document covers (the placeholder lists these; never legal text). */
  readonly covers: readonly string[];
}

export interface PlaceholderLegalDocument extends LegalDocumentBase {
  readonly status: "placeholder";
}

export interface FinalLegalDocument extends LegalDocumentBase {
  readonly status: "final";
  /** Counsel's version label, e.g. "2027-01". */
  readonly version: string;
  /** When it takes effect, YYYY-MM-DD. */
  readonly effectiveDate: string;
  /** The approved text as a component module, relative to apps/marketing/src. */
  readonly contentFile: string;
}

export type LegalDocument = PlaceholderLegalDocument | FinalLegalDocument;

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  {
    key: "terms",
    title: "Terms of service",
    path: "/legal/terms",
    status: "placeholder",
    covers: [
      "Using Storevia and your account",
      "Plans, billing and cancellation",
      "Your content and acceptable use",
      "Availability, liability and changes to the terms",
    ],
  },
  {
    key: "privacy",
    title: "Privacy policy",
    path: "/legal/privacy",
    status: "placeholder",
    covers: [
      "What personal data Storevia collects and why",
      "How long it is kept and where it is stored",
      "Who it is shared with, including service providers",
      "Your rights and how to exercise them",
    ],
  },
];

export function legalDocument(
  key: LegalDocumentKey,
  documents: readonly LegalDocument[] = LEGAL_DOCUMENTS,
): LegalDocument {
  const found = documents.find((document) => document.key === key);
  if (!found) throw new Error(`no legal document "${key}"`);
  return found;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/**
 * Why the documents aren't ready for a public launch, one line per problem
 * (empty when they are): every document must be final, with a version, a
 * real effective date and its content file. `fileExists` checks content
 * files (paths relative to apps/marketing/src) where the file system is
 * available.
 */
export function legalLaunchProblems(
  documents: readonly LegalDocument[] = LEGAL_DOCUMENTS,
  fileExists?: (contentFile: string) => boolean,
): string[] {
  const problems: string[] = [];
  for (const document of documents) {
    const name = `${document.title} (${document.path})`;
    if (document.status === "placeholder") {
      problems.push(`${name} is still a placeholder`);
      continue;
    }
    if (document.version.trim() === "") problems.push(`${name} has no version`);
    if (!isRealDate(document.effectiveDate)) {
      problems.push(`${name} has no valid effective date (YYYY-MM-DD)`);
    }
    if (!/^[\w./-]+\.tsx?$/.test(document.contentFile) || document.contentFile.includes("..")) {
      problems.push(`${name} has no content file`);
    } else if (fileExists && !fileExists(document.contentFile)) {
      problems.push(`${name}: its content file ${document.contentFile} is missing`);
    }
  }
  return problems;
}

/**
 * The marketing app's boot rule: in production every legal document must be
 * final; every other stage starts with placeholders (they are marked on the
 * page). Returns the problem to report, or null.
 */
export function legalBootProblem(
  stage: string,
  documents: readonly LegalDocument[] = LEGAL_DOCUMENTS,
): string | null {
  if (stage !== "production") return null;
  const problems = legalLaunchProblems(documents);
  if (problems.length === 0) return null;
  return (
    `platform legal documents aren't ready for production: ${problems.join("; ")}. ` +
    "Publish counsel's approved text first (docs/operations/launch-checklist.md §12)."
  );
}
