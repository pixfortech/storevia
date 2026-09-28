import "server-only";
import { workerDb } from "@storevia/database/worker";
import { getDomainProvisioner, type DomainProvisioner } from "@storevia/domains/provisioner";
import type { JobDefinition } from "@storevia/jobs";
import { logger, recordMetric } from "@storevia/observability";

// Data lifecycle (M8, docs/database/data-lifecycle.md).
//
// retention.sweep: the fixed retention windows, applied by one database
// function (app_retention_sweep) in bounded batches. The worker can't choose
// the windows or touch the tables directly.
//
// organisations.delete: organisations whose cooling-off period is over. Their
// custom domains leave the hosting provider first, so no hostname keeps
// pointing at Storevia; then app_delete_organisation erases personal data
// and detaches members, domains, credentials and media (whose objects the
// media sweep then deletes). Financial records stay.

const log = logger.child({ component: "lifecycle" });

export async function sweepRetention(batch = 5000): Promise<Record<string, number>> {
  const rows = await workerDb().$queryRaw<{ item: string; affected: bigint }[]>`
    SELECT item, affected FROM app_retention_sweep(${batch}::int)`;
  const result: Record<string, number> = {};
  for (const row of rows) {
    const affected = Number(row.affected);
    result[row.item] = affected;
    if (affected > 0) recordMetric("retention.removed", affected, { item: row.item });
  }
  return result;
}

export const retentionSweepJob: JobDefinition = {
  name: "retention.sweep",
  schedule: { everySeconds: 3600 },
  maxAttempts: 2,
  timeoutMs: 10 * 60_000,
  async run() {
    return sweepRetention();
  },
};

const DELETIONS_PER_RUN = 5;

export async function deleteDueOrganisations(
  provisioner: DomainProvisioner = getDomainProvisioner(),
): Promise<{ deleted: number; failed: number }> {
  const db = workerDb();
  const due = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Organisation"
    WHERE status = 'PENDING_DELETION' AND "deletionScheduledAt" <= now()
    ORDER BY "deletionScheduledAt" LIMIT ${DELETIONS_PER_RUN}`;
  let deleted = 0;
  let failed = 0;
  for (const { id } of due) {
    try {
      const domains = await db.$queryRaw<{ hostname: string }[]>`
        SELECT hostname FROM "StoreDomain"
        WHERE "organisationId" = ${id}::uuid AND type = 'CUSTOM' AND "providerRef" IS NOT NULL`;
      // Any provider failure stops this organisation's deletion until the
      // next run: its rows must not go while the provider still routes them.
      for (const { hostname } of domains) await provisioner.removeDomain(hostname);
      const [row] = await db.$queryRaw<{ result: unknown }[]>`
        SELECT app_delete_organisation(${id}::uuid) AS result`;
      if (row?.result) {
        deleted += 1;
        log.info("organisation deleted", { organisationId: id });
      }
    } catch (error) {
      failed += 1;
      log.warn("organisation deletion failed", { organisationId: id, error });
    }
  }
  if (deleted > 0) recordMetric("organisations.deleted", deleted);
  if (failed > 0) recordMetric("organisations.delete_failed", failed);
  return { deleted, failed };
}

export const organisationDeletionJob: JobDefinition = {
  name: "organisations.delete",
  schedule: { everySeconds: 3600 },
  maxAttempts: 2,
  timeoutMs: 10 * 60_000,
  async run() {
    return deleteDueOrganisations();
  },
};
