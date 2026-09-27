import "server-only";
import {
  availableProviderKeys,
  credentialsBinding,
  credentialsKeysProblem,
  getPaymentProvider,
  isTestPaymentsEnabled,
  PaymentProviderError,
  razorpayMode,
  sealCredentials,
  type PaymentProviderKey,
} from "@storevia/payments";
import { recordAudit, type TenantContext } from "@storevia/tenancy";
import { DomainError, notFound, uuidv7, validationFailed } from "@storevia/types";
import { inStore, internalId, publicId, type TenantTx } from "../internal";

// Payment settings (ADR-0031 §4), `settings.manage`. Each store connects its
// own provider account; Storevia never holds the money. Credentials are
// sealed (AES-256-GCM, bound to the connection) before they touch the
// database and are never returned: views carry a masked hint only. One
// connection is active at a time; switching disables the other, which keeps
// its credentials so late webhooks for its payments still verify.

export interface PaymentConnectionView {
  readonly id: string;
  readonly provider: string;
  readonly label: string;
  readonly mode: "TEST" | "LIVE";
  readonly status: "PENDING" | "ACTIVE" | "DISABLED" | "ERROR";
  /** Masked, e.g. "rzp_test_…1234". Never a secret. */
  readonly hint: string | null;
  /** Where the provider must send webhooks (path on the dashboard host). */
  readonly webhookPath: string;
  /** False when this provider can't be used in this environment. */
  readonly usable: boolean;
}

export interface PaymentSettings {
  readonly connections: readonly PaymentConnectionView[];
  readonly available: readonly { readonly key: PaymentProviderKey; readonly label: string }[];
  readonly testPaymentsEnabled: boolean;
}

const LABELS: Readonly<Record<string, string>> = {
  "storevia-test": "Test payments",
  razorpay: "Razorpay",
};

export const webhookPath = (connectionId: string) =>
  `/api/webhooks/payments/${publicId("paymentConnection", connectionId)}`;

export async function getPaymentSettings(ctx: TenantContext): Promise<PaymentSettings> {
  return inStore(ctx, "settings.manage", async (tx) => {
    const rows = await tx.paymentProviderConnection.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      // Never the ciphertext: this is a view.
      select: { id: true, provider: true, mode: true, status: true, credentialHint: true },
    });
    return {
      connections: rows.map((r) => ({
        id: publicId("paymentConnection", r.id),
        provider: r.provider,
        label: LABELS[r.provider] ?? r.provider,
        mode: r.mode,
        status: r.status,
        hint: r.credentialHint,
        webhookPath: webhookPath(r.id),
        usable: getPaymentProvider(r.provider) !== null,
      })),
      available: availableProviderKeys().map((key) => ({ key, label: LABELS[key] ?? key })),
      testPaymentsEnabled: isTestPaymentsEnabled(),
    };
  });
}

/** Makes `id` the store's one active connection. */
async function activate(tx: TenantTx, id: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE "PaymentProviderConnection" SET status = 'DISABLED', "updatedAt" = now()
    WHERE status = 'ACTIVE' AND id <> ${id}::uuid`;
  await tx.$executeRaw`
    UPDATE "PaymentProviderConnection" SET status = 'ACTIVE', "updatedAt" = now()
    WHERE id = ${id}::uuid`;
}

async function saveConnection(
  tx: TenantTx,
  store: { readonly organisationId: string; readonly storeId: string },
  provider: PaymentProviderKey,
  mode: "TEST" | "LIVE",
  prepared: {
    credentials: Readonly<Record<string, string>>;
    hint: string;
    externalAccountId: string | null;
  },
): Promise<string> {
  const existing = await tx.paymentProviderConnection.findFirst({
    where: { provider, mode },
    select: { id: true },
  });
  const id = existing?.id ?? uuidv7();
  const sealed = sealCredentials(
    credentialsBinding({ storeId: store.storeId, id, provider }),
    prepared.credentials,
  );
  const data = {
    credentialsCiphertext: Buffer.from(sealed.ciphertext),
    keyVersion: sealed.keyVersion,
    credentialHint: prepared.hint,
    externalAccountId: prepared.externalAccountId,
  };
  if (existing) {
    await tx.paymentProviderConnection.update({ where: { id }, data });
  } else {
    await tx.paymentProviderConnection.create({
      data: {
        id,
        organisationId: store.organisationId,
        storeId: store.storeId,
        provider,
        mode,
        status: "PENDING",
        ...data,
      },
    });
  }
  await activate(tx, id);
  return id;
}

/** Connects the Test Payment Provider (development and test environments only). */
/**
 * Why test payments can't be connected in this environment, as a sentence
 * for a developer (never key material), or null when they can.
 */
export function testPaymentsSetupProblem(): string | null {
  if (!isTestPaymentsEnabled()) {
    return "Test payments are off: set TEST_PAYMENTS_ENABLED=true (development and test only).";
  }
  const keys = credentialsKeysProblem();
  return keys
    ? `PAYMENT_CREDENTIALS_KEYS can't be used (${keys}). Set it to "1:" followed by 32 random bytes in base64.`
    : null;
}

export async function connectTestPayments(
  ctx: TenantContext,
): Promise<{ readonly connectionId: string }> {
  const provider = getPaymentProvider("storevia-test");
  if (!provider || !isTestPaymentsEnabled()) {
    throw new DomainError("CONFLICT", "Test payments aren't available in this environment.");
  }
  return inStore(
    ctx,
    "settings.manage",
    async (tx, store) => {
      const id = await saveConnection(
        tx,
        store,
        "storevia-test",
        "TEST",
        provider.prepareCredentials({}),
      );
      await recordAudit(
        tx,
        store,
        "payments.connected",
        { type: "PaymentProviderConnection", id },
        {
          provider: "storevia-test",
          mode: "TEST",
        },
      );
      return { connectionId: publicId("paymentConnection", id) };
    },
    { write: true },
  );
}

/**
 * Connects the store's own Razorpay account: key id, key secret and the
 * webhook secret the merchant set in Razorpay (optionally the account id,
 * to refuse other accounts' webhooks).
 */
export async function connectRazorpay(
  ctx: TenantContext,
  input: {
    readonly keyId?: unknown;
    readonly keySecret?: unknown;
    readonly webhookSecret?: unknown;
    readonly accountId?: unknown;
  },
): Promise<{ readonly connectionId: string }> {
  const provider = getPaymentProvider("razorpay");
  if (!provider) throw new DomainError("CONFLICT", "Razorpay isn't available.");
  const trim = (v: unknown) => (typeof v === "string" ? v.trim() : v);
  let prepared;
  try {
    prepared = provider.prepareCredentials({
      keyId: trim(input.keyId),
      keySecret: trim(input.keySecret),
      webhookSecret: trim(input.webhookSecret),
      ...(typeof input.accountId === "string" && input.accountId.trim()
        ? { accountId: input.accountId.trim() }
        : {}),
    });
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      const fields = (error as { fieldErrors?: Record<string, string> }).fieldErrors ?? {};
      throw validationFailed(
        Object.keys(fields).length > 0 ? fields : { keyId: "Check the Razorpay keys." },
      );
    }
    throw error;
  }
  const mode = razorpayMode(prepared.credentials["keyId"] ?? "");
  return inStore(
    ctx,
    "settings.manage",
    async (tx, store) => {
      const id = await saveConnection(tx, store, "razorpay", mode, prepared);
      await recordAudit(
        tx,
        store,
        "payments.connected",
        { type: "PaymentProviderConnection", id },
        {
          provider: "razorpay",
          mode,
        },
      );
      return { connectionId: publicId("paymentConnection", id) };
    },
    { write: true },
  );
}

export async function setPaymentConnectionActive(
  ctx: TenantContext,
  connectionPublicId: unknown,
  active: boolean,
): Promise<void> {
  const id = internalId("paymentConnection", connectionPublicId);
  await inStore(
    ctx,
    "settings.manage",
    async (tx, store) => {
      const row = await tx.paymentProviderConnection.findUnique({
        where: { id },
        select: { provider: true, keyVersion: true },
      });
      if (!row) throw notFound();
      if (active) {
        if (!getPaymentProvider(row.provider) || row.keyVersion === null) {
          throw new DomainError("CONFLICT", "This connection can't be used in this environment.");
        }
        await activate(tx, id);
      } else {
        await tx.$executeRaw`
          UPDATE "PaymentProviderConnection" SET status = 'DISABLED', "updatedAt" = now()
          WHERE id = ${id}::uuid`;
      }
      await recordAudit(
        tx,
        store,
        active ? "payments.enabled" : "payments.disabled",
        { type: "PaymentProviderConnection", id },
        { provider: row.provider },
      );
    },
    { write: true },
  );
}
