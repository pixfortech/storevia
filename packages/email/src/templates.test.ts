import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileEmailSender } from "./sender";
import { invitationMessage, verifyEmailMessage, contactRequestMessage } from "./templates";

describe("email templates", () => {
  it("escapes user-controlled values in HTML", () => {
    const message = invitationMessage(
      "x@example.test",
      "<script>alert(1)</script>",
      "Acme & Co",
      "ADMIN",
      "https://app.storevia.com/i/abc",
    );
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.html).toContain("Acme &amp; Co");
  });
});

describe("FileEmailSender", () => {
  it("writes messages as JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "storevia-mail-"));
    await new FileEmailSender(dir).send(
      verifyEmailMessage("a@example.test", "A", "https://x.test/v?token=t"),
    );
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    const parsed = JSON.parse(await readFile(join(dir, files[0] ?? ""), "utf8")) as {
      template: string;
      to: string;
    };
    expect(parsed).toMatchObject({ template: "verify-email", to: "a@example.test" });
  });
});

describe("contactRequestMessage", () => {
  const message = contactRequestMessage("hello@storevia.test", {
    name: "Ana\r\nBcc: victim@example.test",
    email: "ana@example.test",
    company: "",
    topic: "Plans and pricing",
    message: "<script>alert(1)</script>\n\nSecond paragraph",
  });

  it("keeps visitor input out of headers and escapes it in HTML", () => {
    expect(message.subject).not.toMatch(/[\r\n]/);
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.text).toContain("Company: Not given");
    expect(message.template).toBe("contact-request");
  });
});
