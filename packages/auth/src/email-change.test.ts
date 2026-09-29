import { describe, expect, it } from "vitest";
import {
  decodeEmailChange,
  emailChangeIdentifier,
  emailChangeValuePrefix,
  encodeEmailChange,
  isWellFormedEmailChangeToken,
  maskEmail,
  newEmailChangeToken,
} from "./email-change";

const USER = "01923b6e-6f1a-7c3d-9e2f-0a1b2c3d4e5f";
const SESSION = "01923b6e-7000-7aaa-8bbb-ccccdddd0001";

describe("email change tokens", () => {
  it("are 256-bit, URL-safe and never stored as themselves", () => {
    const token = newEmailChangeToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isWellFormedEmailChangeToken(token)).toBe(true);
    expect(newEmailChangeToken()).not.toBe(token);
    const identifier = emailChangeIdentifier(token);
    expect(identifier).not.toContain(token);
    expect(identifier).toBe(emailChangeIdentifier(token));
    expect(identifier).not.toBe(emailChangeIdentifier(newEmailChangeToken()));
  });

  it("rejects malformed tokens before any lookup", () => {
    for (const bad of [undefined, null, 42, "", "short", "a".repeat(129), "has space".repeat(5)]) {
      expect(isWellFormedEmailChangeToken(bad)).toBe(false);
    }
  });
});

describe("email change requests", () => {
  it("round-trip through the stored value, keyed by user", () => {
    const value = encodeEmailChange({
      userId: USER,
      sessionId: SESSION,
      email: "new@example.test",
    });
    expect(value.startsWith(emailChangeValuePrefix(USER))).toBe(true);
    expect(decodeEmailChange(value)).toEqual({
      userId: USER,
      sessionId: SESSION,
      email: "new@example.test",
    });
  });

  it("ignore other verification rows (Better Auth stores a bare user id)", () => {
    expect(decodeEmailChange(USER)).toBeNull();
    expect(decodeEmailChange(`change-email:${USER}:not-a-session:new@example.test`)).toBeNull();
    expect(decodeEmailChange(`change-email:${USER}:${SESSION}:`)).toBeNull();
  });

  it("refuse to encode malformed ids", () => {
    expect(() =>
      encodeEmailChange({ userId: "x:y", sessionId: SESSION, email: "a@b.test" }),
    ).toThrow();
  });
});

describe("maskEmail", () => {
  it("keeps the first character and the domain", () => {
    expect(maskEmail("asha@example.com")).toBe("a•••@example.com");
    expect(maskEmail("x@y.test")).toBe("x•••@y.test");
    expect(maskEmail("not-an-address")).toBe("•••");
  });
});
