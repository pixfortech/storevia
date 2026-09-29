import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { customerReplyTo, platformReplyTo, safeEmailAddress } from "./reply-to";
import { FileEmailSender } from "./sender";

describe("safeEmailAddress", () => {
  it("accepts one plain address, trimmed", () => {
    expect(safeEmailAddress("help@shop.example")).toBe("help@shop.example");
    expect(safeEmailAddress("  orders+in@mail.shop.co.in ")).toBe("orders+in@mail.shop.co.in");
  });

  it.each([
    ["a header after CRLF", "help@shop.example\r\nBcc: victim@example.com"],
    ["a bare LF", "help@shop.example\nBcc: x@example.com"],
    ["a second address", "help@shop.example, other@example.com"],
    ["a display name", "Shop <help@shop.example>"],
    ["no domain dot", "help@localhost"],
    ["no at sign", "help.shop.example"],
    ["spaces inside", "help @shop.example"],
    ["a control character", "help\u0000@shop.example"],
    ["too long", `${"a".repeat(250)}@shop.example`],
    ["empty", ""],
  ])("refuses %s", (_label, value) => {
    expect(safeEmailAddress(value)).toBeNull();
  });

  it("refuses non-strings", () => {
    expect(safeEmailAddress(null)).toBeNull();
    expect(safeEmailAddress(undefined)).toBeNull();
  });
});

describe("customerReplyTo", () => {
  const env = { EMAIL_FROM: "Storevia <no-reply@storevia.test>" } as NodeJS.ProcessEnv;

  it("prefers the support email, then the contact email", () => {
    expect(
      customerReplyTo({ supportEmail: "help@shop.example", contactEmail: "hi@shop.example" }, env),
    ).toEqual({ address: "help@shop.example", source: "support" });
    expect(customerReplyTo({ supportEmail: null, contactEmail: "hi@shop.example" }, env)).toEqual({
      address: "hi@shop.example",
      source: "contact",
    });
  });

  it("falls back to Storevia's address when the store has none (or only unsafe ones)", () => {
    expect(customerReplyTo({ supportEmail: null, contactEmail: null }, env)).toEqual({
      address: "no-reply@storevia.test",
      source: "platform",
    });
    expect(
      customerReplyTo(
        { supportEmail: "x@shop.example\r\nBcc: y@example.com", contactEmail: null },
        env,
      ),
    ).toEqual({ address: "no-reply@storevia.test", source: "platform" });
  });

  it("the platform fallback: EMAIL_REPLY_TO_FALLBACK, then EMAIL_FROM, then a default", () => {
    expect(
      platformReplyTo({
        EMAIL_REPLY_TO_FALLBACK: "support@storevia.test",
        EMAIL_FROM: "Storevia <no-reply@storevia.test>",
      }),
    ).toBe("support@storevia.test");
    expect(platformReplyTo({ EMAIL_FROM: "no-reply@storevia.test" })).toBe(
      "no-reply@storevia.test",
    );
    expect(platformReplyTo({ EMAIL_REPLY_TO_FALLBACK: "bad\r\nX: y" })).toBe(
      "no-reply@storevia.com",
    );
  });
});

describe("senders", () => {
  it("never write an unsafe Reply-To", async () => {
    const dir = await mkdtemp(join(tmpdir(), "reply-to-"));
    try {
      const sender = new FileEmailSender(dir);
      const base = { to: "shopper@example.test", subject: "s", text: "t", html: "<p>t</p>" };
      await sender.send({ ...base, template: "ok", replyTo: "help@shop.example" });
      await sender.send({ ...base, template: "bad", replyTo: "a@b.example\r\nBcc: c@d.example" });
      const files = await readdir(dir);
      const read = async (template: string) => {
        const file = files.find((f) => f.endsWith(`-${template}.json`)) ?? "";
        return JSON.parse(await readFile(join(dir, file), "utf8")) as { replyTo: unknown };
      };
      expect((await read("ok")).replyTo).toBe("help@shop.example");
      expect((await read("bad")).replyTo).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
