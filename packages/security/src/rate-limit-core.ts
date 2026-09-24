// Rate limiting over any connection allowed to write the RateLimit table.
// The identity/auth paths use the system role (rate-limit.ts); the marketing
// site uses its own role, confined by RLS to "marketing:" keys (ADR-0025).
import "server-only";
import type { PrismaClient } from "@storevia/database";
import { uuidv7 } from "@storevia/types";

export type RateLimitDb = Pick<PrismaClient, "$queryRaw">;

export interface RateLimitRule {
  /** Bucket name, e.g. "sign-in:ip". */
  readonly name: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

/**
 * Fixed-window counter in PostgreSQL (the RateLimit table).
 * One atomic upsert per check, so concurrent requests can't slip past the
 * limit. Redis can replace this behind the same function (ADR-0014).
 */
export async function consumeRateLimitWith(
  db: RateLimitDb,
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = BigInt(now - (now % windowMs));
  const key = `${rule.name}:${subject}`.slice(0, 512);
  const rows = await db.$queryRaw<{ count: number; lastRequest: bigint }[]>`
    INSERT INTO "RateLimit" (id, key, count, "lastRequest")
    VALUES (${uuidv7()}::uuid, ${key}, 1, ${windowStart})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN "RateLimit"."lastRequest" < ${windowStart} THEN 1 ELSE "RateLimit".count + 1 END,
      "lastRequest" = CASE WHEN "RateLimit"."lastRequest" < ${windowStart} THEN ${windowStart} ELSE "RateLimit"."lastRequest" END
    RETURNING count, "lastRequest"`;
  const count = rows[0]?.count ?? rule.limit + 1;
  const resetAt = Number(windowStart) + windowMs;
  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

/**
 * Checks several rules; all are counted, and the request is allowed only if
 * every rule allows it. Rules whose subject is null (e.g. an unknown client
 * IP) are skipped rather than pooled under a shared key, which would turn a
 * per-client limit into a global one.
 */
export async function consumeRateLimitsWith(
  db: RateLimitDb,
  checks: readonly (readonly [RateLimitRule, string | null])[],
): Promise<RateLimitResult> {
  const applicable = checks.filter(
    (check): check is readonly [RateLimitRule, string] => check[1] !== null,
  );
  if (applicable.length === 0) {
    return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterSeconds: 0 };
  }
  const results = await Promise.all(
    applicable.map(([rule, subject]) => consumeRateLimitWith(db, rule, subject)),
  );
  const blocked = results.filter((r) => !r.allowed);
  if (blocked.length === 0) {
    return {
      allowed: true,
      remaining: Math.min(...results.map((r) => r.remaining)),
      retryAfterSeconds: 0,
    };
  }
  return {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: Math.max(...blocked.map((r) => r.retryAfterSeconds)),
  };
}
