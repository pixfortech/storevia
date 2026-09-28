# Secrets rotation

> M8. How to replace each secret, what users notice, and what to do when
> one leaks. Secrets live only in the secret manager, each Vercel
> project's environment and the worker host; never in the repository,
> logs, tickets or chat. The apps refuse to boot with a missing, short or
> placeholder secret (docs/operations/staging.md §3), so a botched rotation
> fails the deploy, not shoppers.

Generate random secrets with `openssl rand -base64 32` (key rings:
`echo "<n>:$(openssl rand -base64 32)"`).

## Schedule

| When                            | What                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------- |
| Every 12 months                 | Every platform secret below                                                       |
| When someone with access leaves | Every secret they could read                                                      |
| On suspected exposure           | That secret, at once (see "If a secret leaks")                                    |
| Merchants' Razorpay keys        | The merchant's decision, from Settings → Payments (a recent password is required) |

## Per secret

| Secret                                              | Apps                                         | How                                                                                                                                                                                                                                                                                                                                    | What users notice                                                                                  |
| --------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`                                       | dashboard                                    | Replace, redeploy                                                                                                                                                                                                                                                                                                                      | Every merchant session ends; they sign in again                                                    |
| `AUTH_PLATFORM_SECRET`                              | platform-admin                               | Replace, redeploy                                                                                                                                                                                                                                                                                                                      | Every staff session ends                                                                           |
| `STAFF_MFA_KEYS`                                    | platform-admin                               | Key ring. Add `<n+1>:<key>` to the front of the existing list (`2:new,1:old`) and deploy: new enrolments use `n+1`, existing ones still open. Remove the old version only when `SELECT "keyVersion", count(*) FROM "StaffMfa" GROUP BY 1` shows none left (staff re-enrol)                                                             | Nothing                                                                                            |
| `PAYMENT_CREDENTIALS_KEYS`                          | dashboard, storefront (same value)           | Key ring, as above. Deploy **both** apps with the new ring before anything is sealed with it. New and reconnected connections use the new version. Retire the old one when `SELECT "keyVersion", count(*) FROM "PaymentProviderConnection" WHERE "credentialsCiphertext" IS NOT NULL GROUP BY 1` shows none left (merchants reconnect) | Nothing                                                                                            |
| `ORDER_ACCESS_SECRET`                               | storefront, worker (same value)              | Move the current value to `ORDER_ACCESS_SECRET_PREVIOUS`, set a new `ORDER_ACCESS_SECRET`, deploy both. New links use the new secret; old links keep working. Clear `_PREVIOUS` after 180 days (the links' lifetime)                                                                                                                   | Nothing                                                                                            |
| `STOREFRONT_PREVIEW_SECRET`                         | dashboard, storefront (same value)           | Replace in both, deploy both together                                                                                                                                                                                                                                                                                                  | Open preview links (15-minute lifetime) stop working                                               |
| `STOREFRONT_REVALIDATE_SECRET`                      | storefront, worker (same value)              | Replace in both                                                                                                                                                                                                                                                                                                                        | Nothing: the signed post is only a fast path; the invalidation log carries every change (ADR-0034) |
| `MOCK_BILLING_WEBHOOK_SECRET`                       | staging only                                 | Replace                                                                                                                                                                                                                                                                                                                                | Nothing                                                                                            |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`                | self-hosted Next.js only                     | Replace and rebuild                                                                                                                                                                                                                                                                                                                    | Forms open during the deploy must be resubmitted                                                   |
| Database role passwords                             | each app's own role                          | Neon → Roles → reset password for **one** role, update that app's URL(s), redeploy it. Do one role at a time; the migrator's only before a migration run                                                                                                                                                                               | A few seconds of errors for that app while instances switch                                        |
| `VERCEL_API_TOKEN`                                  | dashboard, worker                            | Create a new token (same scope), deploy both apps with it, then revoke the old one                                                                                                                                                                                                                                                     | Nothing                                                                                            |
| S3 / media keys                                     | dashboard, worker                            | Create a second access key, deploy both, delete the first                                                                                                                                                                                                                                                                              | Nothing                                                                                            |
| SMTP credentials                                    | dashboard, marketing, platform-admin, worker | Provider's key rotation, same pattern                                                                                                                                                                                                                                                                                                  | Nothing                                                                                            |
| `DATABASE_MIGRATOR_URL` (GitHub environment secret) | Migrate database workflow                    | Reset the migrator password, update the environment secret                                                                                                                                                                                                                                                                             | Nothing                                                                                            |

## If a secret leaks

1. **Rotate it now** as above. For a key ring, add a new version _and_
   remove the leaked one in the same deploy if you can afford the
   consequences below; otherwise add first and remove within hours.
2. **Payment credentials key ring leaked** (with a database copy, merchant
   Razorpay secrets could be decrypted): rotate the ring, and ask every
   merchant with a Razorpay connection to roll their keys at Razorpay and
   reconnect in Settings → Payments. Reconnecting re-seals with the new
   key. A connection sealed with a removed version can no longer be opened,
   so that store can't take Razorpay payments until the merchant
   reconnects: tell merchants before removing it.
3. **Staff MFA key ring leaked:** rotate the ring and have every staff
   member reset MFA (the MFA reset procedure in
   [launch-checklist.md](./launch-checklist.md#staff-mfa-reset)).
4. **`AUTH_SECRET` / `AUTH_PLATFORM_SECRET` leaked:** rotating ends every
   session, which is the point.
5. **A database password leaked:** rotate that role, then check
   `pg_stat_activity` (connections are named `storevia-<role>`) and the
   audit log for use from elsewhere.
6. Record what leaked, when, what was rotated and what was checked, in the
   incident log.
