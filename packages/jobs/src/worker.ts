import "server-only";
import { createLogger, errorFields } from "@storevia/observability";
import type { Scheduler } from "./scheduler";

export interface WorkerHealth {
  readonly status: "starting" | "ok" | "degraded" | "stopping";
  readonly lastPollAt: string | null;
  readonly lastError: string | null;
  /** The job running now, if any (a long job is healthy until its deadline). */
  readonly running: string | null;
  /** Runs given up at their deadline that haven't returned. */
  readonly abandoned: number;
}

/** Abandoned runs at which the worker asks to be restarted. */
export const MAX_ABANDONED_RUNS = 3;

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

  /**
   * Healthy while the loop makes progress: it finished a poll recently, or
   * a job is running within its deadline (long jobs are expected). Degraded
   * after a failed poll, a stall, a run past its deadline, or too many
   * abandoned runs.
   */
  health(now = Date.now()): WorkerHealth {
    const activity = this.scheduler.activity();
    const progressAt = Math.max(
      this.lastPollAt?.getTime() ?? 0,
      activity.lastProgressAt?.getTime() ?? 0,
    );
    const running = activity.running;
    const stalled = running
      ? now > running.deadline.getTime() + 60_000
      : progressAt > 0 && now - progressAt > this.pollIntervalMs * 12;
    const degraded = this.lastError !== null || stalled || activity.abandoned >= MAX_ABANDONED_RUNS;
    return {
      status: this.stopping
        ? "stopping"
        : progressAt === 0 && running === null
          ? "starting"
          : degraded
            ? "degraded"
            : "ok",
      lastPollAt: this.lastPollAt?.toISOString() ?? null,
      lastError: this.lastError,
      running: running?.job ?? null,
      abandoned: activity.abandoned,
    };
  }
}
