# Razorpay in staging

> M8. Razorpay is validated in three layers. Only the first runs in CI; none
> ever uses live keys or moves real money.

## 1. In CI: the whole flow against a local Razorpay (every push)

`packages/commerce/tests/razorpay-flow.int.test.ts` drives the real
`RazorpayProvider` and the real checkout, webhook and refund services
against an in-process stand-in for Razorpay's API
(`packages/commerce/tests/razorpay-fake.ts`: payment links, refunds, Basic
auth per merchant key, and webhooks signed exactly as Razorpay signs them,
HMAC-SHA256 of the raw body with the webhook secret).

| Case                                                                                       | Expected                                                                                                    |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Checkout → payment link for the checkout total → shopper pays → signed `payment_link.paid` | One order, `PAID`, total equal to the link amount                                                           |
| The same delivery again (Razorpay's retry)                                                 | `duplicate`, nothing changes                                                                                |
| The same delivery under a new event id (replay; the id header isn't signed)                | `duplicate`                                                                                                 |
| A tampered body                                                                            | 401                                                                                                         |
| The shopper's return before the webhook, and after it                                      | One order either way (the return asks Razorpay server-side)                                                 |
| Return before paying; then `payment_link.expired`                                          | No order                                                                                                    |
| Store A's event sent to store B's endpoint (A's secret, then B's)                          | 401, then `ignored`; no order in B                                                                          |
| Refund                                                                                     | Razorpay called with the merchant's key and `X-Refund-Idempotency: <refund id>`; order `PARTIALLY_REFUNDED` |
| Refund whose answer is lost (connection dropped after Razorpay made it)                    | `PENDING`, no money moved; the merchant marks it after checking Razorpay                                    |
| Refund declined                                                                            | `FAILED`, order keeps its money                                                                             |

The provider's unit tests (`packages/payments/src/payments.test.ts`) cover
the signature, return-signature and payload parsing rules in isolation.

## 2. Against Razorpay's test mode, by hand (before launch, after provider changes)

```sh
RAZORPAY_TEST_KEY_ID=rzp_test_… RAZORPAY_TEST_KEY_SECRET=… \
  pnpm --filter @storevia/payments sandbox:razorpay
```

The script refuses anything but `rzp_test_` keys. It creates a ₹1 payment
link and reads it back, cancels a second link, then prints a link for you
to pay with a Razorpay **test** method (UPI `success@razorpay` or a test
card from Razorpay's docs), waits for the capture, refunds it, and repeats
the refund with the same idempotency key to confirm Razorpay returns the
same refund. `--skip-payment` runs only the unattended checks. Output is
ids and statuses only. (Checked here only against the local stand-in: 6/6.
The run against Razorpay's test mode needs the owner's test keys.)

## 3. In staging, end to end (the launch rehearsal)

1. In the Razorpay dashboard, **Test mode**: create API keys and a webhook
   to `https://app.staging.storevia.com/api/webhooks/payments/<connection id>`
   (the store's Settings → Payments shows the exact URL) for the events
   `payment_link.paid`, `payment_link.cancelled`, `payment_link.expired`,
   with a webhook secret.
2. In the staging dashboard, connect Razorpay on a synthetic store with the
   test keys and that secret (a recent password is required).
3. On the store, buy a product, pay with a test method, and confirm:
   the order appears once in the dashboard; the shopper's order page and
   email arrive; the logs show `payment webhook` entries without payloads
   or signatures.
4. In Razorpay's dashboard, **resend** the same webhook: it shows as a
   duplicate and nothing changes.
5. Refund part of the order from the dashboard: Razorpay's test dashboard
   shows one refund; the order shows `Partially refunded`.
6. Temporarily change the webhook secret in Razorpay only, send a test
   event: it is refused with 401 (`invalid_signature` in the logs) and the
   `payments.webhook_rejected` metric counts it. Deliveries whose
   processing failed show per store in platform-admin → the organisation →
   Support ("payment webhooks failed, 7 days"). Restore the secret.

Never put live keys in staging. Live keys (`rzp_live_…`) are for
production only, entered by each merchant; Storevia holds no platform
Razorpay account.

## Known limits

- Razorpay refund webhooks (`refund.processed`, `refund.failed`) aren't
  consumed. A refund Razorpay accepted is recorded as refunded at once; one
  whose answer was lost stays `PENDING` until the merchant marks it after
  checking Razorpay (the order page says so). Reconciling from refund
  webhooks is a post-launch improvement.
- INR only (Razorpay payment links in M6).
