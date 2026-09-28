// An in-process stand-in for the parts of Razorpay's API Storevia calls
// (payment links, refunds) and for its signed webhooks. CI exercises the
// real RazorpayProvider end to end against it; no credentials, no network,
// no money (M8). Shapes follow Razorpay's documented responses; the
// sandbox validation script (packages/payments/scripts/razorpay-sandbox.ts) checks
// the same flow against Razorpay's test mode.
import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeLink {
  id: string;
  status: "created" | "paid" | "cancelled" | "expired";
  amount: number;
  currency: string;
  reference_id: string;
  short_url: string;
  payments: { payment_id: string; amount: number; status: string }[];
}

export interface FakeRefundCall {
  readonly paymentId: string;
  readonly amount: number;
  readonly idempotencyKey: string | null;
  readonly authorised: boolean;
}

/** How the next refund request is answered. */
export type RefundMode = "processed" | "pending" | "drop-connection" | "decline";

export class FakeRazorpay {
  readonly links = new Map<string, FakeLink>();
  readonly refundCalls: FakeRefundCall[] = [];
  refundMode: RefundMode = "processed";
  private readonly refundsByKey = new Map<string, { id: string; status: string }>();
  private server: Server | null = null;
  private counter = 0;

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
  ) {}

  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      void this.handle(req).then(
        (reply) => {
          if (reply === "drop") {
            req.socket.destroy();
            return;
          }
          res.writeHead(reply.status, { "content-type": "application/json" });
          res.end(JSON.stringify(reply.body));
        },
        () => {
          res.writeHead(500).end();
        },
      );
    });
    await new Promise<void>((resolve) => this.server?.listen(0, "127.0.0.1", resolve));
    const { port } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${String(port)}/v1`;
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }

  private id(prefix: string): string {
    this.counter += 1;
    return `${prefix}_Fk${String(this.counter).padStart(10, "0")}`;
  }

  private async handle(req: IncomingMessage): Promise<{ status: number; body: unknown } | "drop"> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const expected = `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`;
    const authorised = req.headers.authorization === expected;
    const path = (req.url ?? "").replace(/^\/v1/, "");

    const refund = /^\/payments\/(pay_[A-Za-z0-9]+)\/refund$/.exec(path);
    if (req.method === "POST" && refund) {
      const key = (req.headers["x-refund-idempotency"] as string | undefined) ?? null;
      this.refundCalls.push({
        paymentId: refund[1] ?? "",
        amount: Number(body["amount"]),
        idempotencyKey: key,
        authorised,
      });
      if (!authorised) return { status: 401, body: { error: { code: "BAD_REQUEST_ERROR" } } };
      const mode = this.refundMode;
      // Razorpay's idempotency: the same key returns the first refund.
      const existing = key ? this.refundsByKey.get(key) : undefined;
      if (existing) return { status: 200, body: { ...existing, entity: "refund" } };
      if (mode === "decline") {
        return { status: 400, body: { error: { code: "BAD_REQUEST_ERROR" } } };
      }
      const created = { id: this.id("rfnd"), status: mode === "pending" ? "pending" : "processed" };
      if (key) this.refundsByKey.set(key, created);
      // The refund is made, but the answer never arrives (a timeout).
      if (mode === "drop-connection") return "drop";
      return { status: 200, body: { ...created, entity: "refund" } };
    }

    if (!authorised) return { status: 401, body: { error: { code: "BAD_REQUEST_ERROR" } } };

    if (req.method === "POST" && path === "/payment_links") {
      const id = this.id("plink");
      const link: FakeLink = {
        id,
        status: "created",
        amount: Number(body["amount"]),
        currency: String(body["currency"]),
        reference_id: String(body["reference_id"]),
        short_url: `https://rzp.io/i/${id}`,
        payments: [],
      };
      this.links.set(id, link);
      return { status: 200, body: link };
    }
    const link = /^\/payment_links\/(plink_[A-Za-z0-9]+)(\/cancel)?$/.exec(path);
    const found = link ? this.links.get(link[1] ?? "") : undefined;
    if (link && !found) return { status: 404, body: { error: { code: "BAD_REQUEST_ERROR" } } };
    if (found && req.method === "GET" && !link?.[2]) return { status: 200, body: found };
    if (found && req.method === "POST" && link?.[2]) {
      if (found.status !== "created") {
        return { status: 400, body: { error: { code: "BAD_REQUEST_ERROR" } } };
      }
      found.status = "cancelled";
      return { status: 200, body: found };
    }
    return { status: 404, body: { error: { code: "NOT_FOUND" } } };
  }

  /** The shopper pays the link in full; returns the captured payment id. */
  pay(linkId: string): string {
    const link = this.links.get(linkId);
    if (!link) throw new Error(`no link ${linkId}`);
    const paymentId = this.id("pay");
    link.status = "paid";
    link.payments.push({ payment_id: paymentId, amount: link.amount, status: "captured" });
    return paymentId;
  }

  /** A webhook delivery as Razorpay sends it, signed with the webhook secret. */
  webhook(
    webhookSecret: string,
    event: "payment_link.paid" | "payment_link.cancelled" | "payment_link.expired",
    linkId: string,
    options: { readonly eventId?: string; readonly accountId?: string } = {},
  ): { body: Uint8Array; headers: Headers } {
    const link = this.links.get(linkId);
    if (!link) throw new Error(`no link ${linkId}`);
    const payment = link.payments.at(-1);
    const payload = {
      entity: "event",
      account_id: options.accountId ?? "acc_Fake00000001",
      event,
      contains: ["payment_link", ...(payment ? ["payment"] : [])],
      payload: {
        payment_link: { entity: link },
        ...(payment
          ? {
              payment: {
                entity: {
                  id: payment.payment_id,
                  amount: payment.amount,
                  currency: link.currency,
                  status: payment.status,
                },
              },
            }
          : {}),
      },
      created_at: Math.floor(Date.now() / 1000),
    };
    const body = new TextEncoder().encode(JSON.stringify(payload));
    const signature = createHmac("sha256", webhookSecret).update(body).digest("hex");
    return {
      body,
      headers: new Headers({
        "content-type": "application/json",
        "x-razorpay-signature": signature,
        "x-razorpay-event-id": options.eventId ?? this.id("evt"),
      }),
    };
  }
}
