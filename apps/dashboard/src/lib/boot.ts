import "server-only";
import { getMockProvider } from "@storevia/billing";
import { getDomainProvisioner } from "@storevia/domains/provisioner";
import { getEmailSender } from "@storevia/email";
import { storageFromEnv } from "@storevia/media";
import { credentialsKeysProblem } from "@storevia/payments";
import { runBootChecks } from "@storevia/security/env";
import { env } from "./env";

/**
 * Validates the whole configuration before the server takes requests
 * (instrumentation `register()`): the dashboard's own variables, then the
 * settings each package it uses reads for itself. Development skips the
 * package checks so a partial .env still starts; every other stage,
 * including CI's end-to-end runs, checks everything.
 */
export function verifyConfiguration(): void {
  const { STOREVIA_ENV } = env();
  if (STOREVIA_ENV === "development") return;
  runBootChecks("dashboard", {
    payments: credentialsKeysProblem,
    media: () => {
      storageFromEnv();
      return null;
    },
    email: () => {
      getEmailSender();
      return null;
    },
    domains: () => {
      getDomainProvisioner();
      return null;
    },
    billing: () => {
      getMockProvider();
      return null;
    },
  });
}
