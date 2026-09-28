// Multi-instance cache invalidation (M8). Every storefront instance keeps
// its own in-process caches (host resolutions, page data). The worker writes
// the tags of each dispatched outbox event to the StorefrontInvalidation
// log; each instance tails that log before it serves from cache, so an
// invalidation reaches every instance, not only the one the worker's HTTP
// post happened to land on.
//
// - Throttled and single-flight: at most one read per `intervalMs` per
//   process, shared by concurrent requests.
// - Late commits: ids are assigned at insert but become visible at commit,
//   so a lower id can appear after a higher one was read. Each read also
//   re-reads the last `overlapMs` of rows and applies any it hasn't seen.
// - Fail safe: when the log can't be read the caches are cleared, so nothing
//   cached before the failure outlives it; the cursor then catches up on
//   everything written meanwhile once the log is readable again.

export interface InvalidationRow {
  readonly id: bigint;
  readonly tags: readonly string[];
  readonly createdAt: Date;
}

export interface InvalidationSource {
  /** The newest id in the log (null when empty). */
  latest(): Promise<bigint | null>;
  /** Rows with id > `after`, or created within the last `overlapMs`, oldest first. */
  since(after: bigint, overlapMs: number): Promise<InvalidationRow[]>;
}

export interface FeedOptions {
  readonly source: InvalidationSource;
  /** Applies tags to this process's caches. */
  readonly apply: (tags: readonly string[]) => void;
  /** Drops everything this process has cached. */
  readonly clear: () => void;
  readonly isTag: (value: unknown) => boolean;
  readonly intervalMs?: number;
  readonly overlapMs?: number;
  /** The source's row limit: a full page means this process fell too far behind. */
  readonly readLimit?: number;
  readonly onError?: (error: unknown) => void;
  readonly onApplied?: (rows: number, lagMs: number) => void;
}

export class InvalidationFeed {
  private cursor: bigint | null = null;
  private lastSync = Number.NEGATIVE_INFINITY;
  private inflight: Promise<void> | null = null;
  /** Ids applied within the overlap window (id → createdAt ms). */
  private readonly seen = new Map<bigint, number>();
  private readonly intervalMs: number;
  private readonly overlapMs: number;

  constructor(private readonly options: FeedOptions) {
    this.intervalMs = options.intervalMs ?? 1_000;
    this.overlapMs = options.overlapMs ?? 10_000;
  }

  /** Brings this process's caches up to date with the log (throttled). */
  sync(now: number = Date.now()): Promise<void> {
    if (this.inflight) return this.inflight;
    if (now - this.lastSync < this.intervalMs) return Promise.resolve();
    this.inflight = this.read(now).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async read(now: number): Promise<void> {
    try {
      if (this.cursor === null) {
        // First read: this process's caches were filled before it knew the
        // log's position, so start clean from the current head.
        const latest = await this.options.source.latest();
        this.options.clear();
        this.cursor = latest ?? 0n;
        this.lastSync = now;
        return;
      }
      const rows = await this.options.source.since(this.cursor, this.overlapMs);
      if (this.options.readLimit !== undefined && rows.length >= this.options.readLimit) {
        // Too far behind to apply row by row: start clean from the last row read.
        this.options.clear();
        for (const row of rows) if (row.id > this.cursor) this.cursor = row.id;
        this.seen.clear();
        this.lastSync = now;
        return;
      }
      const fresh = rows.filter((row) => !this.seen.has(row.id));
      const tags = [
        ...new Set(fresh.flatMap((row) => row.tags.filter((t) => this.options.isTag(t)))),
      ];
      if (tags.length > 0) this.options.apply(tags);
      let newest = Number.NEGATIVE_INFINITY;
      for (const row of rows) {
        if (row.id > this.cursor) this.cursor = row.id;
        newest = Math.max(newest, row.createdAt.getTime());
      }
      for (const row of fresh) this.seen.set(row.id, row.createdAt.getTime());
      // Forget ids that have left the overlap window (measured in the
      // database's clock, which stamped them).
      for (const [id, at] of this.seen) if (at < newest - 2 * this.overlapMs) this.seen.delete(id);
      if (fresh.length > 0) {
        const oldest = Math.min(...fresh.map((row) => row.createdAt.getTime()));
        this.options.onApplied?.(fresh.length, Math.max(0, now - oldest));
      }
      this.lastSync = now;
    } catch (error) {
      // Serve nothing cached from before the failure; retry on the next request.
      this.options.clear();
      this.lastSync = now;
      this.options.onError?.(error);
    }
  }
}
