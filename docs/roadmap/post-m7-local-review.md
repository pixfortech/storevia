# Post-M7 completion pass: local review

This covers the theme experience, order operations and customer order notes
([ADR-0033](../adr/0033-order-operations-after-payment.md)). It assumes the
M7 local setup ([m7-local-review.md](./m7-local-review.md)): PostgreSQL
running, `.env` from `.env.example`, and dependencies installed.

## 1. Update and start

```sh
git pull
pnpm install
pnpm db:migrate          # applies 20270201000000_order_operations and 20270201000100_demo_purge_checkout
pnpm db:test:prepare     # only for the integration tests
pnpm dev                 # dashboard :3001, storefront :3002, admin :3003, marketing :3000
pnpm --filter @storevia/worker dev   # emails, cache invalidation, message notifications
```

`ORDER_ACCESS_SECRET` isn't needed locally: in development and test it is
derived from `STOREFRONT_PREVIEW_SECRET`. Deployed environments must set it.
"Delete demo order" appears because `STOREVIA_ENV=development`.

## 2. Themes

**Dashboard → Themes** (a separate area beneath Website; Website keeps
Pages, Navigation and the builder):

- **Library cards.** Each card shows a miniature of the same Storevia demo
  store ("Harbour & Loom") drawn by that theme. Storevia and Boutique
  differ in header layout, product cards and typography. The actions, in
  order: View demo · Install/Installed · Customise · Preview on my store ·
  Publish/Make live.
- **Badges.** Live, Installed, Previewing, Unpublished changes, Not
  installed.
- **View demo.** Switch between Desktop, Tablet and Mobile (the real
  widths, 1280, 768 and 390, scaled down) and between Home and Product
  page. Your own catalogue never appears.

## 3. Orders: shipping journey

1. Set up the store as in M6 (a shipping zone, test payments, go live),
   then buy something on the storefront. The thank-you page now has
   **View your order**; keep that link.
2. Open the order in the dashboard. The status panel shows Payment,
   Fulfilment, Delivery and Order separately.
3. **Fulfil items.** Delivery method _Shipping_, status _Shipped_, carrier
   _Delhivery_, a tracking number and link.
4. On the fulfilment:
   - **Edit** it to change the tracking number. A `javascript:` link is
     refused.
   - Then **Mark in transit**, **Mark out for delivery** and **Mark
     delivered**. Each step shows in the timeline.
5. **Mark complete** is refused with a list of what's missing until
   everything is delivered. Completing early needs "Complete it anyway" and
   a reason.
6. Open the shopper's link. It shows the same journey, tracking and
   milestones, with no staff names or internal ids.

## 4. Orders: local delivery, archive, demo delete

- **Local delivery.** Fulfil with _Local delivery_; the status starts at
  _Ready_. Then **Mark out for delivery**, **Mark delivered** and **Mark
  complete**.
- **Archive order** (in the Order record card). The order leaves the list
  and every tab except **Archived orders**. Searching for its number still
  finds it, and reports still count it. **Restore order** brings it back.
- **Delete demo order.** Available only in development and test, or where
  operations set `DEMO_ORDER_DELETION_ENABLED=true`. You must type the
  order number. Orders with a live payment are refused by the database.

## 5. Customer notes and notifications

1. On the shopper's order page, send "Please deliver after 5 PM".
2. Within about 15 seconds the worker notifies the staff allowed to answer:
   members whose role has `order.message` and who can access that store.
   The bell in the dashboard top bar shows the unread count.
3. Click the notification. It opens the order at **Messages**, and both the
   notification and the message are marked read.
4. **Send reply.** The shopper gets an email (in `EMAIL_FILE_DIR` locally)
   with a link to their order, and the reply appears on their page.
5. Try a changed token (`/orders/view/` plus a changed last character) or
   an order number instead of a token. Both return the store's 404.

## 6. Tests

```sh
pnpm --filter @storevia/commerce test                 # lifecycle rules (unit)
pnpm --filter @storevia/commerce test:integration     # order-operations.int.test.ts and the rest
pnpm --filter @storevia/database test:integration     # grants, policies
pnpm --filter @storevia/worker test:integration       # orders.message-notifications registered
pnpm --filter @storevia/dashboard test                # includes ui-consistency.test.ts
pnpm build
cd apps/dashboard && npx playwright test e2e/order-operations.spec.ts e2e/theme-demo.spec.ts e2e/theme-switch.spec.ts
```
