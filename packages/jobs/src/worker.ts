import "server-only";
import { createLogger, errorFields } from "@storevia/observability";
import type { Scheduler } from "./scheduler";

export interface WorkerHealth {
  readonly status: "starting" | "ok" | "degraded" | "stopping";
  readonly lastPollAt: string | null;
  readonly lastError: string | null;
}

/** Poll loop around a Scheduler, with graceful shutdown and health state. */
export class Worker {
  private stopping = false;
  private loop: Promise<void> | undefined;
  private wake: (() => void) | undefined;
  private lastPollAt: Date | null = null;
  private lastError: string | null = null;
  private readonly log = createLogger({ component: "worker" });

  constructor(
    private readonly scheduler: Scheduler,
    private readonly pollIntervalMs = 5_000,
  ) {}

  private shouldStop(): boolean {
    return this.stopping;
  }

  start(): void {
    this.loop ??= this.run();
  }

  private async run(): Promise<void> {
    while (!this.stopping) {
      try {
        await this.scheduler.runDue();
        this.lastPollAt = new Date();
        this.lastError = null;
      } catch (error) {
        const fields = errorFields(error);
        const name = fields["errorName"];
        this.lastError = typeof name === "string" ? name : "error";
        this.log.error("poll failed", { error });
      }
      if (this.shouldStop()) break;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, this.pollIntervalMs);
        this.wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    }
  }

  /** Stops claiming; waits for the running job, aborting it after `graceMs`. */
  async stop(graceMs = 30_000): Promise<void> {
    this.stopping = true;
    this.wake?.();
    const timer = setTimeout(() => {
      this.scheduler.shutdown();
    }, graceMs);
    await this.loop;
    clearTimeout(timer);
    this.log.info("worker stopped");
  }

  health(): WorkerHealth {
    const stale =
      this.lastPollAt !== null && Date.now() - this.lastPollAt.getTime() > this.pollIntervalMs * 12;
    return {
      status: this.stopping
        ? "stopping"
        : this.lastPollAt === null
          ? "starting"
          : this.lastError !== null || stale
            ? "degraded"
            : "ok",
      lastPollAt: this.lastPollAt?.toISOString() ?? null,
      lastError: this.lastError,
    };
  }
}
