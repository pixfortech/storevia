import "server-only";
import { checkoutDb, withCheckout } from "@storevia/database/checkout";
import { createLogger, errorFields, recordMetric } from "@storevia/observability";
import {
  getTestPaymentProvider,
  WebhookPayloadError,
  WebhookVerificationError,
  type TestOutcome,
} from "@storevia/payments";
import { consumeRateLimitWith, type RateLimitRule } from "@storevia/security/rate-limit";
import { DomainError, notFound, parseTypeId, toTypeId } from "@storevia/types";
import { applyPaymentOutcome } from "./confirm";
import { connectionById, openConnection } from "./connection";
import { loadCheckout } from "./load";
import type { CheckoutRequest } from "./service";
import { hashCheckoutToken, isCheckoutToken } from "./tokens";

// Inbound payment webhooks (ADR-0031 §4). The URL names a connection; its
// store is learned from the connection (never from the payload), the body
// is verified with that connection's own secret over the exact bytes
// received, and only then parsed. Each provider event is recorded once per
// store (unique key) in the same transaction that applies it, so a
// duplicate delivery finds the event already processed and changes nothing.
// Logs carry ids and reasons only: no signatures, secrets or payloads.

const log = createLogger({ component: "payment-webhooks" });

const RULES = {
  all: { name: "checkout:webhook", limit: 600, windowSeconds: 60 },
  failures: { name: "checkout:webhook-fail", limit: 20, windowSeconds: 300 },
} as const satisfies Record<string, RateLimitRule>;

export type WebhookResult =
  | { readonly status: 200; readonly outcome: "processed" | "duplicate" | "ignored" }
  | { readonly status: 400 | 401 | 404 | 429; readonly outcome: "rejected" };

interface ConnectionScope {
  organisation_id: string;
  store_id: string;
  provider: string;
}

/** Whether this connection's failed-signature budget is spent (checked before any work). */
async function failuresExceeded(connectionId: string): Promise<boolean> {
  const now = Date.now();
  const windowMs = RULES.failures.windowSeconds * 1000;
  const windowStart = BigInt(now - (now % windowMs));
  const rows = await checkoutDb().$queryRaw<{ count: number }[]>`
    SELECT count FROM "RateLimit"
    WHERE key = ${`${RULES.failures.name}:${connectionId}`} AND "lastRequest" >= ${windowStart}`;
  return (rows[0]?.count ?? 0) >= RULES.failures.limit;
}

/** Records a delivery that failed verification. */
async function recordFailure(connectionId: string, reason: string, provider: string) {
  await consumeRateLimitWith(checkoutDb(), RULES.failures, connectionId);
  recordMetric("payments.webhook_rejected", 1, { provider, reason });
  log.warn("payment webhook rejected", { connectionId, provider, reason });
}

/**
 * Handles one delivery to /api/webhooks/payments/{connectionId}. The raw
 * body must be the exact bytes received.
 */
export async function ingestPaymentWebhook(
  connectionPublicId: string,
  rawBody: Uint8Array,
  headers: Headers,
): Promise<WebhookResult> {
  const connectionId = parseTypeId("paymentConnection", connectionPublicId);
  if (!connectionId) return { status: 404, outcome: "rejected" };
  if (rawBody.byteLength > 64 * 1024) return { status: 400, outcome: "rejected" };

  const scopes = await checkoutDb().$queryRaw<ConnectionScope[]>`
    SELECT organisation_id, store_id, provider FROM app_payment_connection_scope(${connectionId}::uuid)`;
  const scope = scopes[0];
  if (!scope) return { status: 404, outcome: "rejected" };

  const flood = await consumeRateLimitWith(checkoutDb(), RULES.all, connectionId);
  if (!flood.allowed || (await failuresExceeded(connectionId))) {
    recordMetric("payments.webhook_throttled", 1, { provider: scope.provider });
    return { status: 429, outcome: "rejected" };
  }

  const base = { organisationId: scope.organisation_id, storeId: scope.store_id };
  const connection = await withCheckout(base, (tx) => connectionById(tx, connectionId));
  const open = connection ? openConnection(connection) : null;
  // A provider that isn't available here (the test provider in production) has no endpoint.
  if (!open) return { status: 404, outcome: "rejected" };

  try {
    open.provider.verifyWebhook(open.credentials, rawBody, headers);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      await recordFailure(connectionId, error.reason, scope.provider);
      return { status: 401, outcome: "rejected" };
    }
    throw error;
  }

  let event: ReturnType<typeof open.provider.parseWebhook>;
  try {
    event = open.provider.parseWebhook(open.credentials, rawBody, headers);
  } catch (error) {
    if (error instanceof WebhookPayloadError) {
      recordMetric("payments.webhook_malformed", 1, { provider: scope.provider });
      log.warn("payment webhook malformed", { connectionId, provider: scope.provider });
      return { status: 400, outcome: "rejected" };
    }
    throw error;
  }

  const payment = event.payment;
  // What is kept of the event: its meaning, never the provider's raw payload.
  const recorded = {
    type: event.type,
    providerPaymentId: payment?.providerPaymentId ?? null,
    status: payment?.status ?? null,
    amount: payment?.amount?.toString() ?? null,
    currency: payment?.currency ?? null,
  };

  try {
    return await withCheckout(base, async (tx, setCheckout) => {
      const inserted = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "PaymentWebhookEvent" (id, "organisationId", "storeId", provider, "providerEventId",
          type, status, attempts, payload)
        VALUES (gen_random_uuid(), ${scope.organisation_id}::uuid, ${scope.store_id}::uuid,
          ${scope.provider}, ${event.eventId}, ${event.type.slice(0, 100)}, 'PROCESSING', 1,
          ${JSON.stringify(recorded)}::jsonb)
        ON CONFLICT ("storeId", provider, "providerEventId") DO NOTHING
        RETURNING id`;
      const eventRow = inserted[0];
      if (!eventRow) {
        recordMetric("payments.webhook_duplicate", 1, { provider: scope.provider });
        return { status: 200, outcome: "duplicate" } as const;
      }
      const finish = async (status: "PROCESSED" | "IGNORED") => {
        await tx.$executeRaw`
          UPDATE "PaymentWebhookEvent" SET status = ${status}::"InboundWebhookStatus",
            "processedAt" = now()
          WHERE id = ${eventRow.id}::uuid`;
      };
      if (!payment) {
        await finish("IGNORED");
        return { status: 200, outcome: "ignored" } as const;
      }
      const found = await tx.$queryRaw<{ id: string | null }[]>`
        SELECT app_checkout_for_payment(${scope.provider}, ${payment.providerPaymentId}) AS id`;
      const checkoutId = found[0]?.id ?? null;
      if (!checkoutId) {
        await finish("IGNORED");
        return { status: 200, outcome: "ignored" } as const;
      }
      await setCheckout(checkoutId);
      const outcome = await applyPaymentOutcome(tx, base, checkoutId, payment, scope.provider);
      await finish(outcome.kind === "ignored" ? "IGNORED" : "PROCESSED");
      return {
        status: 200,
        outcome: outcome.kind === "ignored" ? "ignored" : "processed",
      } as const;
    });
  } catch (error) {
    // Nothing was committed: the provider retries the delivery.
    log.error("payment webhook processing failed", { connectionId, ...errorFields(error) });
    recordMetric("payments.webhook_failed", 1, { provider: scope.provider });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// The test provider's hosted page (development and test only)
// ---------------------------------------------------------------------------

export interface TestPaymentView {
  readonly amount: { readonly amount: string; readonly currency: string };
  readonly storeName: string;
}

async function testAttempt(req: CheckoutRequest, providerPaymentId: string) {
  if (!getTestPaymentProvider() || !isCheckoutToken(req.token)) return null;
  const tokenHash = hashCheckoutToken(req.token);
  return withCheckout(
    {
      organisationId: req.store.organisationId,
      storeId: req.store.storeId,
      checkoutTokenHash: tokenHash,
    },
    async (tx, setCheckout) => {
      const checkout = await loadCheckout(tx, { tokenHash }, false);
      if (!checkout) return null;
      await setCheckout(checkout.id);
      const rows = await tx.$queryRaw<{ amount: bigint; currency: string; connection: string }[]>`
        SELECT amount, trim(currency) AS currency, "connectionId" AS connection FROM "Payment"
        WHERE provider = 'storevia-test' AND "providerPaymentId" = ${providerPaymentId}
          AND status = 'PENDING'`;
      const row = rows[0];
      if (!row) return null;
      const connection = await connectionById(tx, row.connection);
      return connection ? { ...row, connection } : null;
    },
  );
}

/**
 * The test page's data: the shopper's own pending attempt with this
 * reference, or null (a foreign or finished reference shows "not found").
 */
export async function readTestPayment(
  req: CheckoutRequest,
  providerPaymentId: string,
): Promise<TestPaymentView | null> {
  const attempt = await testAttempt(req, providerPaymentId);
  return attempt
    ? {
        amount: { amount: attempt.amount.toString(), currency: attempt.currency },
        storeName: req.store.name,
      }
    : null;
}

/**
 * The shopper chose an outcome on the test page: the provider "sends" a
 * signed event, which goes through the same webhook pipeline as a real one.
 */
export async function simulateTestPayment(
  req: CheckoutRequest,
  providerPaymentId: string,
  outcome: TestOutcome,
): Promise<void> {
  const provider = getTestPaymentProvider();
  const attempt = await testAttempt(req, providerPaymentId);
  if (!provider || !attempt) throw notFound();
  const open = openConnection(attempt.connection);
  if (!open) throw notFound();
  const event = provider.signedEvent(open.credentials, {
    outcome,
    providerPaymentId,
    amount: attempt.amount,
    currency: attempt.currency,
  });
  const result = await ingestPaymentWebhook(
    toTypeId("paymentConnection", attempt.connection.id),
    new TextEncoder().encode(event.body),
    event.headers,
  );
  if (result.status !== 200) {
    throw new DomainError("CONFLICT", "The test payment couldn't be recorded. Please try again.");
  }
}
