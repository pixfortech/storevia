import "server-only";
import { Prisma } from "@storevia/database";
import { workerDb } from "@storevia/database/worker";
import {
  MONITOR_INTERVAL_MS,
  VERIFY_BACKOFF,
  VERIFY_BACKOFF_FINAL_MINUTES,
} from "@storevia/domains";
import { getDomainProvisioner, type DomainProvisioner } from "@storevia/domains/provisioner";
import type { JobDefinition } from "@storevia/jobs";
import { recordActorAudit, runDomainCheck, type DomainCheckRow } from "@storevia/tenancy";

// Custom-domain verification and monitoring (ADR-0032 §5). Every minute it
// checks the domains that are due: waiting ones on a backoff, ACTIVE ones a
// few times a day. One domain per transaction, locked with SKIP LOCKED, so
// a merchant's "Check again" or removal never waits behind the worker and
// two workers never check the same domain.

/** Domains per run, and the wall-clock budget for starting new ones. */
const MAX_PER_RUN = 25;
const RUN_BUDGET_MS = 45_000;
/** Provider calls are bounded (8 s each); a check makes at most five. */
const CHECK_TX_TIMEOUT_MS = 60_000;

const backoffMinutes = Prisma.sql`CASE ${Prisma.join(
  VERIFY_BACKOFF.map(
    ([below, minutes]) =>
      Prisma.sql`WHEN "checkAttempts" < ${Prisma.raw(String(below))} THEN ${Prisma.raw(String(minutes))}`,
  ),
  " ",
)} ELSE ${Prisma.raw(String(VERIFY_BACKOFF_FINAL_MINUTES))} END`;

const monitorSeconds = Prisma.raw(String(MONITOR_INTERVAL_MS / 1000));

interface DueRow extends DomainCheckRow {
  readonly organisationId: string;
}

/** Checks the next due domain; null when none is due (or all are locked). */
async function checkNextDomain(provisioner: DomainProvisioner) {
  return workerDb().$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<DueRow[]>`
        SELECT id, "organisationId", "storeId", hostname, status::text AS status, "isPrimary",
          "verificationToken", "providerRef", "checkAttempts", "failureReason"
        FROM "StoreDomain"
        WHERE type = 'CUSTOM' AND (
          (status IN ('PENDING', 'VERIFYING') AND ("lastCheckedAt" IS NULL
            OR "lastCheckedAt" <= now() - ${backoffMinutes} * interval '1 minute'))
          OR (status = 'ACTIVE' AND ("lastCheckedAt" IS NULL
            OR "lastCheckedAt" <= now() - ${monitorSeconds} * interval '1 second')))
        ORDER BY "lastCheckedAt" ASC NULLS FIRST
        LIMIT 1
        FOR UPDATE SKIP LOCKED`;
      const row = rows[0];
      if (!row) return null;
      const outcome = await runDomainCheck(tx, row, provisioner, (auditTx, action, metadata) =>
        recordActorAudit(auditTx, {
          organisationId: row.organisationId,
          actorType: "SYSTEM",
          actorId: null,
          action,
          entity: { type: "StoreDomain", id: row.id },
          metadata,
        }),
      );
      return { before: row.status, after: outcome.status, providerError: outcome.providerError };
    },
    { timeout: CHECK_TX_TIMEOUT_MS },
  );
}

export const domainVerifyJob: JobDefinition = {
  name: "domains.verify",
  schedule: { everySeconds: 60 },
  maxAttempts: 2,
  timeoutMs: 3 * 60_000,
  async run({ signal, log }) {
    const provisioner = getDomainProvisioner();
    const started = Date.now();
    let checked = 0;
    let activated = 0;
    let failed = 0;
    let providerErrors = 0;
    while (checked < MAX_PER_RUN && Date.now() - started < RUN_BUDGET_MS) {
      if (signal.aborted) throw new Error("aborted");
      const result = await checkNextDomain(provisioner);
      if (!result) break;
      checked += 1;
      if (result.after === "ACTIVE" && result.before !== "ACTIVE") activated += 1;
      if (result.after === "FAILED" && result.before !== "FAILED") failed += 1;
      if (result.providerError) {
        providerErrors += 1;
        // The kind only ("unavailable: provider returned 503"): never a payload.
        log.warn("domain provider error", { error: result.providerError });
      }
    }
    return { checked, activated, failed, providerErrors, provider: provisioner.key };
  },
};
