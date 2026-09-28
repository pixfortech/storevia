import "server-only";
import { getEmailSender } from "@storevia/email";
import { runBootChecks } from "@storevia/security/env";
import { env } from "./env";

/**
 * Validates the whole configuration before the server takes requests
 * (instrumentation `register()`). Development skips the package checks so a
 * partial .env still starts; every other stage checks everything.
 */
export function verifyConfiguration(): void {
  if (env().STOREVIA_ENV === "development") return;
  // Staff sign-in and MFA resets send email.
  runBootChecks("platform-admin", {
    email: () => {
      getEmailSender();
      return null;
    },
  });
}
