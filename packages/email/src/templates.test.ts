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

describe("order emails", () => {
  const order = {
    storeName: "Asha's <Shop>",
    orderNumber: 1001,
    lines: [{ title: "Mug <b>", quantity: 2, total: "₹2,000.00" }],
    totals: [
      ["Subtotal", "₹2,000.00"],
      ["Total", "₹2,360.00"],
    ] as const,
    shippingAddress: ["Asha Rao", "12 MG Road"],
  };

  it("escapes store and product names and carries no links with tokens", async () => {
    const { orderConfirmationMessage } = await import("./orders");
    const message = orderConfirmationMessage("a@example.test", order);
    expect(message.template).toBe("order-confirmation");
    expect(message.subject).toContain("#1001");
    expect(message.html).not.toContain("<b>");
    expect(message.html).toContain("Mug &lt;b&gt;");
    expect(message.html).toContain("Asha&#39;s &lt;Shop&gt;");
    expect(message.html).not.toMatch(/href=/);
    expect(message.text).toContain("Total: ₹2,360.00");
  });

  it("links a tracking URL only when it is http(s)", async () => {
    const { orderFulfilledMessage } = await import("./orders");
    const shipment = {
      items: [{ title: "Mug", quantity: 1 }],
      trackingCompany: "DHL",
      trackingNumber: "123",
    };
    expect(
      orderFulfilledMessage("a@example.test", order, {
        ...shipment,
        trackingUrl: "javascript:alert(1)",
      }).html,
    ).not.toMatch(/href=/);
    expect(
      orderFulfilledMessage("a@example.test", order, {
        ...shipment,
        trackingUrl: "https://t.example/1",
      }).html,
    ).toContain('href="https://t.example/1"');
  });
});
