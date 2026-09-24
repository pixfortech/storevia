import { describe, expect, it } from "vitest";
import { canTransition, SUBSCRIPTION_STATUSES, type SubscriptionStatus } from "./state-machine";

// The documented table (docs/architecture/05 §2.2), written out independently
// of TRANSITIONS so a change to either shows up here.
const LEGAL = new Set([
  "NONE>TRIAL",
  "NONE>ACTIVE",
  "TRIAL>TRIAL",
  "TRIAL>ACTIVE",
  "TRIAL>PAST_DUE",
  "TRIAL>CANCELLED",
  "TRIAL>EXPIRED",
  "ACTIVE>ACTIVE",
  "ACTIVE>PAST_DUE",
  "ACTIVE>CANCELLED",
  "ACTIVE>EXPIRED",
  "PAST_DUE>PAST_DUE",
  "PAST_DUE>ACTIVE",
  "PAST_DUE>CANCELLED",
  "PAST_DUE>EXPIRED",
  "CANCELLED>CANCELLED",
  "CANCELLED>ACTIVE",
  "CANCELLED>EXPIRED",
]);

describe("subscription transitions", () => {
  const froms: (SubscriptionStatus | null)[] = [null, ...SUBSCRIPTION_STATUSES];
  for (const from of froms) {
    for (const to of SUBSCRIPTION_STATUSES) {
      const key = `${from ?? "NONE"}>${to}`;
      it(`${key} is ${LEGAL.has(key) ? "legal" : "illegal"}`, () => {
        expect(canTransition(from, to)).toBe(LEGAL.has(key));
      });
    }
  }

  it("EXPIRED is terminal", () => {
    for (const to of SUBSCRIPTION_STATUSES) expect(canTransition("EXPIRED", to)).toBe(false);
  });
});
