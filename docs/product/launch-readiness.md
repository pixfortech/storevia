# Launch readiness

> Final pass, Phase 1 (DB-1). What an online store needs before it goes
> live, so an incomplete store never goes live only to fail at checkout.

## The checks

| Key        | Check                                                                           | Blocks going live           | Fixed in            |
| ---------- | ------------------------------------------------------------------------------- | --------------------------- | ------------------- |
| `payments` | An active payment connection that can take the store's currency                 | Yes. Test mode is a warning | Settings → Payments |
| `products` | At least one active product with a variant                                      | Yes                         | Products            |
| `shipping` | When an active product needs shipping: a zone with a country and an active rate | Yes                         | Settings → Shipping |
| `identity` | The store's name and a support or contact email                                 | Yes                         | Settings → General  |
| `home`     | A published home page                                                           | Yes                         | Pages               |

Commerce checks apply to online stores (`ECOMMERCE`); other business types
have only the page system's check. Store policies (refund, shipping,
privacy) join the list in Phase 2.

## How it is built

- Each check lives with what it checks: `commerceLaunchChecks` in
  `packages/commerce/src/readiness.ts` and `siteLaunchChecks` in
  `packages/site-admin/src/readiness.ts`. They take the merchant's
  transaction, so RLS scopes them to the store.
- The dashboard composes them (`apps/dashboard/src/lib/launch-readiness.ts`).
- Tenancy enforces them: `setStorefrontLive(ctx, true, readiness)` requires
  the checks, locks the store row, runs them in the same transaction and
  refuses (CONFLICT, naming what is missing) while any blocking check fails.
  Going back to "coming soon" needs no checks.
- Settings → Storefront lists every check with a Fix link and disables Go live
  while something blocks; the store home's set-up steps show the same list.
  Seeds go live through the same checks (`apps/dashboard/scripts/seed-launch.ts`).

Tests: `packages/commerce/tests/readiness.int.test.ts`,
`packages/tenancy/tests/storefront.int.test.ts`,
`apps/dashboard/e2e/launch-and-test-orders.spec.ts`.
