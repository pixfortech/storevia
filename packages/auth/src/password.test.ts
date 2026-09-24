import { describe, expect, it } from "vitest";
import { hashPassword, isBreachedPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("hashes with Argon2id at the OWASP parameters and verifies", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });

  it("treats malformed hashes as a failed verification", async () => {
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });

  it("skips the breach check when disabled", async () => {
    process.env["AUTH_BREACHED_PASSWORD_CHECK"] = "off";
    expect(await isBreachedPassword("password")).toBe(false);
  });
});
