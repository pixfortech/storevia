import "server-only";
import { withCheckout } from "@storevia/database/checkout";
import { workerDb } from "@storevia/database/worker";
import { createLogger, errorFields, recordMetric } from "@storevia/observability";
import { applyPaymentOutcome, endAttempt, lockPaymentById } from "./confirm";
import { connectionById, openConnection } from "./connection";
import { loadCheckout } from "./load";
import { assertCheckoutTransition } from "./state";
import { CHECKOUT_LIMITS } from "./tokens";

// Expiry (ADR-0031 §1, §4). The worker role only finds candidates (ids and
// timestamps); every change is made under the checkout role, scoped to the
// one checkout, through the same functions the shopper paths use. A
// pending attempt is never released blind: the provider is asked first, and
// money already taken completes the order instead.

const log = createLogger({ component: "checkout-sweep" });

interface Candidate {
  id: string;
  organisationId: string;
  storeId: string;
  checkoutId: string | null;
}

export interface PaymentSweepResult {
  readonly checked: number;
  readonly captured: number;
  readonly released: number;
  readonly deferred: number;
}

/** Pending attempts past their window: captured → order; otherwise cancel and release. */
export async function sweepExpiredPayments(limit = 50): Promise<PaymentSweepResult> {
  const candidates = await workerDb().$queryRaw<Candidate[]>`
    SELECT id, "organisationId", "storeId", "checkoutId" FROM "Payment"
    WHERE status = 'PENDING' AND "expiresAt" < now()
    ORDER BY "expiresAt" LIMIT ${limit}`;
  let captured = 0;
  let released = 0;
  let deferred = 0;
  for (const c of candidates) {
    if (!c.checkoutId) continue;
    const checkoutId = c.checkoutId;
    const scope = { organisationId: c.organisationId, storeId: c.storeId };
    try {
      const attempt = await withCheckout({ ...scope, checkoutId }, async (tx) => {
        const rows = await tx.$queryRaw<
          { provider: string; ref: string | null; connection: string; status: string }[]
        >`
          SELECT provider, "providerPaymentId" AS ref, "connectionId" AS connection,
            status::text AS status
          FROM "Payment" WHERE id = ${c.id}::uuid`;
        const row = rows[0];
        if (row?.status !== "PENDING") return null;
        return { ...row, connection: await connectionById(tx, row.connection) };
      });
      if (!attempt) continue;
      const open = attempt.connection ? openConnection(attempt.connection) : null;
      if (attempt.ref && open) {
        const state = await open.provider.getPayment(open.credentials, attempt.ref);
        if (state.status === "captured") {
          await withCheckout({ ...scope, checkoutId }, (tx) =>
            applyPaymentOutcome(tx, scope, checkoutId, state, attempt.provider),
          );
          captured += 1;
          continue;
        }
        if (state.status === "pending")
          await open.provider.cancelPayment(open.credentials, attempt.ref);
      }
      await withCheckout({ ...scope, checkoutId }, async (tx) => {
        const checkout = await loadCheckout(tx, { id: checkoutId }, true);
        const payment = await lockPaymentById(tx, c.id);
        if (checkout && payment) {
          await endAttempt(tx, scope, checkout, payment, "CANCELLED", {
            code: "EXPIRED",
            message: "The payment window ended.",
          });
        }
      });
      released += 1;
    } catch (error) {
      // The provider couldn't be asked or refused to cancel: try again next run.
      deferred += 1;
      log.warn("payment expiry deferred", { paymentId: c.id, ...errorFields(error) });
    }
  }
  if (captured > 0) recordMetric("checkout.late_capture", captured);
  if (released > 0) recordMetric("checkout.payment_expired", released);
  return { checked: candidates.length, captured, released, deferred };
}

/** Open checkouts past their expiry become EXPIRED (they hold no stock). */
export async function sweepExpiredCheckouts(limit = 200): Promise<number> {
  const candidates = await workerDb().$queryRaw<
    { id: string; organisationId: string; storeId: string }[]
  >`
    SELECT id, "organisationId", "storeId" FROM "Checkout"
    WHERE status = 'OPEN' AND "expiresAt" < now()
    ORDER BY "expiresAt" LIMIT ${limit}`;
  let expired = 0;
  for (const c of candidates) {
    const done = await withCheckout(
      { organisationId: c.organisationId, storeId: c.storeId, checkoutId: c.id },
      async (tx) => {
        const checkout = await loadCheckout(tx, { id: c.id }, true);
        if (checkout?.status !== "OPEN" || !checkout.expired) return false;
        assertCheckoutTransition("OPEN", "EXPIRED");
        await tx.$executeRaw`
          UPDATE "Checkout" SET status = 'EXPIRED', "updatedAt" = now() WHERE id = ${c.id}::uuid`;
        return true;
      },
    );
    if (done) expired += 1;
  }
  if (expired > 0) recordMetric("checkout.expired", expired);
  return expired;
}

/**
 * Expired checkouts keep contact details only for the retention window
 * (ADR-0031 §6), then lose email, addresses and the quote. The worker can't
 * read those columns, so it purges by age; a purged row's updatedAt moves
 * forward, which keeps it out of the next runs.
 */
export async function purgeExpiredCheckouts(limit = 500): Promise<number> {
  const purged = await workerDb().$executeRaw`
    UPDATE "Checkout" SET email = NULL, "shippingAddress" = NULL, "billingAddress" = NULL,
      quote = NULL, "updatedAt" = now()
    WHERE id IN (
      SELECT id FROM "Checkout"
      WHERE status = 'EXPIRED'
        AND "updatedAt" < now() - make_interval(days => ${CHECKOUT_LIMITS.retainExpiredDays})
      ORDER BY "updatedAt" LIMIT ${limit})`;
  if (purged > 0) recordMetric("checkout.purged", purged);
  return purged;
}
