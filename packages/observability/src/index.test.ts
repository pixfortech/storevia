import { afterEach, describe, expect, it } from "vitest";
import {
  createLogger,
  errorFields,
  logger,
  bindLogContext,
  recordMetric,
  redact,
  reportRequestError,
  requestIdFrom,
  scrub,
  setLogSink,
  setMetricSink,
  withLogContext,
} from "./index";

let lines: { level: string; record: Record<string, unknown> }[] = [];
let restore: () => void = () => undefined;

function capture(): void {
  lines = [];
  restore = setLogSink((level, line) =>
    lines.push({ level, record: JSON.parse(line) as Record<string, unknown> }),
  );
}

afterEach(() => {
  restore();
});

describe("redact", () => {
  it("replaces secret-looking keys at any depth", () => {
    expect(
      redact({
        password: "p",
        nested: { apiKey: "k", webhookSecret: "s", signature: "sig", authorization: "Bearer x" },
        list: [{ sessionToken: "t" }],
        keep: "value",
      }),
    ).toEqual({
      password: "[REDACTED]",
      nested: {
        apiKey: "[REDACTED]",
        webhookSecret: "[REDACTED]",
        signature: "[REDACTED]",
        authorization: "[REDACTED]",
      },
      list: [{ sessionToken: "[REDACTED]" }],
      keep: "value",
    });
  });

  it("serialises bigint, dates and errors safely", () => {
    const error = Object.assign(new Error("contains user@example.test"), { code: "P2002" });
    const out = redact({ n: 5n, d: new Date("2026-01-01T00:00:00Z"), error }) as Record<
      string,
      unknown
    >;
    expect(out["n"]).toBe("5");
    expect(out["d"]).toBe("2026-01-01T00:00:00.000Z");
    expect(JSON.stringify(out)).not.toContain("user@example.test");
    expect(out["error"]).toMatchObject({ errorName: "Error", errorCode: "P2002" });
  });

  it("errorFields names the database code and constraint of a Prisma error, never its values", () => {
    // The shape Prisma 7 raises (P2039) for a database error it has no code for.
    const error = Object.assign(
      new Error(
        '\nInvalid `tx.mediaAsset.create()` invocation:\n\n→ await tx.mediaAsset.create({ filename: "secret.jpg" })\n' +
          'Database error. Code: `23514`. Message: `new row for relation "MediaAsset" violates check constraint "MediaAsset_storage_key_owned"`',
      ),
      {
        name: "PrismaClientKnownRequestError",
        code: "P2039",
        meta: {
          driverAdapterError: {
            cause: {
              originalCode: "23514",
              kind: "postgres",
              originalMessage:
                'new row for relation "MediaAsset" violates check constraint "MediaAsset_storage_key_owned" DETAIL: Failing row contains (secret.jpg)',
            },
          },
        },
      },
    );
    const fields = errorFields(error);
    expect(fields).toMatchObject({
      errorCode: "P2039",
      dbCode: "23514",
      dbConstraint: "MediaAsset_storage_key_owned",
      dbRelation: "MediaAsset",
    });
    expect(JSON.stringify(fields)).not.toContain("secret.jpg");
    expect((fields["stack"] as string[]).every((line) => line.startsWith("at "))).toBe(true);
  });

  it("errorFields never includes the message", () => {
    expect(JSON.stringify(errorFields(new Error("secret value")))).not.toContain("secret value");
  });
});

describe("logger", () => {
  it("writes JSON lines with bindings and redaction", () => {
    capture();
    const log = createLogger({ service: "test" }).child({ requestId: "req-1" });
    log.warn("webhook rejected", { reason: "invalid_signature", signature: "abc" });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.level).toBe("warn");
    expect(lines[0]?.record).toMatchObject({
      msg: "webhook rejected",
      service: "test",
      requestId: "req-1",
      reason: "invalid_signature",
      signature: "[REDACTED]",
    });
  });

  it("binds correlation fields to everything logged in an async call tree", async () => {
    capture();
    await withLogContext({ requestId: "req-abc-123" }, async () => {
      await Promise.resolve();
      logger.info("inside", { step: 1 });
      await withLogContext({ jobRunId: "run-1" }, () => {
        createLogger({ service: "worker" }).info("nested");
        return Promise.resolve();
      });
    });
    logger.info("outside");
    expect(lines.map((l) => l.record)).toMatchObject([
      { msg: "inside", requestId: "req-abc-123", step: 1 },
      { msg: "nested", requestId: "req-abc-123", jobRunId: "run-1", service: "worker" },
      { msg: "outside" },
    ]);
    expect(lines[2]?.record["requestId"]).toBeUndefined();
  });

  it("honours a well-formed upstream request id and replaces anything else", () => {
    const h = (value: string | null) => ({ get: () => value });
    expect(requestIdFrom(h("edge-7f3a9c21"))).toBe("edge-7f3a9c21");
    for (const bad of [null, "", "short", "has space in it", "x".repeat(129), "a\nforged=1"]) {
      expect(requestIdFrom(h(bad))).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});

describe("personal data and secrets in values (M8)", () => {
  it("scrubs emails, bearer credentials, provider keys, card numbers and opaque tokens", () => {
    const token = "AZBxY29yZGVyLWFjY2Vzcy10b2tlbi1pZC0xMjM0NTY3ODkwYWJjZGVmZ2hpams";
    const text = [
      "shopper asha.k+orders@example.co.in wrote",
      "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig",
      "key rzp_live_AbCdEf123456 and rzp_test_Q1w2E3r4T5",
      "card 4111 1111 1111 1111 and 4111-1111-1111-1111",
      `order link https://shop.example/orders/view/${token}`,
      "hmac 3f5e8a7c9b2d4e6f8a0b1c3d5e7f9a2b4c6d8e0f1a3b5c7d9e1f3a5b7c9d1e3f",
    ].join(" | ");
    const out = scrub(text);
    for (const leaked of [
      "asha.k+orders@example.co.in",
      "eyJhbGciOiJIUzI1NiJ9",
      "rzp_live_AbCdEf123456",
      "rzp_test_Q1w2E3r4T5",
      "4111 1111 1111 1111",
      "4111-1111-1111-1111",
      token,
      "3f5e8a7c9b2d4e6f8a0b1c3d5e7f9a2b4c6d8e0f",
    ]) {
      expect(out).not.toContain(leaked);
    }
    // Ordinary identifiers survive.
    expect(scrub("order 1042 for store 0190f2a4-0000-7000-8000-00000000a002")).toBe(
      "order 1042 for store 0190f2a4-0000-7000-8000-00000000a002",
    );
  });

  it("replaces personal-data keys and scrubs every logged value", () => {
    capture();
    logger.info("notification failed", {
      recipient: "asha@example.com",
      email: "asha@example.com",
      phone: "+91 98765 43210",
      address: { line1: "12 MG Road", postalCode: "560001" },
      body: "Please deliver after 6pm",
      reason: "smtp rejected asha@example.com",
      orderNumber: 1042,
    });
    const line = JSON.stringify(lines[0]?.record);
    for (const leaked of ["asha@example.com", "98765", "MG Road", "560001", "after 6pm"]) {
      expect(line).not.toContain(leaked);
    }
    expect(lines[0]?.record).toMatchObject({ orderNumber: 1042, reason: "smtp rejected [email]" });
  });
});

describe("metrics", () => {
  let points: Record<string, unknown>[] = [];
  let restoreMetrics: () => void = () => undefined;
  afterEach(() => {
    restoreMetrics();
    delete process.env["LOG_LEVEL"];
  });
  const captureMetrics = () => {
    points = [];
    restoreMetrics = setMetricSink((_p, line) =>
      points.push(JSON.parse(line) as Record<string, unknown>),
    );
  };

  it("records metrics as structured lines, with the request id in context", () => {
    captureMetrics();
    withLogContext({ requestId: "req-metric-1" }, () => {
      recordMetric("billing.webhook", 1, { outcome: "processed" });
    });
    expect(points[0]).toMatchObject({
      type: "metric",
      metric: "billing.webhook",
      value: 1,
      tags: { outcome: "processed" },
      requestId: "req-metric-1",
    });
  });

  it("are never dropped by LOG_LEVEL", () => {
    captureMetrics();
    capture();
    process.env["LOG_LEVEL"] = "error";
    logger.info("dropped");
    recordMetric("orders.refund", 1, {});
    expect(lines).toHaveLength(0);
    expect(points).toHaveLength(1);
  });

  it("scrub tag values and ignore malformed names without throwing", () => {
    captureMetrics();
    capture();
    recordMetric("orders.notification_failed", 1, { reason: "rejected asha@example.com" });
    recordMetric("Bad Name", 1, {});
    expect(points).toHaveLength(1);
    expect(JSON.stringify(points[0])).not.toContain("asha@example.com");
    expect(lines[0]?.record).toMatchObject({ msg: "invalid metric name" });
  });
});

describe("request errors (M8)", () => {
  it("log the request id, route and digest; never the message, query or token path", () => {
    capture();
    const points: string[] = [];
    const restoreMetrics = setMetricSink((_p, line) => points.push(line));
    const token = "AZBxY29yZGVyLWFjY2Vzcy10b2tlbi1pZC0xMjM0NTY3ODkwYWJjZGVmZ2hpams";
    const error = Object.assign(new Error("failed for asha@example.com"), { digest: "123456" });
    reportRequestError(
      "storefront",
      error,
      {
        path: `/orders/view/${token}?email=asha@example.com`,
        method: "POST",
        headers: { "x-request-id": "req-err-0001", cookie: "session=abc" },
      },
      { routePath: "/sv/[storeId]/orders/view/[token]", routeType: "action" },
    );
    restoreMetrics();
    const line = JSON.stringify(lines[0]?.record);
    expect(lines[0]?.record).toMatchObject({
      msg: "request failed",
      app: "storefront",
      requestId: "req-err-0001",
      routeType: "action",
      digest: "123456",
      path: "/orders/view/[token]",
    });
    for (const leaked of ["asha@example.com", token, "session=abc"]) {
      expect(line).not.toContain(leaked);
    }
    expect(points[0]).toContain('"metric":"app.request_error"');
  });

  it("bindLogContext tags the rest of the current async flow", async () => {
    capture();
    await withLogContext({}, async () => {
      bindLogContext({ requestId: "req-bound-1" });
      await Promise.resolve();
      logger.info("after bind");
    });
    logger.info("elsewhere");
    expect(lines[0]?.record["requestId"]).toBe("req-bound-1");
    expect(lines[1]?.record["requestId"]).toBeUndefined();
  });
});
