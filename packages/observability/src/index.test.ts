import { afterEach, describe, expect, it } from "vitest";
import { createLogger, errorFields, recordMetric, redact, setLogSink } from "./index";

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

  it("records metrics as structured lines", () => {
    capture();
    recordMetric("billing.webhook", 1, { outcome: "processed" });
    expect(lines[0]?.record).toMatchObject({
      type: "metric",
      metric: "billing.webhook",
      tags: { outcome: "processed" },
    });
  });
});
