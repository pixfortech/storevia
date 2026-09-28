// Storevia worker (ADR-0023): runs the periodic jobs. Its configuration is
// validated first (src/env.ts): a bad deploy exits before claiming a job.
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { disconnectAll } from "@storevia/database";
import { workerDb } from "@storevia/database/worker";
import { Scheduler, Worker } from "@storevia/jobs";
import { createLogger } from "@storevia/observability";
import { loadWorkerEnv } from "./env";
import { JOBS } from "./jobs";

const rootEnv = resolve(import.meta.dirname, "../../../.env");
if (existsSync(rootEnv) && !process.env["CI"]) process.loadEnvFile(rootEnv);

const log = createLogger({ app: "worker" });
const env = loadWorkerEnv();

const workerId = `${hostname()}-${String(process.pid)}`;
const scheduler = new Scheduler({ workerId });
await scheduler.register(JOBS);
const worker = new Worker(scheduler, env.WORKER_POLL_INTERVAL_MS);
worker.start();
log.info("worker started", { workerId, jobs: JOBS.map((j) => j.name) });

// Liveness (/health) and readiness (/ready) for the orchestrator. No tenant
// data is exposed. Bound to WORKER_HEALTH_HOST (127.0.0.1 by default; a
// container sets 0.0.0.0 so the platform's probe can reach it).
const server = createServer((req, res) => {
  const reply = (status: number, body: unknown) => {
    res
      .writeHead(status, { "content-type": "application/json", "cache-control": "no-store" })
      .end(JSON.stringify(body));
  };
  if (req.url === "/health") {
    const health = worker.health();
    reply(health.status === "degraded" || health.status === "stopping" ? 503 : 200, health);
    return;
  }
  if (req.url === "/ready") {
    void databaseReachable().then((ok) => {
      reply(ok ? 200 : 503, { database: ok ? "ok" : "unreachable" });
    });
    return;
  }
  res.writeHead(404).end();
});
server.listen(env.WORKER_HEALTH_PORT, env.WORKER_HEALTH_HOST);

async function databaseReachable(): Promise<boolean> {
  try {
    await Promise.race([
      workerDb().$queryRaw`SELECT 1`,
      new Promise((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error("timeout"));
        }, 2_000);
      }),
    ]);
    return true;
  } catch {
    return false;
  }
}

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
