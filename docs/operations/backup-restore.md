# Backups and restore

> M8. Replaces the targets sketched in
> [deployment-architecture.md §7](../deployment/deployment-architecture.md#7-backups-and-disaster-recovery)
> with what is set up and what has been drilled. Retention of the data
> itself is in [data-lifecycle.md](../database/data-lifecycle.md).

## 1. What is backed up, and how

| Layer                                | What                                                                                                                                                       | Where                                                                                                             | Retention                                                                                     | Covers                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Point-in-time recovery** (primary) | Every committed transaction (Neon history / WAL)                                                                                                           | Neon, same region                                                                                                 | The plan's history window: at least 7 days, 30 recommended (set in the Neon project settings) | Bad deploy, bad migration, accidental delete, a merchant's "undo" request |
| **Nightly logical dump** (secondary) | `pg_dump --format=custom` of the whole database (schema, data, grants, RLS policies, functions) as the schema owner, over the direct (non-pooled) endpoint | An encrypted bucket at a **different provider or region** from Neon (e.g. S3 with SSE-KMS and Object Lock, or R2) | 35 daily, 12 monthly                                                                          | Loss of the Neon project or region, a problem found after the PITR window |
| **Media**                            | Processed objects in the media bucket                                                                                                                      | Bucket versioning on; lifecycle keeps non-current versions 35 days                                                | 35 days of versions                                                                           | Deleted or overwritten media                                              |
| **Configuration**                    | Environment variables and secrets                                                                                                                          | The secret manager (versioned) plus Vercel's per-deployment environments                                          | Per provider                                                                                  | A bad configuration change                                                |

The database is the only system of record. Caches, the storefront
invalidation log and job run history rebuild themselves; the worker
re-derives anything due (billing notices, domain checks) on its next run.

The nightly dump is one command, run by a scheduled job on the worker host
(never CI: it needs production credentials), with `DATABASE_MIGRATOR_URL`
pointing at the **direct** endpoint:

```sh
pg_dump --format=custom --no-password --file "storevia-$(date -u +%Y%m%dT%H%M%SZ).dump" "$DATABASE_MIGRATOR_URL"
# then: sha256sum, upload with the checksum as metadata, delete the local file
```

`pg_dump` must be the same major version as the server or newer.

## 2. Targets

|                                 | Target                                                                                                                                  | Basis                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **RPO** (data that can be lost) | ≤ 5 minutes for any failure inside Neon (in practice, the last committed transaction); ≤ 24 hours if the Neon project or region is lost | PITR is continuous; the logical dump is nightly                                                         |
| **RTO** (time to serve again)   | ≤ 1 hour for a PITR restore; ≤ 4 hours for a restore from the logical dump into a new project                                           | Restore time is small (§4); most of the hour is verification and switching the apps' connection strings |

Payments are the one place a restore can disagree with the outside world:
an order paid after the restore point exists at Razorpay but not in
Storevia. After any restore to an earlier point, replay the payment
provider's webhooks for the lost window (Razorpay dashboard → Webhooks →
resend, or its API) and reconcile refunds; the webhook ledger makes a
replay of events already applied a no-op.

## 3. Restoring

### A. Point in time (Neon)

1. Pick the restore point (just before the incident; the audit log and
   application logs give the time).
2. In Neon, create a **branch** from that point. Don't restore over the
   primary: the branch is the candidate, the primary is the evidence.
3. Verify the branch (§4): run the drill's checks with
   `DRILL_SOURCE_URL` = the branch's migrator URL into a scratch project, or
   at least compare the counts for the tables in §4 against expectations.
4. Put the apps in maintenance (Vercel: promote a maintenance deployment,
   or pause the storefront project), stop the worker.
5. Point every app's database URLs at the branch (or use Neon's
   "restore branch" to make the branch the primary, which keeps the
   endpoint hostnames and so the connection strings), redeploy, start the
   worker, run the smoke test in [staging.md §6](./staging.md#6-deploy-order).
6. Replay provider webhooks for the gap (§2). Record the incident.

### B. From a logical dump

1. Create a new Neon project (or database) and the roles, with
   `pnpm db:setup`'s statements and new passwords.
2. `pg_restore --exit-on-error --single-transaction --dbname <admin URL of
the new database> <dump>`. Owners, grants, RLS policies and functions
   come back with the data (verified by the drill).
3. Verify (§4), then switch the apps as in A.4–A.6.

## 4. The drill

`pnpm --filter @storevia/database db:restore-drill` runs the whole cycle
and fails unless the copy is exact:

1. `pg_dump` of the source as the schema owner; the dump's size and
   SHA-256 are recorded.
2. A new, empty database; `pg_restore --single-transaction` as the admin
   role.
3. Verification:
   - every table's row count **and** content checksum (MD5 of every row,
     in a fixed order) equals the source's; organisations, stores,
     products, variants, orders, order lines, payments, refunds,
     customers, themes, domains, messages, subscriptions and the audit log
     are reported by name;
   - the tables with RLS on, the policies, the functions (body and
     `SECURITY DEFINER`), every role's table and function grants, and the
     migration head are identical;
   - as the storefront role, a live store's primary hostname resolves; as
     the application role with no tenant scope, zero orders are visible
     (RLS is enforced in the copy).
4. Timings for each step; the copy is dropped unless `--keep`.

`--self-test` removes one order from the copy before verifying and passes
only if the drill reports it, which proves the drill can fail.

### Results

| Date       | Source                                                                                                                                                                                 | Size         | Tables / rows | Backup | Restore (create + pg_restore) | Verify | Result                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------- | ------ | ----------------------------- | ------ | -------------------------------------------------- |
| 2026-09-28 | local dev database (41 organisations, 43 stores, 7 orders, 45 domains)                                                                                                                 | 0.83 MB dump | 80 / 2,277    | 0.27 s | 1.3 s                         | 0.2 s  | exact copy; `--self-test` caught the removed order |
| 2026-09-28 | multi-store load database (10 organisations, 20 stores, 800 products, 1,280 variants, 160 orders and payments, 120 customers, 30 themes, 24 domains, 40 messages, 2,837 audit entries) | 1.8 MB dump  | 80 / 27,820   | 0.31 s | 1.25 s                        | 0.28 s | exact copy; `--self-test` caught the removed order |

Local PostgreSQL 16 on the build machine; a Neon restore adds network
time proportional to the dump size. At these rates the restore itself is
seconds; the RTO is dominated by verification and switching the apps.

### Schedule

- **Before launch:** a drill of staging into a scratch Neon project
  (`DRILL_SOURCE_URL` = staging's migrator URL on the direct endpoint;
  `DATABASE_ADMIN_URL` / `DATABASE_MIGRATOR_URL` and the role URLs = the
  scratch project), plus one PITR branch restore of staging, timed.
- **Quarterly:** the same drill from the latest production logical dump
  into a scratch project that is deleted afterwards; record the row in the
  table above. A production copy holds personal data: the scratch project
  is in the same region, access-restricted, and deleted the same day.
- **After any schema-heavy migration:** a drill of staging.

The drill refuses to run with `STOREVIA_ENV` set to staging or production:
it is run from an operator's machine against scratch targets, never inside
a deployed app.
