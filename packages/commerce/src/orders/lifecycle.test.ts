import { describe, expect, it } from "vitest";
import {
  allowedStatus,
  completionBlockers,
  nextShipmentStatus,
  orderDeliveryStatus,
  orderState,
} from "./lifecycle";

const f = (
  shipmentStatus: Parameters<typeof allowedStatus>[1],
  state: "SUCCESS" | "CANCELLED" = "SUCCESS",
) => ({ state, shipmentStatus });

describe("shipment flow", () => {
  it("local delivery never ships by carrier", () => {
    expect(allowedStatus("LOCAL_DELIVERY", "SHIPPED")).toBe(false);
    expect(allowedStatus("LOCAL_DELIVERY", "IN_TRANSIT")).toBe(false);
    expect(allowedStatus("LOCAL_DELIVERY", "OUT_FOR_DELIVERY")).toBe(true);
    expect(allowedStatus("SHIPPING", "IN_TRANSIT")).toBe(true);
  });

  it("suggests the next step", () => {
    expect(nextShipmentStatus("SHIPPING", "READY")).toBe("SHIPPED");
    expect(nextShipmentStatus("SHIPPING", "SHIPPED")).toBe("IN_TRANSIT");
    expect(nextShipmentStatus("LOCAL_DELIVERY", "READY")).toBe("OUT_FOR_DELIVERY");
    expect(nextShipmentStatus("LOCAL_DELIVERY", "DELIVERED")).toBeNull();
  });
});

describe("order delivery status", () => {
  it("follows the fulfilments, and is delivered only when everything is", () => {
    expect(orderDeliveryStatus("UNFULFILLED", [])).toBe("NOT_STARTED");
    expect(orderDeliveryStatus("FULFILLED", [f("READY")])).toBe("READY");
    expect(orderDeliveryStatus("FULFILLED", [f("READY"), f("SHIPPED")])).toBe("IN_TRANSIT");
    expect(orderDeliveryStatus("FULFILLED", [f("DELIVERED"), f("SHIPPED")])).toBe(
      "PARTIALLY_DELIVERED",
    );
    expect(orderDeliveryStatus("PARTIALLY_FULFILLED", [f("DELIVERED")])).toBe(
      "PARTIALLY_DELIVERED",
    );
    expect(orderDeliveryStatus("FULFILLED", [f("DELIVERED"), f("DELIVERED")])).toBe("DELIVERED");
    // Cancelled fulfilments don't count.
    expect(orderDeliveryStatus("FULFILLED", [f("DELIVERED"), f("READY", "CANCELLED")])).toBe(
      "DELIVERED",
    );
  });
});

describe("completion", () => {
  const base = {
    status: "OPEN" as const,
    completedAt: null,
    paymentStatus: "PAID",
    fulfilmentStatus: "FULFILLED",
    deliveryStatus: "DELIVERED" as const,
  };

  it("needs settled payment, every item fulfilled and delivered", () => {
    expect(completionBlockers(base)).toEqual([]);
    expect(completionBlockers({ ...base, paymentStatus: "PENDING" })).toEqual([
      "Payment isn't settled.",
    ]);
    expect(completionBlockers({ ...base, fulfilmentStatus: "PARTIALLY_FULFILLED" })).toEqual([
      "Not every item is fulfilled.",
    ]);
    expect(completionBlockers({ ...base, deliveryStatus: "IN_TRANSIT" })).toEqual([
      "Not every fulfilment is delivered.",
    ]);
    // Shipped isn't complete.
    expect(completionBlockers({ ...base, deliveryStatus: "IN_TRANSIT" }).length).toBeGreaterThan(0);
    expect(completionBlockers({ ...base, paymentStatus: "PARTIALLY_REFUNDED" })).toEqual([]);
  });

  it("never completes a cancelled order", () => {
    expect(completionBlockers({ ...base, status: "CANCELLED" })).toEqual([
      "The order is cancelled.",
    ]);
    expect(orderState({ status: "CANCELLED", completedAt: null })).toBe("CANCELLED");
    expect(orderState({ status: "OPEN", completedAt: new Date() })).toBe("COMPLETED");
  });
});
