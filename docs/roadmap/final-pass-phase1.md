# Final pass, Phase 1: correctness, truth and launch gating

> Phase 1 of the plan in [final-pass-audit.md](./final-pass-audit.md) §15.
> Scope as approved: PB-1, PB-2, PB-3, CO-1, ORD-1, CO-3, DB-5, MK-1/2/3,
> DB-1, DB-2, DB-3, DB-4, SF-3 and one revenue definition. Nothing from
> Phase 2 (GST, invoices, COD, policies, advanced discounts or shipping,
> builder redesign, themes, analytics, visual work) was started.

## 1. PB-1: edit after publish

**Root cause.** `publishPage` turned the page's DRAFT version into the
PUBLISHED one and left the page with no draft. The builder's next save ran
`UPDATE … WHERE state = 'DRAFT' AND revision = $rev`, matched nothing, and
reported the draft-conflict error ("saved somewhere else"). Publishing again
failed the same way. A failing integration test reproduced it before the fix.

**Fix** (`packages/site-admin/src/pages.ts`). In the same transaction as the
publish, a new DRAFT copying the published document is created. Revisions
are never reissued for a page: a new draft (after publish, revert, or a
reopen) starts at `max(revision) + 1` over all the page's versions, so a
stale tab still gets a real conflict. Publishing an unchanged draft is a
no-op ("Nothing new to publish"), and Publish is disabled when there is
nothing new. The builder sends one save/publish/revert at a time and enters
the conflict state only for the real draft-conflict error.

## 2. PB-2: revert to published

`revertPageDraft` copies the published document into the draft (with a new
revision), never touches the live version, needs `design.edit`, refuses a
stale revision or a never-published page, and is audited
(`page.draft_reverted`). The builder shows "Revert to published" on live
pages with a confirmation dialog.

## 3. PB-3: field-level validation

`packages/editor/src/document/issues.ts` turns schema issues into
section + field + message ("Section 2 · Hero › Button › Button text: Enter
at least 1 character."). The builder validates every change on the client,
shows each problem at its field, lists them in a "Problems on this page"
alert whose "Show" button selects the section and focuses the field, marks
the section "Needs a fix", and never sends an invalid document. The server
still validates and returns the same structured problems.

## 4. CO-1: test orders

`Order.testMode` is recorded at checkout from the payment connection's mode
(the Test Provider is always TEST; Razorpay test keys are TEST), is part of
the immutable order snapshot, and was backfilled from existing payments.
Test orders stay in the order lists with a TEST badge (list, order page,
payment), have a Test orders filter, and a note explains they aren't
counted. Every sales figure excludes them (see §11).

## 5. ORD-1: new-order notifications

Worker job `orders.new-order-notifications` (every 15 s) claims each new
order (`Order.staffNotifiedAt IS NULL`, `FOR UPDATE SKIP LOCKED`) and
creates a `StaffNotification` of kind `NEW_ORDER` for each active member
whose role grants `order.read` and who can access the store. A partial
unique index makes a repeat a no-op; existing orders were marked as
announced by the migration. The bell links straight to the order ("New
order #1001", or "New test order #1001").

## 6. CO-3: Reply-To

Every shopper email carries Reply-To: the store's support email, else its
contact email, else Storevia's fallback (`EMAIL_REPLY_TO_FALLBACK`, else
the `EMAIL_FROM` address). Addresses are checked again at send time
(`safeEmailAddress`): anything that could carry another header (CR, LF,
commas, angle brackets, control characters) is dropped, never sent. Store
settings say where shoppers' replies go.

## 7. DB-1: launch readiness

See [launch-readiness.md](../product/launch-readiness.md). Checks for
payments (test mode is a warning), an active product, shipping when
products ship, a support or contact email, and a published home page.
`setStorefrontLive` requires the checks to go live and runs them in the
same transaction with the store row locked. Settings → Storefront lists
them with Fix links and disables Go live; the store home's set-up steps show
the same list; seeds go live through the same checks. Store policies join
the list in Phase 2.

## 8. DB-2: business types

`LAUNCH_BUSINESS_TYPES = ["ECOMMERCE"]`. New stores and onboarding offer
only Online store, and the create and change actions refuse anything else
on the server. Existing stores of other types keep working and may keep
their type; the tenancy services and seeds still accept all four.

## 9. Account and support (DB-4, DB-3)

**Profile.** Account → Profile changes the display name, and changes the
email with step-up (recent password), a single-use hashed token to the new
address (1 hour), a notice to the old address, other sessions revoked and
old reset links voided. An address already in use gets the same response
without revealing it. Built on the existing `Verification` table, not
Better Auth's stateless change-email links.

**Support.** One destination: `SUPPORT_URL`, else the marketing site's
contact page (required in staging and production). `/support` redirects to
it; the account menu, billing, store-limit notices, the storefront-unavailable
note, the error page and the "email changed" notice link to it. No live chat
is offered.

## 10. Truth corrections (DB-5, MK-2, MK-3, MK-1, SF-3)

- One status source: `@storevia/entitlements/availability` (available /
  planned for every plan feature) and `STORE_AREAS.availability`. The
  dashboard and the marketing site read it; parity tests
  (`apps/marketing/src/content/truth.test.ts`,
  `apps/dashboard/src/copy-truth.test.ts`) fail on disagreement or on
  milestone / "later release" / "Soon" wording.
- Shipped features no longer shown as roadmap (storefront, builder,
  checkout, orders, customers, domains, themes, store figures); unbuilt ones
  no longer claimed (analytics depth, automatic discounts, store-limited
  access screens, page-version restore, other business types).
- Terms and Privacy stay clearly marked placeholders that counsel must
  replace before launch. No legal text was written.
- Store locales are English only (`SUPPORTED_LOCALES`); an existing store
  keeps its locale but can't change to an unsupported one.

## 11. Revenue definition

See [revenue-definition.md](../product/revenue-definition.md). A sale is an
order that is neither cancelled nor a test order; revenue is the order
total (tax and shipping included) less refunds, on the order's placed day in
the store's time zone, in the store's currency. Partial refunds reduce it,
full refunds zero it, failed payments never become orders. One
implementation (`SALE_ORDER` in `metrics.ts`) now serves the home widgets,
the orders page (previously rolling UTC and `status = 'OPEN'` only) and
customer totals.

## 12. Tests and CI

Gate on the merged branch (local, then GitHub CI run 152 on `e674b0c`: all
jobs green, including E2E on Node LTS and canary, Windows, and the secret
scan):

| Check                           | Result                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| Format, lint, typecheck         | Clean (24/24 typecheck tasks)                                                      |
| Unit                            | 1,312 passed (21 packages)                                                         |
| Integration                     | 1,013 passed (13 packages)                                                         |
| E2E (fresh build of the 4 apps) | 84 tests: 76 passed in the full run; the 8 that failed were fixed and re-run green |
| gitleaks (full history)         | No leaks                                                                           |

The eight E2E failures in the first full run: the email-change confirmation
was replaced by "link can't be used" after a layout revalidation (product
bug, fixed); two disk-full crashes on the build machine (passed once space
was freed); and five specs whose expectations predated the merge (bell
counts with new-order notifications, a store going live without a product,
the online store's mobile bar, a Node request to a `*.localhost` host, a
duplicate text match), plus the business-type confirmation, which now shows
on the read-only card.

New and changed coverage: `metrics.int.test.ts` (test-order exclusion, one
definition), `order-operations.int.test.ts` (notification recipients,
idempotency, links), `orders.int.test.ts` (Reply-To), `readiness.int.test.ts`,
`tenancy/tests/storefront.int.test.ts` (enforcement), `site.int.test.ts`
(publish → edit → save, stale tabs, revert), `profile.int.test.ts`,
`reply-to.test.ts`, `issues.test.ts`, the truth parity tests, and E2E
`launch-and-test-orders`, `site-builder-drafts`, `account-profile`,
`business-types`.

## 13. Remaining launch blockers (Phase 2)

- **SF-1 / CO-2** store policies and seller identity (with a policies
  readiness check), **SF-2** logo and favicon, **PB-10** footer content.
- **MK-1** Terms, Privacy and sign-up consent: waiting on counsel.
- **STD-1/2/3/4/5** GST slabs, place of supply, tax invoices and credit
  notes, GST report (dedicated phase, ADR first); **ORD-2** order CSV.
- **CAT-2** weight / requires-shipping / taxable fields in the product form,
  **CAT-11** ₹0 publish warning.
- **TH-1** theme demo parity.
- Platform subscription billing stays manual (decision); the reference
  data still lists planned features on paid plans, shown as "On the
  roadmap"; the seeded discount feature description still mentions
  automatic discounts (changing it needs a data migration).
