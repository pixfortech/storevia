// Where each provider's hosted payment page lives (ADR-0031 §4). The
// storefront's CSP allows these in form-action: its "Pay" form redirects
// there, and browsers check form-action on every redirect after a submit.
// No secrets and no server imports, so the storefront proxy may use it.

export const HOSTED_PAYMENT_ORIGINS: Readonly<Record<string, readonly string[]>> = {
  // The test provider's page is on the storefront itself.
  "storevia-test": [],
  // Payment Links: the rzp.io short link and the pages it forwards to.
  razorpay: [
    "https://rzp.io",
    "https://razorpay.com",
    "https://pages.razorpay.com",
    "https://api.razorpay.com",
    "https://checkout.razorpay.com",
  ],
};

export const ALL_HOSTED_PAYMENT_ORIGINS: readonly string[] = [
  ...new Set(Object.values(HOSTED_PAYMENT_ORIGINS).flat()),
];
