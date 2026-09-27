import { afterEach, describe, expect, it, vi } from "vitest";

// The credential key ring check the development seed reports from: a
// missing or malformed PAYMENT_CREDENTIALS_KEYS is described without ever
// echoing the value. Each case loads the registry afresh (the cipher is
// cached once built).
async function problemWith(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) vi.stubEnv("PAYMENT_CREDENTIALS_KEYS", undefined);
  else vi.stubEnv("PAYMENT_CREDENTIALS_KEYS", value);
  const { credentialsKeysProblem } = await import("./registry");
  return credentialsKeysProblem();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("credentialsKeysProblem", () => {
  it("accepts a usable key ring", async () => {
    expect(await problemWith(`1:${Buffer.alloc(32, 7).toString("base64")}`)).toBeNull();
  });

  it("describes a missing, placeholder or short key without echoing it", async () => {
    expect(await problemWith(undefined)).toMatch(/not set/);
    const placeholder = await problemWith("replace-me");
    expect(placeholder).toMatch(/malformed/);
    expect(placeholder).not.toContain("replace-me");
    const short = await problemWith("1:c2hvcnRrZXk=");
    expect(short).toMatch(/32 bytes/);
    expect(short).not.toContain("c2hvcnRrZXk=");
  });
});
