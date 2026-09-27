import type { TenantTx } from "@storevia/database";
import {
  credentialsBinding,
  getPaymentProvider,
  openCredentials,
  type PaymentProvider,
  type ProviderCredentials,
} from "@storevia/payments";

// The store's payment connection, with its credentials opened only in the
// payment call path (ADR-0031 §4). Credentials never leave this module's
// callers: they aren't logged, returned to the browser or stored in plain.

export interface ConnectionRow {
  readonly id: string;
  readonly storeId: string;
  readonly provider: string;
  readonly status: string;
  readonly ciphertext: Uint8Array | null;
  readonly keyVersion: number | null;
}

export interface OpenConnection {
  readonly id: string;
  readonly provider: PaymentProvider;
  readonly credentials: ProviderCredentials;
}

/** The store's one active connection (any provider). */
export async function activeConnection(tx: TenantTx): Promise<ConnectionRow | null> {
  const rows = await tx.$queryRaw<ConnectionRow[]>`
    SELECT id, "storeId", provider, status::text AS status,
      "credentialsCiphertext" AS ciphertext, "keyVersion"
    FROM "PaymentProviderConnection" WHERE status = 'ACTIVE'`;
  return rows[0] ?? null;
}

export async function connectionById(tx: TenantTx, id: string): Promise<ConnectionRow | null> {
  const rows = await tx.$queryRaw<ConnectionRow[]>`
    SELECT id, "storeId", provider, status::text AS status,
      "credentialsCiphertext" AS ciphertext, "keyVersion"
    FROM "PaymentProviderConnection" WHERE id = ${id}::uuid`;
  return rows[0] ?? null;
}

/**
 * The provider adapter and decrypted credentials, or null when the provider
 * isn't available here (e.g. the test provider outside development and
 * test) or the connection has no credentials.
 */
export function openConnection(row: ConnectionRow): OpenConnection | null {
  const provider = getPaymentProvider(row.provider);
  if (!provider || !row.ciphertext || row.keyVersion === null) return null;
  const credentials = openCredentials(credentialsBinding(row), {
    ciphertext: row.ciphertext,
    keyVersion: row.keyVersion,
  });
  return { id: row.id, provider, credentials };
}

/** Whether checkout can take payment in this currency with this connection. */
export function acceptsCurrency(provider: PaymentProvider, currency: string): boolean {
  return provider.currencies === "any" || provider.currencies.includes(currency);
}
