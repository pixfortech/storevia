import "server-only";
import { systemDb } from "@storevia/database/system";
import {
  consumeRateLimitsWith,
  consumeRateLimitWith,
  type RateLimitResult,
  type RateLimitRule,
} from "./rate-limit-core";

export type { RateLimitResult, RateLimitRule } from "./rate-limit-core";

/** Rate limit on the identity scope (system role). */
export function consumeRateLimit(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
  return consumeRateLimitWith(systemDb(), rule, subject);
}

export function consumeRateLimits(
  checks: readonly (readonly [RateLimitRule, string | null])[],
): Promise<RateLimitResult> {
  return consumeRateLimitsWith(systemDb(), checks);
}
