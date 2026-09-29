# Revenue and sales: the one definition

> Final pass, Phase 1 (N). Every sales figure Storevia shows uses this
> definition. It is implemented once, in `packages/commerce/src/orders/metrics.ts`
> (`SALE_ORDER` and the queries beside it), and pinned by
> `packages/commerce/tests/metrics.int.test.ts`.

## Where it is used

| Surface                                                          | Figures                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------- |
| Store home widgets (`storeSalesSummary`, `storeCustomerSummary`) | Revenue, orders, daily trend, best sellers, new customers |
| Orders page (`orderMetrics`)                                     | Orders today, last 30 days, revenue over 30 days          |
| Customers (`listCustomers`)                                      | A customer's total spent                                  |

The marketing site's product screenshots and the dashboard's preview mode
draw clearly labelled example data, never a store's figures.

## Definition

- **Sale.** An order that is not cancelled and not a test order.
- **Revenue.** Sales' order totals (tax and shipping included) less what was
  refunded, in the store's currency. Orders in another currency count as
  orders but add no revenue.
- **Day.** The calendar day the order was placed in the store's time zone
  (UTC when the zone isn't one Postgres knows). "Last 30 days" is the last
  30 calendar days, today included, on the home and the orders page alike.
- **Units sold.** Ordered quantity less refunded units, for sales.
- **New customer.** A customer record created in the period (checkout creates
  one at the first order), unless every order of theirs is a test order.

## Cases

| Case                          | Counts as an order? | Revenue                                                         |
| ----------------------------- | ------------------- | --------------------------------------------------------------- |
| Paid order                    | Yes                 | Total                                                           |
| Partially refunded            | Yes                 | Total less the refunded amount, on the day the order was placed |
| Fully refunded, not cancelled | Yes                 | Nothing (total less refunds is zero)                            |
| Cancelled (refunded or not)   | No                  | Nothing                                                         |
| Test order                    | No                  | Nothing                                                         |
| Failed or abandoned payment   | No order exists     | Nothing                                                         |

A refund lowers the revenue of the day its order was placed, not the day of
the refund, so a past day's figure can go down after a refund.

## Test orders

An order is a test order when it was paid through a test connection: the
Storevia Test Provider (always in test mode) or Razorpay with test keys. The
order records this when it is created, from the payment connection's mode
(`Order.testMode`), so changing keys later never relabels it and nothing is
inferred from display text. `testMode` is part of the immutable order
snapshot.

Test orders stay in the order lists with a TEST badge (list, order page,
payment), have a Test orders filter of their own, and are counted in
operational figures (the Unfulfilled tab and "To fulfil"). They are left out
of every sales figure above. Staff are told about them like any order, as
"New test order #…".
