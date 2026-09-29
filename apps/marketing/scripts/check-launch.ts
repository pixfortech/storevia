// `pnpm check:launch`: fails while anything that must not reach a public
// launch is still in the repository (docs/operations/launch-checklist.md
// §12). Today: Storevia's own terms and privacy policy must be final, with a
// version, an effective date and their content file (content/legal.ts). The
// marketing site applies the same rule at boot with STOREVIA_ENV=production;
// run this before tagging the release so the deploy never gets that far.
// Not part of CI: it fails until counsel's text lands.
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { LEGAL_DOCUMENTS, legalLaunchProblems } from "../src/content/legal";

const SRC = join(import.meta.dirname, "..", "src");
const fileExists = (contentFile: string) => {
  const path = join(SRC, contentFile);
  return existsSync(path) && statSync(path).size > 0;
};

const problems = legalLaunchProblems(LEGAL_DOCUMENTS, fileExists);
if (problems.length > 0) {
  console.error(
    "Launch check failed: platform legal documents aren't ready for production.\n" +
      problems.map((problem) => `  - ${problem}`).join("\n") +
      "\nPublish counsel's approved text (apps/marketing/src/content/legal.ts), then run again.",
  );
  process.exit(1);
}
const published = LEGAL_DOCUMENTS.map((d) =>
  d.status === "final" ? `${d.title} ${d.version}` : d.title,
);
console.log(`Launch check passed: ${published.join(", ")}.`);
