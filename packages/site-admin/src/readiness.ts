import "server-only";
import type { TenantTx } from "@storevia/database";
import type { LaunchCheck } from "@storevia/tenancy";

// The page system's launch check (final pass, DB-1): a live store needs a
// published home page, or shoppers land on nothing.

/** The site launch checks for one store, in the caller's (merchant) transaction. */
export async function siteLaunchChecks(
  tx: TenantTx,
  storeId: string,
): Promise<readonly LaunchCheck[]> {
  const rows = await tx.$queryRaw<{ published: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM "Page"
      WHERE "storeId" = ${storeId}::uuid AND kind = 'HOME' AND "deletedAt" IS NULL
        AND "publishedVersionId" IS NOT NULL
    ) AS published`;
  return [
    rows[0]?.published
      ? {
          key: "home",
          label: "Home page",
          ok: true,
          blocking: true,
          detail: "Your home page is published.",
        }
      : {
          key: "home",
          label: "Home page",
          ok: false,
          blocking: true,
          detail: "Publish your home page so shoppers see your store.",
        },
  ];
}
