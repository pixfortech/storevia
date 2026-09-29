import "server-only";
import type { TenantTx } from "@storevia/database";
import { getPaymentProvider } from "@storevia/payments";
import type { LaunchCheck } from "@storevia/tenancy";
import { acceptsCurrency } from "./checkout/connection";
import { POLICY_DEFINITIONS, policyRequired, type StorePolicyKind } from "./policy-kinds";
import { sellerProfileGaps, type SellerProfile } from "./settings/seller";

// What an online store needs before it goes live (final pass, DB-1): a way
// to take payment, something to sell, a way to ship what needs shipping, and
// a way for shoppers to reach the store, who the seller is, and the store's
// policies (final pass, Phase 2A). Each check says exactly what is missing.
// Tenancy enforces them when the store goes live; the dashboard shows them
// with links.

interface StoreRow {
  business_type: string;
  currency: string;
  name: string;
  support_email: string | null;
  contact_email: string | null;
}

/** The commerce launch checks for one store, in the caller's (merchant) transaction. */
export async function commerceLaunchChecks(
  tx: TenantTx,
  storeId: string,
): Promise<readonly LaunchCheck[]> {
  const stores = await tx.$queryRaw<StoreRow[]>`
    SELECT "businessType"::text AS business_type, trim(currency) AS currency, name,
      "supportEmail" AS support_email, "contactEmail" AS contact_email
    FROM "Store" WHERE id = ${storeId}::uuid`;
  const store = stores[0];
  // Only online stores sell; other business types have no commerce checks.
  if (store?.business_type !== "ECOMMERCE") return [];

  const [catalogue, connections, shipping, sellers, policies] = await Promise.all([
    tx.$queryRaw<{ active: number; shippable: number }[]>`
      SELECT count(DISTINCT p.id)::int AS active,
        count(DISTINCT p.id) FILTER (WHERE v."requiresShipping")::int AS shippable
      FROM "Product" p
      JOIN "ProductVariant" v ON v."productId" = p.id AND v."deletedAt" IS NULL
      WHERE p."storeId" = ${storeId}::uuid AND p.status = 'ACTIVE' AND p."deletedAt" IS NULL`,
    tx.$queryRaw<{ provider: string; mode: string; sealed: boolean }[]>`
      SELECT provider, mode::text AS mode,
        ("credentialsCiphertext" IS NOT NULL AND "keyVersion" IS NOT NULL) AS sealed
      FROM "PaymentProviderConnection"
      WHERE "storeId" = ${storeId}::uuid AND status = 'ACTIVE'`,
    tx.$queryRaw<{ zones: number }[]>`
      SELECT count(DISTINCT z.id)::int AS zones
      FROM "ShippingZone" z
      WHERE z."storeId" = ${storeId}::uuid
        AND EXISTS (SELECT 1 FROM "ShippingZoneCountry" c WHERE c."zoneId" = z.id)
        AND EXISTS (SELECT 1 FROM "ShippingRate" r WHERE r."zoneId" = z.id AND r.active)`,
    tx.storeSellerProfile.findMany({ where: { storeId } }),
    tx.$queryRaw<{ kind: StorePolicyKind }[]>`
      SELECT kind::text AS kind FROM "StorePolicy"
      WHERE "storeId" = ${storeId}::uuid AND "publishedDoc" IS NOT NULL`,
  ]);
  const products = catalogue[0] ?? { active: 0, shippable: 0 };
  const zones = shipping[0]?.zones ?? 0;
  const checks: LaunchCheck[] = [];

  const connection = connections[0];
  const provider = connection ? getPaymentProvider(connection.provider) : null;
  if (!connection) {
    checks.push({
      key: "payments",
      label: "Payments",
      ok: false,
      blocking: true,
      detail: "Connect a payment provider so shoppers can pay.",
    });
  } else if (!provider || !connection.sealed) {
    checks.push({
      key: "payments",
      label: "Payments",
      ok: false,
      blocking: true,
      detail: "Your payment connection can't take payments here. Reconnect it.",
    });
  } else if (!acceptsCurrency(provider, store.currency)) {
    checks.push({
      key: "payments",
      label: "Payments",
      ok: false,
      blocking: true,
      detail: `Your payment provider doesn't accept ${store.currency}, your store's currency.`,
    });
  } else if (connection.mode === "TEST") {
    checks.push({
      key: "payments",
      label: "Payments",
      ok: false,
      blocking: false,
      detail:
        "Payments are in test mode: orders will be test orders and no money is taken. Connect live payments before you launch.",
    });
  } else {
    checks.push({
      key: "payments",
      label: "Payments",
      ok: true,
      blocking: true,
      detail: "Live payments are connected.",
    });
  }

  checks.push(
    products.active > 0
      ? {
          key: "products",
          label: "Products",
          ok: true,
          blocking: true,
          detail: `${String(products.active)} active ${products.active === 1 ? "product" : "products"}.`,
        }
      : {
          key: "products",
          label: "Products",
          ok: false,
          blocking: true,
          detail: "Add a product and set it to Active so shoppers have something to buy.",
        },
  );

  if (products.shippable > 0) {
    checks.push(
      zones > 0
        ? {
            key: "shipping",
            label: "Shipping",
            ok: true,
            blocking: true,
            detail: `Shipping is set up for ${String(zones)} ${zones === 1 ? "zone" : "zones"}.`,
          }
        : {
            key: "shipping",
            label: "Shipping",
            ok: false,
            blocking: true,
            detail:
              "Add a shipping zone with at least one country and an active rate: your products need shipping.",
          },
    );
  }

  const email = store.support_email ?? store.contact_email;
  checks.push(
    store.name.trim() && email
      ? {
          key: "identity",
          label: "Support email",
          ok: true,
          blocking: true,
          detail: `Shoppers can reach ${store.name} at ${email}.`,
        }
      : {
          key: "identity",
          label: "Support email",
          ok: false,
          blocking: true,
          detail: "Add a support or contact email so shoppers can reach you.",
        },
  );

  const seller = sellers[0];
  const gaps = sellerProfileGaps({
    legalName: seller?.legalName ?? null,
    phone: seller?.phone ?? null,
    addressLine1: seller?.addressLine1 ?? null,
    addressLine2: seller?.addressLine2 ?? null,
    city: seller?.city ?? null,
    region: seller?.region ?? null,
    postalCode: seller?.postalCode ?? null,
    countryCode: seller?.countryCode ?? null,
    gstin: seller?.gstin ?? null,
  } satisfies SellerProfile);
  checks.push(
    gaps.length === 0
      ? {
          key: "seller",
          label: "Seller details",
          ok: true,
          blocking: true,
          detail: `Shoppers see who they buy from: ${seller?.legalName ?? store.name}.`,
        }
      : {
          key: "seller",
          label: "Seller details",
          ok: false,
          blocking: true,
          detail: `Add your ${list(gaps)} so shoppers know who they are buying from.`,
        },
  );

  const published = new Set(policies.map((p) => p.kind));
  const missing = POLICY_DEFINITIONS.filter(
    (d) => policyRequired(d.kind, products.shippable > 0) && !published.has(d.kind),
  );
  checks.push(
    missing.length === 0
      ? {
          key: "policies",
          label: "Store policies",
          ok: true,
          blocking: true,
          detail: "Your required policies are published.",
        }
      : {
          key: "policies",
          label: "Store policies",
          ok: false,
          blocking: true,
          detail: `Write and publish your ${list(missing.map((d) => d.defaultTitle.toLowerCase()))}.`,
        },
  );
  return checks;
}

/** "a", "a and b", "a, b and c". */
function list(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
}
