// Messages the builder (a client component) recognises in a service's
// answer. No server code here, so the browser can import it.

/** A save, publish or revert whose revision is stale: someone saved since. */
export const DRAFT_CONFLICT_MESSAGE =
  "This page was saved somewhere else (another tab, device or person) after you opened it. Reload to see the latest version; copy anything you want to keep first.";
