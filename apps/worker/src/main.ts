// Storevia worker (ADR-0023): runs the periodic jobs. Needs
// DATABASE_WORKER_URL and DATABASE_BILLING_URL.
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { disconnectAll } from "@storevia/database";
import { Scheduler, Worker } from "@storevia/jobs";
import { createLogger } from "@storevia/observability";
import { JOBS } from "./jobs";

const rootEnv = resolve(import.meta.dirname, "../../../.env");
if (existsSync(rootEnv) && !process.env["CI"]) process.loadEnvFile(rootEnv);

const log = createLogger({ app: "worker" });
for (const name of ["DATABASE_WORKER_URL", "DATABASE_BILLING_URL"]) {
  if (!process.env[name]) throw new Error(`${name} is not set`);
}

const workerId = `${hostname()}-${String(process.pid)}`;
const scheduler = new Scheduler({ workerId });
await scheduler.register(JOBS);
const worker = new Worker(scheduler, Number(process.env["WORKER_POLL_INTERVAL_MS"] ?? 5_000));
worker.start();
log.info("worker started", { workerId, jobs: JOBS.map((j) => j.name) });

// Liveness/readiness for the orchestrator. No tenant data is exposed.
const port = Number(process.env["WORKER_HEALTH_PORT"] ?? 3004);
const server = createServer((req, res) => {
  if (req.url !== "/health") {
    res.writeHead(404).end();
    return;
  }
  const health = worker.health();
  res
    .writeHead(health.status === "degraded" || health.status === "stopping" ? 503 : 200, {
      "content-type": "application/json",
      "cache-control": "no-store",
    })
    .end(JSON.stringify(health));
});
server.listen(port, "127.0.0.1");

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("worker stopping", { signal });
  server.close();
  await worker.stop();
  await disconnectAll();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
