# ADR-0033: Order operations after payment, customer order access and messages

- Status: Accepted
- Date: 2026-09-28

## Context

The post-M7 completion pass asks for what happens to an order once it is
paid: a fulfilment lifecycle with separate payment, fulfilment and delivery
states; editable tracking; delivered and complete; a safe way to remove
orders from view; and a way for a guest shopper to write to the store about
their order, with staff told about it.

Audit of the schema at `2634382` (before this work):

- `Order` had `status` (OPEN | CANCELLED), `paymentStatus`, `fulfilmentStatus`
  and a merchant-only `note`. There was no archive, completion or delivery
  state.
- `Fulfilment` had `state` (PENDING | SUCCESS | CANCELLED), tracking columns
  and `shippedAt`. It had no delivery method, journey status or `deliveredAt`.
- `OrderEvent`, `OrderLine` and the other order snapshot tables were
  append-only for every role through `app_append_only()`. The merchant
  role had no DELETE on orders.
- The checkout role could see only `Order` rows of its own checkout
  (`checkout_scope`). There were no shopper accounts, and no link a shopper
  could reopen.
- There was no in-app notification model.

## Decision

1. **Separate states, one pure rule set.** `packages/commerce/src/orders/lifecycle.ts`
   defines the shipment flows:
   - SHIPPING: READY → SHIPPED → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED.
   - LOCAL_DELIVERY: READY → OUT_FOR_DELIVERY → DELIVERED.

   It also derives the order's delivery status and the completion blockers.
   Payment, fulfilment, delivery and order state are separate columns or
   derivations and separate badges; none is inferred from another.
   Creating a fulfilment never implies delivery.

2. **Fulfilment journey.**
   - **Schema.** `Fulfilment.method` (default SHIPPING), `shipmentStatus` and
     `deliveredAt` are backed by CHECKs:
     - local delivery never takes carrier steps;
     - DELIVERED holds exactly when `deliveredAt` is set;
     - a dispatched fulfilment has `shippedAt`;
     - dates are in order;
     - tracking URLs are http(s) and at most 500 characters.
   - **`updateFulfilment`.** Changes method, status, tracking and dates. It
     needs `order.manage`, is tenant-scoped with row locks, and writes a
     timeline event and an audit entry. Quantities never change there, so
     fulfilled units can't exceed ordered.
   - **Notification.** The "on its way" email is queued once, when a
     fulfilment first leaves READY.

3. **Completion.** `completeOrder` requires settled payment (PAID or
   (partially) refunded), every unit fulfilled and every fulfilment
   delivered, and refuses cancelled orders. Completing anyway needs an
   explicit override plus a reason, which is audited as `action: override`.
   A completed order can't be cancelled or fulfilled further, but tracking
   and refunds still work.

4. **No hard delete of real orders.** `archivedAt` and `archivedById`
   (restorable) take an order out of the default list and every tab but
   "Archived orders". Search across all orders still finds it, and reports
   (`orderMetrics`) still count it. Nothing is removed.

5. **Demo deletion, development and test only.**
   - **Where it's allowed.** `deleteDemoOrder` runs only when `STOREVIA_ENV`
     is development or test, or when operations set
     `DEMO_ORDER_DELETION_ENABLED=true`. It needs `order.manage` and the
     typed order number.
   - **What it does.** It returns reserved stock, writes the
     `order.demo_deleted` audit entry first, then calls the SECURITY DEFINER
     `app_purge_demo_order`. That function:
     - only sees the caller's store;
     - refuses any order with a LIVE-mode payment, whatever the environment;
     - sets a transaction-local marker the append-only trigger honours for
       DELETE only;
     - removes the order's rows in dependency order, detaches payments and
       expires the checkout.

6. **Shopper access through an opaque link.**
   - **Storage.** `OrderCustomerAccess` stores only a SHA-256 of the token,
     with `expiresAt` (180 days) and `revokedAt`.
   - **Token.** base64url(row id) + base64url(HMAC-SHA256(`ORDER_ACCESS_SECRET`,
     id)), 65 characters. Forged or malformed tokens are rejected before
     any query, with a timing-safe comparison.
   - **Database binding.** The checkout role's `Order` policy now also admits
     `id = app_current_order_access()`. That function checks the store,
     expiry and revocation. Child tables (fulfilments, messages) are scoped
     through their order.
   - **What never opens an order.** The order number or email never grants
     access.
   - **Where the link appears.** The confirmation email and the thank-you
     page. The storefront sends `Referrer-Policy: no-referrer`, so the link
     doesn't leak to carriers' tracking pages.

7. **Customer-safe view.** `getCustomerOrder` returns:
   - number, date and state;
   - payment, fulfilment and delivery status;
   - lines and totals;
   - shipments with tracking;
   - milestones derived from event _types_ only, never staff-written
     messages;
   - the conversation, without staff names.

   It never returns internal ids, provider data, staff notes or audit data.

8. **Messages.** `OrderMessage` is append-only (an immutable trigger) and
   separate from `Order.note`.
   - **Content.** Plain text, 1–2,000 characters after cleaning (control
     characters dropped), always rendered as text.
   - **Rate limits.** 10 per order per hour, and 30 per client IP per hour.
   - **Checkout-role policy.** Inserts must be CUSTOMER, with no author, on
     the opened order.
   - **Merchant policy.** Inserts must be STAFF, authored by the current
     user.
   - **CSRF.** Next.js server actions check the origin.

   **Why 2,000:** it is enough for delivery instructions and questions,
   bounded for storage and email, and within the brief's 2,000–5,000 range.

9. **Staff notifications.**
   - **Fan-out.** The worker job `orders.message-notifications` runs every
     15 seconds. It claims each unannounced customer message with `SKIP
LOCKED` and inserts a `StaffNotification` for every active member of
     the store's organisation who:
     - holds a role granting `order.message`, computed from the TypeScript
       RBAC map rather than role names;
     - can access that store (all stores, or a store-access row).
   - **Idempotency.** A unique (user, message) pair makes repeats no-ops.
   - **Bell.** Lists the member's own rows (RESTRICTIVE `own_notifications`)
     and, at read time, only those whose store they can still access with
     `order.read`.
   - **Mark read.** Opening the order marks the member's notifications
     about it read.

10. **Staff replies.**
    - **Permission.** `order.message` (OWNER, ADMIN, STORE_MANAGER,
      ORDER_MANAGER, SUPPORT).
    - **Saving.** Writes the message, a timeline event, an audit entry (the
      fact only, without the body), and queues an `ORDER_MESSAGE_REPLY`
      email in the notification outbox.
    - **Delivery.** Saving never depends on email: the worker sends the
      email with retries.

## Consequences

- Operations must set `ORDER_ACCESS_SECRET` (32+ characters) outside
  development and test. Rotating it invalidates links already sent.
- Order links are bearer links: anyone holding one sees that order.
  Mitigations:
  - the safe subset of fields;
  - 180-day expiry and revocation;
  - `no-referrer`;
  - rate limits on messages.
- Notifications are polled by the bell (on navigation and every minute), not
  pushed. There is no real-time chat.
- Carrier APIs, customer accounts and a returns portal remain out of scope.

## Alternatives considered

- **Hard delete with a high-risk permission.** Rejected. Archive meets the
  need without losing history, reports or audits.
- **Access by order number plus email.** Rejected. Both are guessable or
  leaked in ordinary correspondence.
- **Notifying every member.** Rejected, as the brief requires. It also
  leaks orders to members without order access.
- **Fanning out notifications in the shopper's request.** Rejected. It
  couples the shopper's request to staff membership queries, and it would
  need grants the checkout role must not hold.
