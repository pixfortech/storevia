// Razorpay sandbox validation (M8, docs/operations/razorpay-staging.md).
// Runs the real RazorpayProvider against Razorpay's **test mode** API: no
// real money moves, and live keys are refused. Never part of CI (it needs
// credentials and a person to pay the test link).
//
//   RAZORPAY_TEST_KEY_ID=rzp_test_… RAZORPAY_TEST_KEY_SECRET=… \
//     pnpm --filter @storevia/payments sandbox:razorpay [--skip-payment]
//
// Checks: a payment link is created and read back; a cancelled link reads
// as cancelled; (unless --skip-payment) a person pays the test link, the
// captured payment is seen, and a refund repeated with the same
// idempotency key returns the same refund instead of a second one.
// Prints ids and statuses only, never keys.
import { RazorpayProvider } from "../src/razorpay";
import type { ProviderCredentials } from "../src/types";

const keyId = process.env["RAZORPAY_TEST_KEY_ID"] ?? "";
const keySecret = process.env["RAZORPAY_TEST_KEY_SECRET"] ?? "";
if (!/^rzp_test_[A-Za-z0-9]{8,32}$/.test(keyId) || keySecret.length < 16) {
  console.error(
    "Set RAZORPAY_TEST_KEY_ID (rzp_test_…) and RAZORPAY_TEST_KEY_SECRET. Live keys are refused.",
  );
  process.exit(2);
}
const skipPayment = process.argv.includes("--skip-payment");
const credentials: ProviderCredentials = { keyId, keySecret, webhookSecret: "unused-here" };
const provider = new RazorpayProvider(
  process.env["RAZORPAY_API_URL"] ? { apiUrl: process.env["RAZORPAY_API_URL"] } : {},
);

const results: { check: string; ok: boolean; detail: string }[] = [];
const record = (check: string, ok: boolean, detail: string) => {
  results.push({ check, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${check}  ${detail}`);
};
const run = `sandbox_${Date.now().toString(36)}`;
const link = (suffix: string) =>
  provider.createPayment(credentials, {
    reference: `${run}_${suffix}`,
    amount: 100n, // ₹1.00 in test mode
    currency: "INR",
    description: "Storevia sandbox validation",
    customerEmail: null,
    returnUrl: "https://example.com/storevia-sandbox-return",
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });

try {
  const cancelled = await link("cancel");
  record(
    "create payment link",
    cancelled.providerPaymentId.startsWith("plink_"),
    cancelled.providerPaymentId,
  );
  const fresh = await provider.getPayment(credentials, cancelled.providerPaymentId);
  record("read a new link as pending", fresh.status === "pending", fresh.status);
  await provider.cancelPayment(credentials, cancelled.providerPaymentId);
  const after = await provider.getPayment(credentials, cancelled.providerPaymentId);
  record("cancelled link reads as cancelled", after.status === "cancelled", after.status);

  if (!skipPayment) {
    const paid = await link("pay");
    console.log(`\nOpen ${paid.redirectUrl} and pay with a Razorpay test method`);
    console.log(
      "(e.g. UPI success@razorpay, or a test card from Razorpay's docs). Waiting up to 10 minutes…\n",
    );
    let state = await provider.getPayment(credentials, paid.providerPaymentId);
    const deadline = Date.now() + 10 * 60_000;
    while (state.status === "pending" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      state = await provider.getPayment(credentials, paid.providerPaymentId);
    }
    record(
      "captured payment is seen with its amount",
      state.status === "captured" && state.amount === 100n && Boolean(state.chargeId),
      `${state.status} ${String(state.amount)} ${state.chargeId ?? ""}`,
    );
    if (state.chargeId) {
      const input = {
        chargeId: state.chargeId,
        amount: 100n,
        currency: "INR",
        reference: `${run}_refund`,
      };
      const first = await provider.refundPayment(credentials, input);
      record(
        "refund accepted",
        first.status !== "failed",
        `${first.status} ${first.providerRefundId ?? ""}`,
      );
      const again = await provider.refundPayment(credentials, input);
      record(
        "the same idempotency key returns the same refund",
        again.providerRefundId === first.providerRefundId,
        again.providerRefundId ?? "",
      );
    }
  }
} catch (error) {
  record("sandbox run", false, error instanceof Error ? error.message : "failed");
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${String(results.length - failed)} passed, ${String(failed)} failed`);
process.exit(failed > 0 ? 1 : 0);
