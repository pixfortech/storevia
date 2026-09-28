// The multi-instance invalidation feed (M8), against an in-memory log.
import { describe, expect, it, vi } from "vitest";
import {
  InvalidationFeed,
  type InvalidationRow,
  type InvalidationSource,
} from "./invalidation-feed";

class MemoryLog implements InvalidationSource {
  /** Committed rows (what a reader can see). */
  rows: InvalidationRow[] = [];
  failing = false;
  reads = 0;
  constructor(private readonly clock: () => number) {}
  add(id: number, tags: string[], at = this.clock()): void {
    this.rows.push({ id: BigInt(id), tags, createdAt: new Date(at) });
  }
  latest(): Promise<bigint | null> {
    this.reads += 1;
    if (this.failing) return Promise.reject(new Error("down"));
    const ids = this.rows.map((r) => r.id);
    return Promise.resolve(ids.length ? ids.reduce((a, b) => (a > b ? a : b)) : null);
  }
  since(after: bigint, overlapMs: number): Promise<InvalidationRow[]> {
    this.reads += 1;
    if (this.failing) return Promise.reject(new Error("down"));
    const now = this.clock();
    return Promise.resolve(
      this.rows
        .filter((r) => r.id > after || r.createdAt.getTime() > now - overlapMs)
        .sort((a, b) => (a.id < b.id ? -1 : 1)),
    );
  }
}

function setup(options: { readLimit?: number } = {}) {
  let now = 1_000_000;
  const log = new MemoryLog(() => now);
  const applied: string[][] = [];
  const clear = vi.fn();
  const onError = vi.fn();
  const feed = new InvalidationFeed({
    source: log,
    apply: (tags) => applied.push([...tags]),
    clear,
    isTag: (t) => typeof t === "string" && /^[a-z]+:[a-z0-9.-]+$/.test(t),
    intervalMs: 1_000,
    overlapMs: 10_000,
    onError,
    ...options,
  });
  return {
    log,
    applied,
    clear,
    onError,
    feed,
    tick: (ms: number) => (now += ms),
    sync: () => feed.sync(now),
  };
}

describe("invalidation feed", () => {
  it("starts clean at the log's head, then applies only newer rows", async () => {
    const t = setup();
    t.log.add(1, ["store:a"]);
    await t.sync();
    expect(t.clear).toHaveBeenCalledTimes(1);
    expect(t.applied).toEqual([]);
    t.tick(20_000); // row 1 leaves the overlap window
    t.log.add(2, ["store:b", "host:shop.example"]);
    t.tick(1_000);
    await t.sync();
    expect(t.applied).toEqual([["store:b", "host:shop.example"]]);
  });

  it("reads at most once per interval and shares a read between concurrent callers", async () => {
    const t = setup();
    await t.sync();
    const reads = t.log.reads;
    await Promise.all([t.sync(), t.sync(), t.sync()]);
    expect(t.log.reads).toBe(reads);
    t.tick(1_000);
    await Promise.all([t.sync(), t.sync(), t.sync()]);
    expect(t.log.reads).toBe(reads + 1);
  });

  it("applies a row that commits after a higher id was read (late commit)", async () => {
    const t = setup();
    await t.sync();
    t.log.add(5, ["store:five"]);
    t.tick(1_000);
    await t.sync();
    // id 4 was assigned first but its transaction committed later.
    t.log.add(4, ["store:four"]);
    t.tick(1_000);
    await t.sync();
    expect(t.applied).toEqual([["store:five"], ["store:four"]]);
    // Re-reading the overlap never applies a row twice.
    t.tick(1_000);
    await t.sync();
    expect(t.applied).toHaveLength(2);
  });

  it("ignores malformed tags", async () => {
    const t = setup();
    await t.sync();
    t.log.add(1, ["store:ok", "Bad Tag", "<script>"]);
    t.tick(1_000);
    await t.sync();
    expect(t.applied).toEqual([["store:ok"]]);
  });

  it("clears the caches when the log can't be read, then catches up", async () => {
    const t = setup();
    await t.sync();
    t.clear.mockClear();
    t.log.failing = true;
    t.log.add(1, ["store:missed"]);
    t.tick(1_000);
    await t.sync();
    expect(t.clear).toHaveBeenCalledTimes(1);
    expect(t.onError).toHaveBeenCalledTimes(1);
    t.log.failing = false;
    t.tick(20_000); // past the overlap window: only the cursor can find it
    await t.sync();
    expect(t.applied).toEqual([["store:missed"]]);
  });

  it("starts clean when it has fallen too far behind to apply row by row", async () => {
    const t = setup({ readLimit: 3 });
    await t.sync();
    t.clear.mockClear();
    for (let i = 1; i <= 3; i++) t.log.add(i, [`store:s${String(i)}`]);
    t.tick(1_000);
    await t.sync();
    expect(t.clear).toHaveBeenCalledTimes(1);
    expect(t.applied).toEqual([]);
    t.tick(20_000);
    t.log.add(4, ["store:s4"]);
    t.tick(1_000);
    await t.sync();
    expect(t.applied).toEqual([["store:s4"]]);
  });
});
