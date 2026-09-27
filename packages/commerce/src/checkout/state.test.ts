import { describe, expect, it } from "vitest";
import {
  assertCheckoutTransition,
  assertOrderTransition,
  assertPaymentTransition,
  canCheckoutTransition,
  canPaymentTransition,
  orderFulfilmentStatus,
  orderPaymentStatus,
  TransitionError,
  type CheckoutStatus,
  type PaymentStatus,
} from "./state";

describe("checkout transitions", () => {
  const all: CheckoutStatus[] = ["OPEN", "PAYMENT_PENDING", "COMPLETED", "EXPIRED"];
  it.each([
    ["OPEN", "PAYMENT_PENDING"],
    ["OPEN", "EXPIRED"],
    ["OPEN", "COMPLETED"],
    ["PAYMENT_PENDING", "OPEN"],
    ["PAYMENT_PENDING", "COMPLETED"],
    ["PAYMENT_PENDING", "EXPIRED"],
    ["EXPIRED", "COMPLETED"],
  ] as const)("allows %s → %s", (from, to) => {
    expect(canCheckoutTransition(from, to)).toBe(true);
  });

  it("allows nothing else: completed is final, expired only completes (late capture)", () => {
    const allowed = new Set([
      "OPEN>PAYMENT_PENDING",
      "OPEN>EXPIRED",
      "OPEN>COMPLETED",
      "PAYMENT_PENDING>OPEN",
      "PAYMENT_PENDING>COMPLETED",
      "PAYMENT_PENDING>EXPIRED",
      "EXPIRED>COMPLETED",
    ]);
    for (const from of all) {
      for (const to of all) {
        expect(canCheckoutTransition(from, to), `${from}>${to}`).toBe(allowed.has(`${from}>${to}`));
      }
    }
    expect(() => {
      assertCheckoutTransition("EXPIRED", "OPEN");
    }).toThrow(TransitionError);
    expect(() => {
      assertCheckoutTransition("COMPLETED", "OPEN");
    }).toThrow(TransitionError);
  });
});

describe("payment transitions", () => {
  it("captures once, and records a late capture after failure or cancellation", () => {
    const all: PaymentStatus[] = ["PENDING", "CAPTURED", "FAILED", "CANCELLED"];
    const allowed = new Set([
      "PENDING>CAPTURED",
      "PENDING>FAILED",
      "PENDING>CANCELLED",
      "FAILED>CAPTURED",
      "CANCELLED>CAPTURED",
    ]);
    for (const from of all) {
      for (const to of all) {
        expect(canPaymentTransition(from, to), `${from}>${to}`).toBe(allowed.has(`${from}>${to}`));
      }
    }
    expect(() => {
      assertPaymentTransition("CAPTURED", "FAILED");
    }).toThrow(TransitionError);
  });
});

describe("orders", () => {
  it("cancel once", () => {
    assertOrderTransition("OPEN", "CANCELLED");
    expect(() => {
      assertOrderTransition("CANCELLED", "CANCELLED");
    }).toThrow(TransitionError);
    expect(() => {
      assertOrderTransition("CANCELLED", "OPEN");
    }).toThrow(TransitionError);
  });

  it("derive payment status from refunds", () => {
    expect(orderPaymentStatus(1000n, 0n)).toBe("PAID");
    expect(orderPaymentStatus(1000n, 1n)).toBe("PARTIALLY_REFUNDED");
    expect(orderPaymentStatus(1000n, 999n)).toBe("PARTIALLY_REFUNDED");
    expect(orderPaymentStatus(1000n, 1000n)).toBe("REFUNDED");
  });

  it("derive fulfilment status from lines", () => {
    expect(orderFulfilmentStatus([{ quantity: 2, fulfilledQuantity: 0 }])).toBe("UNFULFILLED");
    expect(
      orderFulfilmentStatus([
        { quantity: 2, fulfilledQuantity: 2 },
        { quantity: 1, fulfilledQuantity: 0 },
      ]),
    ).toBe("PARTIALLY_FULFILLED");
    expect(
      orderFulfilmentStatus([
        { quantity: 2, fulfilledQuantity: 2 },
        { quantity: 1, fulfilledQuantity: 1 },
      ]),
    ).toBe("FULFILLED");
  });
});
