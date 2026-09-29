import "server-only";
import { getEmailSender } from "@storevia/email";
import { runBootChecks } from "@storevia/security/env";
import { legalBootProblem } from "@/content/legal";
import { env } from "./env";

/**
 * Validates the whole configuration before the server takes requests
 * (instrumentation `register()`). Development skips the package checks so a
 * partial .env still starts; every other stage checks everything.
 * Production also refuses to start while Storevia's own terms or privacy
 * policy is still a placeholder (content/legal.ts); other stages start and
 * show the placeholders marked as such.
 */
export function verifyConfiguration(): void {
  const stage = env().STOREVIA_ENV;
  if (stage === "development") return;
  runBootChecks("marketing", {
    // The contact form sends email.
    email: () => {
      getEmailSender();
      return null;
    },
    legal: () => legalBootProblem(stage),
  });
}
