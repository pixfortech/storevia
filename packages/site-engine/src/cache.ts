// The public site's data cache (ADR-0028 §9, ADR-0029). Page data is cached in process
// by key and indexed by cache tags; the worker's invalidations (outbox →
// /api/internal/revalidate) drop every entry carrying a tag. A TTL is only a
// safety net for a lost invalidation. Concurrent misses for one key share a
// single load, so a burst of traffic to a cold page runs its queries once.
// Pages render dynamically on top of this, so status codes (404, 503) are
// decided before anything is sent.

export interface CacheOptions {
  readonly ttlMs: number;
  readonly maxEntries: number;
}

interface Entry {
  readonly value: unknown;
  readonly tags: readonly string[];
  readonly expires: number;
}

export class TagCache {
  private readonly entries = new Map<string, Entry>();
  private readonly byTag = new Map<string, Set<string>>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  /**
   * Invalidation clock. A load that started before one of its tags was
   * invalidated is returned but not stored, so a racing invalidation can't
   * be undone by a slow read. Old per-tag marks are forgotten past a bound;
   * `floor` then rejects anything that started before the purge.
   */
  private generation = 0;
  private floor = 0;
  private readonly invalidatedAt = new Map<string, number>();

  constructor(private readonly options: CacheOptions) {}

  async get<T>(
    key: string,
    load: () => Promise<{ readonly value: T; readonly tags: readonly string[] }>,
    now: () => number = Date.now,
  ): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expires > now()) {
      // Refresh recency for LRU eviction.
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit.value as T;
    }
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;
    const started = this.generation;
    const promise = load()
      .then(({ value, tags }) => {
        if (this.fresh(started, tags)) this.store(key, value, tags, now());
        return value;
      })
      .finally(() => {
        if (this.inflight.get(key) === promise) this.inflight.delete(key);
      });
    this.inflight.set(key, promise);
    return promise;
  }

  private fresh(started: number, tags: readonly string[]): boolean {
    return (
      started >= this.floor && tags.every((tag) => (this.invalidatedAt.get(tag) ?? 0) <= started)
    );
  }

  private store(key: string, value: unknown, tags: readonly string[], at: number): void {
    this.remove(key);
    while (this.entries.size >= this.options.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.remove(oldest);
    }
    this.entries.set(key, { value, tags, expires: at + this.options.ttlMs });
    for (const tag of tags) {
      let keys = this.byTag.get(tag);
      if (!keys) this.byTag.set(tag, (keys = new Set()));
      keys.add(key);
    }
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    for (const tag of entry.tags) {
      const keys = this.byTag.get(tag);
      keys?.delete(key);
      if (keys?.size === 0) this.byTag.delete(tag);
    }
  }

  /** Drops every entry carrying any of the tags; returns how many were dropped. */
  invalidate(tags: readonly string[]): number {
    this.generation += 1;
    if (this.invalidatedAt.size > 50_000) {
      this.invalidatedAt.clear();
      this.floor = this.generation;
    }
    // Requests after this point never join a load that started before it.
    this.inflight.clear();
    let dropped = 0;
    for (const tag of tags) {
      this.invalidatedAt.set(tag, this.generation);
      for (const key of [...(this.byTag.get(tag) ?? [])]) {
        this.remove(key);
        dropped += 1;
      }
    }
    return dropped;
  }

  clear(): void {
    this.generation += 1;
    this.floor = this.generation;
    this.invalidatedAt.clear();
    this.inflight.clear();
    this.entries.clear();
    this.byTag.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

const globalCache = globalThis as typeof globalThis & { __storeviaStorefrontCache?: TagCache };

/** One cache per process (kept across development hot reloads). */
export function pageDataCache(): TagCache {
  globalCache.__storeviaStorefrontCache ??= new TagCache({ ttlMs: 5 * 60_000, maxEntries: 5_000 });
  return globalCache.__storeviaStorefrontCache;
}
