# Final pass, Phase 2A: store identity, policies, branding and launch basics

> Phase 2A of the plan in [final-pass-audit.md](./final-pass-audit.md) §15,
> after [Phase 1](./final-pass-phase1.md). GST (Phase 2B) was not started.
> Decisions carried forward: test orders stay visible with a TEST badge and
> are excluded from sales; Online store and English only at launch;
> Storevia billing stays manual; legal text comes from counsel.

## 1. Seller identity

- `StoreSellerProfile` (one per store): legal or business name, phone,
  address lines, city, state/region, postal code, country, and an optional
  GSTIN. It is the store's public identity, kept apart from organisation and
  account data. The store's display name and support/contact emails stay on
  the store (Settings → General).
- Settings → General → Seller details (`#seller`): region list per country,
  read-only without `store.update`.
- Validated on the server (`packages/commerce/src/settings/seller.ts`) and
  again by database CHECKs: bounded lengths, no control characters (CR/LF are
  refused, not folded), phone and postal-code formats, a known country, a
  region from the country's list, and a GSTIN with a valid check character.
- The storefront reads it only through `app_storefront_identity()` (no
  GSTIN). The footer and `/policies/contact` show it; seller names render as
  text, never HTML.

## 2. Store policies

- `StorePolicy` per kind (shipping, returns and refunds, cancellation,
  privacy, terms, contact): a draft (title + rich text) and a published copy.
  Saves carry a revision; a stale tab gets a conflict.
- Settings → Policies lists status (Not written, Draft, Published, Unpublished
  changes) and what is required; the editor has a blank state, "Insert
  starter headings" (headings only, marked as a template, with advice to have
  the text reviewed), Save draft, Publish, Unpublish, and "View on your store".
- Storevia writes no policy text. Publishing needs at least some of the
  merchant's own text beyond the headings (enforced on the server).
- Storefront: `/policies/{shipping|refunds|cancellation|privacy|terms}`
  (published only; 404 otherwise) and `/policies/contact` (always: seller
  details, emails, and the published contact text). Footer links, checkout
  links above the Pay button, and sitemap entries.
- Platform Terms and Privacy remain counsel-owned and separate (§9).

## 3. Launch readiness

The Phase 1 framework gained two checks; every failed item links to its fix:

| Check                                                                     | Blocks | Fix                                 |
| ------------------------------------------------------------------------- | ------ | ----------------------------------- |
| Payments (test mode a warning)                                            | yes    | Settings → Payments                 |
| Products                                                                  | yes    | Products                            |
| Shipping (when products ship)                                             | yes    | Settings → Shipping                 |
| Support email                                                             | yes    | Settings → General                  |
| **Seller details** (name, phone, address, city, postal code, country)     | yes    | Settings → General → Seller details |
| **Store policies** (refunds, privacy, terms; shipping when products ship) | yes    | Settings → Policies                 |
| Home page                                                                 | yes    | Pages                               |

Going live still runs the checks on the server in the same transaction; a
replayed Go live request for an incomplete store is refused (E2E).

## 4. Logo and favicon

- Website → Logo and favicon: choose from the Media Library or upload through
  the existing pipeline (the builder's media picker), preview, replace,
  remove. Permission `design.edit` (changes go live at once, like menus).
- Server-side: the media must be this store's (other tenants' and other
  stores' ids read as not found), READY, an image with renditions; a favicon
  at most 2:1. Audited; unchanged values write nothing.
- Storefront header shows the logo (alt = store name), sized without
  distortion in both header variants; `generateMetadata` links the smallest
  rendition as `icon` and `apple-touch-icon`. Fallbacks: the name as text,
  the browser's default icon.
- Changes invalidate cached pages through the existing `store.changed`
  outbox event.

## 5. Footer

A default ecommerce footer from real data: store name or logo, seller legal
name, address, phone (tel:) and email (mailto:), the footer menu, a Policies
menu (published policies and Contact) and a copyright line. No newsletter or
social links, no client JavaScript, theme tokens only.

## 6. Product logistics fields

- Single-variant products: "Shipping and tax" on the product (physical
  product / requires shipping, weight with a g/kg input stored as whole
  grams, taxable). Multi-variant products: each variant can override weight,
  shipping and tax. SKU and category unchanged.
- HSN code (product level, optional, 4/6/8 digits, audited): stored for
  Phase 2B, used in no calculation, never readable by the storefront role;
  in the product CSV and the data export.
- ₹0 products: publishing a product with a live ₹0 variant needs an explicit
  confirmation ("This product is free. Publish anyway?") on create-as-active
  and Set as active; the server refuses without it (`CONFIRMATION_REQUIRED`).
  Bulk activation skips free products and says why. Free products stay
  allowed.

## 7. Order export

Orders → Export CSV: the current tab (including Test orders and Archived),
search and a from/to date range in the store's time zone. Streamed in
500-row keyset pages (UTF-8 with BOM), CSV-injection-safe, `order.read`
only, another tenant's store is a 404, 30 exports per hour per store,
audited without personal data. Columns: order, placed at, order state,
payment, fulfilment, test order, customer name and email, items, currency,
subtotal, discount, shipping, tax, total, refunded, net. No internal ids,
payment references or GST columns.

## 8. Theme demo corrections (TH-1)

Removed from the demo: the announcement bar (no merchant setting feeds it),
"You may also like" (no related products), and a "Journal" menu link
(blogs are planned). The demo product page is exactly the storefront's
product template. A denylist test scans every rendered demo page, for every
theme, for twelve phantom capability groups.

## 9. Copy fixes

- Plans sell only what exists: pricing cards, the comparison and the
  dashboard's plan view list available features only; planned features
  appear in a separate "Planned, and not part of any plan yet" section.
  Prices, names, limits and entitlements are unchanged.
- The discounts feature description no longer mentions automatic discounts
  (data migration).
- Marketing describes new-order notifications accurately.
- Platform legal: `apps/marketing/src/content/legal.ts` records each document
  as placeholder or final. Placeholders are visibly marked and noindex; the
  marketing app refuses to start with `STOREVIA_ENV=production` while any is
  a placeholder, and `pnpm check:launch` fails until counsel's text lands
  (launch checklist §12). No legal text was written.

## 10. Migrations

| Migration                                | What                                                                                                                                                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20270601000000_store_identity_policies` | StoreSellerProfile, StorePolicy (+ enum), Product.hsnCode; RLS, grants, storefront read function, outbox triggers (seller, published policies, store emails), organisation deletion erases seller profile, policies, store emails and brand images |
| `20270601000100_feature_copy_truth`      | Discounts feature description (data only)                                                                                                                                                                                                          |

Both are expand-only.

## 11. Tests and CI

| Gate                         | Result                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------- |
| Format, lint, typecheck      | clean (24 packages)                                                              |
| Unit                         | 1369 passed                                                                      |
| Integration (real Postgres)  | 1047 passed                                                                      |
| E2E (fresh production build) | 94 tests; all pass in GitHub CI (Node LTS and Node Current)                      |
| gitleaks                     | no leaks                                                                         |
| GitHub CI                    | green on every job (Verify, Integration, E2E on both runtimes, Windows, secrets) |

Fixed while closing the pass:

- Product form: the status choice reset to Draft after "Keep editing" in the
  ₹0 dialog, so a second save skipped the question (the radio group is now
  remounted with the submitted choice).
- Policy editor: Publish was enabled after one character of the merchant's
  own text while the server needs 20; both use `POLICY_MIN_OWN_TEXT` now.
- Tests: the branding integration suite needed a media signing secret in CI;
  a copy-truth regex backtracked for over 5 s on CI; the test-order spec
  checked the bell after opening the order (which marks it read); and
  spec-only issues (Node requests to `*.localhost`, a missing product before
  going live, ambiguous locators, a logo check matching the inlined CSS, and
  a hand-enabled button React never re-disabled).

New suites: `store-identity`, `store-branding`, `product-logistics`,
`order-export` (integration); `store-identity`, `store-branding`,
`product-logistics`, `order-export` (E2E), plus updated readiness, theme-demo,
marketing and redesign specs.

## 12. Inputs needed before GST (Phase 2B)

1. **Registration model**: are launch merchants regular GST-registered
   taxpayers only, or also composition-scheme or unregistered sellers (which
   change whether tax is charged at all and what the invoice is called)?
2. **Where GSTIN lives**: the seller profile now holds a validated GSTIN, and
   Settings → Tax still has a free-text "tax registration id". Confirm the
   seller profile is the single source (we'd migrate and remove the other).
3. **Rate source**: merchant-entered GST rate per product/variant (with HSN
   as a label), or rates derived from HSN via a maintained table (who
   maintains it?).
4. **Price convention**: prices inclusive of GST (typical for B2C in India)
   as the default, and whether exclusive pricing must be supported at launch.
5. **Place of supply**: confirm intra-state CGST+SGST vs inter-state IGST by
   the shipping address state against the seller's registered state (from
   the GSTIN's state code), and the rule for orders without a shipping
   address.
6. **Shipping and discounts**: shipping taxed at the rate of the goods
   (highest rate for mixed carts?) or a fixed rate; discounts applied before
   tax.
7. **Invoices**: numbering series format (prefix, financial-year reset),
   whether B2B (buyer GSTIN at checkout) is in scope, e-invoicing/IRN
   thresholds out of scope, and counsel/CA sign-off on the invoice and
   credit-note templates.
8. **Rounding**: per line or per invoice, and to the paisa or rupee.
9. **E-commerce operator status**: confirm Storevia is not an e-commerce
   operator collecting on the seller's behalf (payments go to the merchant's
   own Razorpay account), so TCS under section 52 doesn't apply.
10. **Exports and exemptions**: zero-rated exports, exempt and nil-rated goods
    out of scope at launch, or needed.
