import "server-only";
import { getClient } from "./client";

/**
 * The worker connection (storevia_worker: BYPASSRLS, narrow grants): the job
 * scheduler tables and usage reconciliation (ADR-0023). Importers:
 * packages/jobs and apps/worker only.
 */
export function workerDb() {
  return getClient("worker");
}
