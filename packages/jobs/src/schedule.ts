// Pure scheduling helpers (unit-tested).

export interface JobSchedule {
  /** Run every N seconds, on slots aligned to `anchor` (UTC). */
  readonly everySeconds: number;
  /** A slot boundary, e.g. 1970-01-01T03:00:00Z for "daily at 03:00 UTC". */
  readonly anchor?: Date;
}

const EPOCH = new Date(0);

/** The first slot at or after `at`. */
export function slotAtOrAfter(schedule: JobSchedule, at: Date): Date {
  const period = schedule.everySeconds * 1000;
  const anchor = (schedule.anchor ?? EPOCH).getTime();
  const k = Math.ceil((at.getTime() - anchor) / period);
  return new Date(anchor + k * period);
}

/**
 * The slot after `slot`. Missed slots are skipped: a worker that was down for
 * a day runs a nightly job once, not once per missed night.
 */
export function nextSlot(schedule: JobSchedule, slot: Date, now: Date): Date {
  const following = new Date(slot.getTime() + schedule.everySeconds * 1000);
  return following.getTime() > now.getTime()
    ? following
    : slotAtOrAfter(schedule, new Date(now.getTime() + 1));
}

/** Exponential backoff with a cap: 30 s, 60 s, 120 s, … up to 15 min. */
export function retryDelayMs(attempt: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 15 * 60_000);
}
