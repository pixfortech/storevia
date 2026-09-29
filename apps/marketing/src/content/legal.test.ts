import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { STAGES } from "@storevia/security/env";
import { describe, expect, it } from "vitest";
import {
  LEGAL_DOCUMENTS,
  legalBootProblem,
  legalDocument,
  legalLaunchProblems,
  type FinalLegalDocument,
  type LegalDocument,
} from "./legal";
import { LEGAL_BODIES } from "./legal-bodies";

// Storevia's own terms and privacy policy (MK-1) can't reach production as
// placeholders: the marketing site refuses to start with
// STOREVIA_ENV=production, and `pnpm check:launch` fails, while any is one.

const SRC = join(import.meta.dirname, "..");

const final = (overrides: Partial<FinalLegalDocument> = {}): FinalLegalDocument => ({
  key: "terms",
  title: "Terms of service",
  path: "/legal/terms",
  covers: [],
  status: "final",
  version: "2027-01",
  effectiveDate: "2027-01-15",
  contentFile: "content/legal/terms-2027-01.tsx",
  ...overrides,
});

describe("platform legal documents", () => {
  it("lists the terms and the privacy policy, each with its page", () => {
    expect(LEGAL_DOCUMENTS.map((d) => [d.key, d.path])).toEqual([
      ["terms", "/legal/terms"],
      ["privacy", "/legal/privacy"],
    ]);
    for (const document of LEGAL_DOCUMENTS) {
      const page = join(SRC, "app", document.path, "page.tsx");
      expect(existsSync(page), document.path).toBe(true);
      // The page renders from this list, never a hard-coded placeholder.
      const source = readFileSync(page, "utf8");
      expect(source).toContain(`documentKey="${document.key}"`);
      expect(source).toContain(`legalMetadata("${document.key}")`);
      expect(source).not.toContain("LegalPlaceholder");
      expect(legalDocument(document.key)).toBe(document);
    }
  });

  it("has approved text for every final document, and none for a placeholder", () => {
    for (const document of LEGAL_DOCUMENTS) {
      if (document.status === "final") {
        expect(LEGAL_BODIES[document.key], document.key).toBeDefined();
        expect(existsSync(join(SRC, document.contentFile)), document.contentFile).toBe(true);
      } else {
        expect(LEGAL_BODIES[document.key], document.key).toBeUndefined();
      }
    }
    expect(legalLaunchProblems(LEGAL_DOCUMENTS.filter((d) => d.status === "final"))).toEqual([]);
  });
});

describe("launch problems", () => {
  const placeholder: LegalDocument = {
    key: "privacy",
    title: "Privacy policy",
    path: "/legal/privacy",
    covers: ["What personal data Storevia collects and why"],
    status: "placeholder",
  };

  it("names every placeholder with its page", () => {
    expect(legalLaunchProblems([final(), placeholder])).toEqual([
      "Privacy policy (/legal/privacy) is still a placeholder",
    ]);
  });

  it("requires a version, a real effective date and a content file for a final document", () => {
    expect(legalLaunchProblems([final()])).toEqual([]);
    expect(legalLaunchProblems([final({ version: " " })])).toEqual([
      "Terms of service (/legal/terms) has no version",
    ]);
    for (const effectiveDate of ["", "15/01/2027", "2027-02-30", "2027-13-01"]) {
      expect(legalLaunchProblems([final({ effectiveDate })]), effectiveDate).toEqual([
        "Terms of service (/legal/terms) has no valid effective date (YYYY-MM-DD)",
      ]);
    }
    for (const contentFile of ["", "terms.md", "../outside/terms.tsx"]) {
      expect(legalLaunchProblems([final({ contentFile })]), contentFile).toEqual([
        "Terms of service (/legal/terms) has no content file",
      ]);
    }
  });

  it("checks the content file exists where the file system is available", () => {
    expect(legalLaunchProblems([final()], () => false)).toEqual([
      "Terms of service (/legal/terms): its content file content/legal/terms-2027-01.tsx is missing",
    ]);
    expect(legalLaunchProblems([final()], () => true)).toEqual([]);
  });
});

describe("boot rule", () => {
  it("refuses production while any document is a placeholder, naming each one", () => {
    const problem = legalBootProblem("production", [final(), final({ key: "privacy" })]);
    expect(problem).toBeNull();
    const refused = legalBootProblem("production", [
      { ...final(), status: "placeholder" },
      final({ key: "privacy", title: "Privacy policy", path: "/legal/privacy" }),
    ]);
    expect(refused).toContain("Terms of service (/legal/terms) is still a placeholder");
    expect(refused).not.toContain("Privacy policy");
    expect(refused).toContain("launch-checklist.md §12");
  });

  it("refuses production today: both documents are placeholders", () => {
    const placeholders = LEGAL_DOCUMENTS.filter((d) => d.status === "placeholder");
    if (placeholders.length === 0) return;
    const problem = legalBootProblem("production");
    for (const document of placeholders) {
      expect(problem).toContain(`${document.title} (${document.path}) is still a placeholder`);
    }
  });

  it("lets every other stage start (development, test, preview, staging)", () => {
    for (const stage of STAGES.filter((s) => s !== "production")) {
      expect(legalBootProblem(stage), stage).toBeNull();
    }
    expect(STAGES).toContain("production");
  });
});
