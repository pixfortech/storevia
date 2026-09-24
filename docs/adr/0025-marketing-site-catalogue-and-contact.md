# ADR-0025: Marketing site: public catalogue and contact form

- Status: Accepted
- Date: 2026-09-24
- Refines: ADR-0021 (database roles), ADR-0022 (plans as data)

## Context

The public site (`apps/marketing`, storevia.com) needs two things from the
platform:

1. **Pricing from the plan catalogue.** Plans, prices and feature values are
   data (ADR-0022). The pricing page must show exactly what the product
   enforces, and change without a code change.
2. **A contact form.** No payment provider is integrated, so paid plans are
   arranged by Storevia staff. Visitors need a way to reach us. The form must
   be rate limited.

The public site is the most exposed process we run. It has no sessions and
must not hold a credential that can reach tenant or identity data. The
existing roles don't fit: `storevia_app` can read tenant tables once a tenant
context is set, and `storevia_system` owns authentication data.

## Decision

1. **A new database role, `storevia_marketing`** (`LOGIN NOBYPASSRLS`),
   used only by `apps/marketing` (`DATABASE_MARKETING_URL`, via
   `marketingDb()`):
   - `SELECT` on `Plan`, `PlanPrice`, `Feature` and `PlanFeature`, and
     nothing else in the schema;
   - `SELECT, INSERT, UPDATE` on `RateLimit`, with row-level security
     (migration `20260927000000_marketing_role`): the policy
     `marketing_own_buckets` limits it to keys starting `marketing:`, so the
     site can never read or reset sign-in and password-reset limits. RLS is
     enabled but not forced. The other role with access, `storevia_system`,
     is `BYPASSRLS` and unaffected.
2. **`loadPublicCatalogue(db)`** (`@storevia/entitlements/catalogue`) reads
   public, `ACTIVE` plans with their active prices, and resolves every
   feature value with the same `toValue` rules the engine enforces. It
   includes the free allowance (feature defaults). The site caches it per
   process for 60 seconds. If the database is unreachable it shows an
   "unavailable" message, never stale or invented numbers.
3. **`formatEntitlement`** (`@storevia/entitlements/format`, client-safe)
   renders values the same way for the pricing page and the merchant billing
   page. For example, storage is shown in GB, never raw bytes.
4. **Contact form**: a server action validates input (zod), checks a
   honeypot, and applies three limits through `consumeRateLimitsWith(marketingDb(), …)`:
   5 per IP per hour, 3 per email per hour, and 200 site-wide per hour. It then
   sends `contactRequestMessage` to `CONTACT_INBOX` through the shared
   `EmailSender`. Visitor details and message text are never logged. Only
   the topic, request ID and outcome metric are recorded.
5. Paid plans on the site lead to the contact form ("Talk to us"). There is
   no checkout, payment form or self-serve upgrade until a provider is
   integrated (ADR-0022).

## Consequences

- Pricing and product enforcement can't drift: both read the same rows, and
  an integration test compares the catalogue with the reference data.
- A compromise of the marketing site exposes only public plan data and its
  own rate-limit buckets. Tests assert it has no access to users, sessions,
  organisations, stores, subscriptions, usage, audit or platform tables.
- `RateLimit` now has RLS enabled. Any future role that uses it without
  `BYPASSRLS` needs its own policy.
- `db:setup`, CI and `.env.example` gain `DATABASE_MARKETING_URL` and
  `CONTACT_INBOX`.
