# GitHub milestones and issues

> Milestone 0 deliverable. Status: **approved baseline (Milestone 0, 2026-09-24)**.
>
> Ready to be created as GitHub milestones and issues once the review
> approves the plan. Milestones M0–M2 are broken down fully; M3–M8 at issue
> level, to be refined when their milestone starts.

## Labels

| Label                                                                                                                                                                                                                                                    | Meaning                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `area:infra` `area:database` `area:auth` `area:tenancy` `area:billing` `area:catalogue` `area:media` `area:storefront` `area:editor` `area:checkout` `area:payments` `area:domains` `area:themes` `area:platform-admin` `area:ui` `area:api` `area:docs` | Component                                                          |
| `type:feature` `type:chore` `type:test` `type:docs` `type:spike`                                                                                                                                                                                         | Kind of work                                                       |
| `security`                                                                                                                                                                                                                                               | Security-sensitive: needs CODEOWNERS review and threat-model check |
| `tenant-isolation`                                                                                                                                                                                                                                       | Must extend the tenant-isolation test suite                        |
| `priority:p0` `priority:p1` `priority:p2`                                                                                                                                                                                                                | Order within a milestone                                           |

Every issue inherits the [Definition of Done](./implementation-roadmap.md#working-agreement-every-task).

---

## Milestone 0 — Architecture

**Goal:** agreed architecture, repository tooling, CI.

#### M0-01 Architecture document set

`area:docs` `type:docs` `priority:p0`

- [ ] Documents 00–10, ERD, data lifecycle, threat model, deployment, roadmap, ADRs merged
- [ ] Draft Prisma schema validates in CI

#### M0-02 Review and accept ADRs 0002–0019

`area:docs` `type:docs` `priority:p0`

- [ ] Each ADR is Accepted or amended; status updated in `docs/adr/README.md`

#### M0-03 Resolve open questions Q1–Q8

`area:docs` `priority:p0`

- [ ] Answers recorded in the roadmap; affected ADRs updated

#### M0-04 Repository tooling scaffold and CI

`area:infra` `type:chore` `priority:p0`

- [ ] pnpm workspace, Turborepo, TypeScript 6 base config, ESLint 10 flat config, Prettier, EditorConfig, `.nvmrc`
- [ ] CI: format check, lint, typecheck, test, build, draft-schema validation, secret scan
- [ ] README, CONTRIBUTING, SECURITY, `.env.example`, PR template

#### M0-05 Default branch protection and CODEOWNERS

`area:infra` `type:chore` `security` `priority:p0`

- [ ] `main` created and set as default; required checks; required review; no force-push
- [ ] CODEOWNERS for `packages/{database,auth,tenancy,security,billing,payments}` and `.github/`

#### M0-06 GitHub security features

`area:infra` `security` `priority:p1`

- [ ] Secret scanning + push protection, Dependabot alerts, private vulnerability reporting enabled
- [ ] Renovate/Dependabot version updates configured (weekly, grouped)

---

## Milestone 1 — Platform foundation

**Goal:** a user can sign up, create an organisation and a store, invite
colleagues with roles, and **cannot** reach anyone else's data.
**Gate:** T1–T16 green.

#### M1-01 Foundation packages: config, types, validation, observability

`area:infra` `type:feature` `priority:p0`

- [ ] `@storevia/config`: tsconfig/eslint/tailwind presets used by all packages
- [ ] `@storevia/types`: branded IDs, TypeID encode/decode with prefix validation, `Result`, error codes (unit-tested)
- [ ] `@storevia/validation`: zod setup, shared primitives (email, slug, locale, currency, country, timezone)
- [ ] `@storevia/observability`: pino logger with redaction, request-ID propagation, error-reporting interface

#### M1-02 Database package, identity/tenancy migration, RLS

`area:database` `type:feature` `security` `tenant-isolation` `priority:p0`

- [ ] Prisma 7 + pg driver adapter; first migration for User, Account, Session, Verification, PlatformStaff, Organisation, Membership, MembershipStoreAccess, Invitation, Store, StoreDomain, AuditLog
- [ ] SQL: citext, partial unique indexes, immutability triggers on tenant columns, RLS enabled + forced + policies, roles `storevia_app` / `storevia_system` / `storevia_platform` / `storevia_migrator`
- [ ] `withTenant(ctx, fn)` with transaction-local settings; system client in a separate allow-listed entry point
- [ ] Tests: RLS coverage (T13), cross-tenant RLS (T12), composite FK (T14)

#### M1-03 Local development environment

`area:infra` `type:chore` `priority:p0`

- [ ] `docker compose` with PostgreSQL 17, Mailpit, MinIO; `pnpm db:migrate`, `pnpm db:seed:dev`
- [ ] Per-app env schemas; the app refuses to start with invalid env
- [ ] Getting-started docs in README

#### M1-04 Security package

`area:auth` `type:feature` `security` `priority:p0`

- [ ] Token generation (256-bit) and SHA-256 hashing helpers; constant-time compare
- [ ] Postgres-backed sliding-window rate limiter
- [ ] Security headers + nonce-based CSP builder applied to dashboard and platform-admin
- [ ] Safe redirect validator

#### M1-05 Sign-up, sign-in, sign-out

`area:auth` `type:feature` `security` `priority:p0`

- [ ] Better Auth wrapped in `@storevia/auth`; Argon2id hashing; DB sessions with hashed tokens
- [ ] `__Host-` cookies (Secure, HttpOnly, SameSite=Lax) in production; new session on sign-in (fixation test)
- [ ] Password policy incl. breached-password check
- [ ] Dashboard pages with loading/error states, responsive, accessible

#### M1-06 Email verification and password reset

`area:auth` `type:feature` `security` `priority:p0`

- [ ] `@storevia/email` with `EmailSender` interface (SMTP/Mailpit dev) and templates
- [ ] Verification required before creating an organisation
- [ ] Reset: single-use hashed tokens, 30 min TTL, all sessions revoked, uniform responses

#### M1-07 Account security page

`area:auth` `type:feature` `security` `priority:p1`

- [ ] List and revoke sessions; change password (revokes others); change name/locale/timezone
- [ ] Step-up re-authentication helper (`requireRecentAuth`) used by sensitive actions

#### M1-08 Brute-force and enumeration protection

`area:auth` `type:test` `security` `priority:p0`

- [ ] Rate limits per IP / per account / global on sign-in, sign-up, reset, verification
- [ ] Tests prove uniform responses for existing vs non-existing accounts

#### M1-09 Google sign-in (feature-flagged)

`area:auth` `type:feature` `security` `priority:p2`

- [ ] OIDC with PKCE/state/nonce; link only verified, matching emails; disabled unless configured

#### M1-10 Organisations

`area:tenancy` `type:feature` `tenant-isolation` `priority:p0`

- [ ] Create organisation (creator becomes the single OWNER); rename; organisation switcher
- [ ] `resolveOrganisationContext` / `resolveStoreContext`; 404 non-disclosure
- [ ] Audit events

#### M1-11 RBAC

`area:tenancy` `type:feature` `security` `priority:p0`

- [ ] Permission catalogue + role map (`rbac.ts`) matching docs/architecture/04 §7.3
- [ ] `authorize()`, `storeAction(permission, schema, handler)` / `orgAction` wrappers
- [ ] Generated role × permission matrix test (T6) and snapshot of the matrix

#### M1-12 Members, invitations, ownership transfer

`area:tenancy` `type:feature` `security` `tenant-isolation` `priority:p0`

- [ ] Invite by email with role (hashed token, 7-day expiry), accept (verified email must match), revoke, resend
- [ ] Change role (subset rule, no self-change), remove member, suspend member
- [ ] Transfer ownership (step-up auth; previous owner → ADMIN); last owner cannot leave
- [ ] Tests T5, T7, T9

#### M1-13 Stores

`area:tenancy` `type:feature` `tenant-isolation` `priority:p0`

- [ ] Create store: name, slug (rules + reserved list + confusables), currency, locale, timezone, country; platform `StoreDomain` `{slug}.storevia.site` created as primary
- [ ] Store settings page; archive store; store switcher
- [ ] Store-scoped memberships (`allStores=false` + access list) — test T8
- [ ] Tests T3, T4

#### M1-14 UI foundation (`@storevia/ui`)

`area:ui` `type:feature` `priority:p0`

- [ ] Tokens (colour, type, spacing, radius, shadow), light theme, focus styles
- [ ] Button, Input, Select, Checkbox, Radio, Switch, Tabs, Dialog, Drawer, Popover, Tooltip, Dropdown, Card, Badge, Alert, Toast, Skeleton, EmptyState, Breadcrumb, Table, Pagination
- [ ] Keyboard and screen-reader behaviour tested (axe in component tests)

#### M1-15 Dashboard shell

`area:ui` `type:feature` `priority:p0`

- [ ] Desktop sidebar, tablet collapsible rail, mobile bottom navigation + drawer (designed separately, not shrunk)
- [ ] Organisation/store switchers; home page with real onboarding state (no fake widgets)
- [ ] i18n message catalogue wiring (`next-intl`)

#### M1-16 Platform-admin shell

`area:platform-admin` `type:feature` `security` `priority:p1`

- [ ] Separate app, host and session realm; `PlatformStaff` required; merchant sessions rejected (T11)
- [ ] Read-only organisation/store search; every view and action audited

#### M1-17 Audit log foundation

`area:tenancy` `type:feature` `security` `priority:p1`

- [ ] `audit()` writer with metadata allow-list; append-only grants
- [ ] Events: sign-in/out, password change/reset, invitations, role changes, removals, ownership transfer, store create/archive, platform-admin access

#### M1-18 Tenant-isolation suite

`area:tenancy` `type:test` `security` `tenant-isolation` `priority:p0`

- [ ] T1–T16 implemented and running in CI
- [ ] IDOR sweep harness enumerates registered store actions automatically (T15)
- [ ] Unauthenticated sweep over all routes/actions (T10)

#### M1-19 E2E: sign-up to store

`area:infra` `type:test` `priority:p0`

- [ ] Playwright: sign up → verify email (Mailpit) → create organisation → create store → see store in dashboard

#### M1-20 CI extensions

`area:infra` `type:chore` `priority:p0`

- [ ] Integration tests with a PostgreSQL 17 service; migrations from zero + drift check
- [ ] E2E job; client-bundle secret scan; lint rule banning `$queryRawUnsafe` and unscoped client imports

#### M1-21 Marketing site skeleton

`area:ui` `type:feature` `priority:p2`

- [ ] Home, features, login/sign-up entry points linking to the dashboard; no placeholder pricing until M2

---

## Milestone 2 — SaaS billing

**Goal:** organisations subscribe to plans; limits are enforced server-side.

#### M2-01 Plans and features reference data

`area:billing` `type:feature` `priority:p0`

- [ ] Migration: Plan, PlanPrice, Feature, PlanFeature, OrganisationFeatureOverride, UsageCounter, BillingCustomer, Subscription, SubscriptionEvent, BillingWebhookEvent, Invoice
- [ ] `seed:reference` idempotent; `FeatureKey` ↔ DB parity test

#### M2-02 Entitlements package

`area:billing` `type:feature` `security` `priority:p0`

- [ ] `getEntitlements`, `hasFeature`, `getFeatureLimit`, `assertFeature`, `getUsage`, `canConsume`, `consumeUsage`, `releaseUsage`
- [ ] Resolution tests (override > plan > deny; per subscription status)
- [ ] Lint rule: no plan-code comparisons outside seeds/platform-admin

#### M2-03 Usage counters and reconciliation

`area:billing` `type:feature` `priority:p0`

- [ ] Row-locked consume; concurrency test (N parallel creates vs limit L → exactly L)
- [ ] Nightly reconciliation job with drift metric

#### M2-04 Worker and job queue

`area:infra` `type:spike` `priority:p0`

- [ ] Spike pg-boss vs Graphile Worker → ADR
- [ ] `apps/worker` + `@storevia/jobs`; idempotent jobs, retries, metrics, health endpoint

#### M2-05 Billing provider abstraction + Stripe

`area:billing` `type:feature` `security` `priority:p0`

- [ ] `BillingProvider` interface; Stripe implementation (customers, checkout, portal, change plan, cancel/resume, fetch)
- [ ] Contract tests against Stripe test mode (tagged, run on schedule)

#### M2-06 Subscribe and trial

`area:billing` `type:feature` `priority:p0`

- [ ] Plan selection after organisation creation; trial start; Stripe Checkout for paid plans

#### M2-07 Billing webhooks

`area:billing` `type:feature` `security` `priority:p0`

- [ ] Raw-body signature verification; unique event ledger; async processing via re-fetch; out-of-order guard; retries; reconciliation job
- [ ] Tests: invalid signature, duplicate, out-of-order, failure/retry

#### M2-08 Lifecycle behaviour

`area:billing` `type:feature` `priority:p1`

- [ ] TRIAL/ACTIVE/PAST_DUE/CANCELLED/EXPIRED effects on dashboard (banners, read-only) and storefront availability flag

#### M2-09 Billing page

`area:billing` `type:feature` `priority:p0`

- [ ] Current plan, usage meters, upgrade, downgrade with pre-check, cancel/resume, billing portal, invoice history
- [ ] OWNER-only management (`billing.manage`), ADMIN read; step-up auth

#### M2-10 Plan enforcement for stores and staff

`area:billing` `type:feature` `tenant-isolation` `priority:p0`

- [ ] `store_count` on store creation, `staff_accounts` on invitation acceptance; typed errors surfaced in UI with upgrade path

#### M2-11 Pricing page

`area:ui` `type:feature` `priority:p2`

- [ ] Marketing pricing page renders public plans and features from the database (cached)

#### M2-12 Platform-admin billing tools

`area:platform-admin` `type:feature` `security` `priority:p1`

- [ ] View subscriptions and billing state; manage plans/features; create overrides with reason and expiry; all audited

---

## Milestone 3 — Commerce catalogue

- **M3-01** Money library with ISO-4217 exponents, allocation, formatting; property tests — `area:catalogue`
- **M3-02** Products, options, variants: schema, services, `product_limit` consumption, variant matrix — `area:catalogue` `tenant-isolation`
- **M3-03** Product editor UI: variants, pricing, SEO, status, tags; responsive; empty/loading/error states — `area:catalogue` `area:ui`
- **M3-04** Rich-text descriptions: Tiptap JSON storage, allow-list renderer, XSS corpus tests — `area:catalogue` `security`
- **M3-05** Media library: signed uploads, magic-byte sniffing, SVG handling, renditions, alt text, search, rename, delete — `area:media` `security`
- **M3-06** Collections: manual ordering and smart rules — `area:catalogue`
- **M3-07** Locations, inventory levels, `adjustInventory` ledger, inventory UI with reasons — `area:catalogue`
- **M3-08** `SearchIndex` interface + PostgreSQL FTS for dashboard search — `area:catalogue`
- **M3-09** Admin API v1: API keys (hashed, scoped, step-up), products/variants/collections/inventory endpoints, OpenAPI — `area:api` `security`
- **M3-10** Product taxonomy (Category) reference data — `area:catalogue`
- **M3-11** Extend IDOR/isolation sweeps to catalogue, media and API — `type:test` `tenant-isolation`

## Milestone 4 — Storefront engine

- **M4-00** `@storevia/editor` document + render entry points: `PageDocument` v1 schema, validation and limits, component registry, base renderers (moved forward from M5-01/M5-02) — `area:editor`
- **M4-01** `@storevia/domains`: hostname normalisation, reserved slugs, resolver with cache — `area:domains` `security`
- **M4-02** Storefront app: proxy, internal routing guard, status pages, canonical redirects — `area:storefront` `security`
- **M4-03** Storefront read models (public DTOs only) — `area:storefront` `tenant-isolation`
- **M4-04** Storefront routes (home, product, collection, search, 404) rendered with the M4-00 renderers and default theme tokens — `area:storefront`
- **M4-05** Cart: token cookie, server actions, server-side subtotal — `area:storefront`
- **M4-06** Caching with tags + outbox-driven invalidation — `area:storefront`
- **M4-07** SEO: sitemap, robots, canonical URLs, JSON-LD — `area:storefront`
- **M4-08** Signed preview tokens — `area:storefront` `security`
- **M4-09** Performance budget checks and DB query-count test harness — `type:test`
- **M4-10** Submit `storevia.site` to the Public Suffix List; store slug history — `area:domains` `security`

## Milestone 5 — Page builder

- **M5-01** Document migration framework with fixtures (schema v1 itself lands in M4-00) — `area:editor`
- **M5-02** Remaining layout/basic components on the M4 registry — `area:editor`
- **M5-03** Commerce components (Product, ProductCard, ProductGrid, CollectionGrid, Price, AddToCart, Cart) with batched data bindings — `area:editor`
- **M5-04** Marketing components (Hero, Banner, AnnouncementBar, Testimonials, FAQ, Newsletter, Form) — `area:editor`
- **M5-05** Style compiler: tokens, responsive overrides, scoped CSS — `area:editor`
- **M5-06** Page services: saveDraft with optimistic concurrency, publish/unpublish (atomic), history, restore — `area:editor`
- **M5-07** Editor shell: top bar, components/layers/pages sidebar, iframe canvas, properties panel — `area:editor` `area:ui`
- **M5-08** Drag and drop (dnd-kit, keyboard sensor), operation model, undo/redo — `area:editor`
- **M5-09** Inline text editing and Tiptap rich-text fields — `area:editor`
- **M5-10** Desktop/tablet/mobile previews and per-breakpoint editing — `area:editor`
- **M5-11** Autosave, conflict handling and save status — `area:editor`
- **M5-12** CustomHTML (sanitised) and sandboxed embeds behind `custom_code` — `area:editor` `security`
- **M5-13** Navigation menus with nested items and typed targets — `area:editor`
- **M5-14** Builder serialisation tests + E2E: create page → publish → storefront renders — `type:test`

## Milestone 6 — Checkout and orders

- **M6-01** Customers and addresses — `area:checkout` `tenant-isolation`
- **M6-02** Shipping zones and rates — `area:checkout`
- **M6-03** Tax configuration + manual `TaxCalculator` (inclusive/exclusive) — `area:checkout`
- **M6-04** Discounts: rules, codes, evaluation service, table-driven tests — `area:checkout`
- **M6-05** Pricing pipeline (`calculateCart`, `PriceQuote`, `pricingHash`) — `area:checkout`
- **M6-06** Checkout flow (contact → address → shipping → payment) with re-validation — `area:checkout` `security`
- **M6-07** Inventory reservations and expiry job; no-oversell concurrency test — `area:checkout`
- **M6-08** `PaymentProvider` interface + deterministic test provider — `area:payments`
- **M6-09** First production payment provider (per Q3): OAuth/Connect linking, encrypted credentials, webhooks — `area:payments` `security`
- **M6-10** Idempotent order creation, snapshots, per-store order numbers — `area:checkout`
- **M6-11** Orders dashboard: list, filters, detail, timeline — `area:checkout` `area:ui`
- **M6-12** Refunds (partial, restock) and cancellations — `area:payments`
- **M6-13** Fulfilments — `area:checkout`
- **M6-14** Outbound webhooks: dispatcher, signing, retries, dead letter, auto-disable, SSRF-safe sender, endpoint UI — `area:api` `security`
- **M6-15** Critical end-to-end scenario green in CI — `type:test`

## Milestone 7 — Domains and themes

- **M7-01** Custom domain add + TXT verification + DNS instructions — `area:domains` `security`
- **M7-02** `DomainProvisioner` + edge custom hostname + TLS status — `area:domains`
- **M7-03** Primary domain, secondary redirects, re-verification job, safe removal — `area:domains` `security`
- **M7-04** Theme package format + validator (manifest, documents, CSS rules, assets) — `area:themes` `security`
- **M7-05** Theme catalogue, immutable versions, upload/release pipeline — `area:themes`
- **M7-06** Store themes: install, customise tokens, preview, publish, activate, duplicate, update — `area:themes`
- **M7-07** Apply theme templates as drafts — `area:themes`
- **M7-08** Second first-party theme — `area:themes`

## Milestone 8 — Commercial hardening

- **M8-01** Audit coverage review + audit log viewers (organisation and platform) — `security`
- **M8-02** Rate-limit review across every endpoint — `security`
- **M8-03** Monitoring, alerting, dashboards, status page — `area:infra`
- **M8-04** Security review + external penetration test + remediation — `security`
- **M8-05** Performance review against budgets — `type:test`
- **M8-06** Backup/restore drill and DR runbook — `area:infra`
- **M8-07** Data export (organisation, store, customers, orders) — `area:tenancy`
- **M8-08** Account and organisation deletion workflows — `area:tenancy` `security`
- **M8-09** Billing recovery: dunning emails, grace-period UX — `area:billing`
- **M8-10** Support tooling: suspend/restore store, abuse review queue (audited) — `area:platform-admin` `security`
- **M8-11** MFA (TOTP) for merchants; mandatory SSO + MFA for platform staff — `area:auth` `security`
- **M8-12** Customer erasure requests — `area:checkout` `security`
