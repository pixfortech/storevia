// The development preview gate and the period filter for the store home.
// Pure, so the gate is unit-tested; the page passes process.env and the raw
// search parameters.

/** The variables the gate reads; process.env in the app. */
export interface PreviewEnvironment {
  readonly STOREVIA_ENV?: string | undefined;
  readonly NODE_ENV?: string | undefined;
}

/**
 * `?preview=example` shows clearly badged example data for design review.
 * It fails closed, like mock billing (packages/billing registry): the raw
 * STOREVIA_ENV must say development or test (lib/env.ts defaults an unset
 * stage to development, so it isn't used here), and a production build
 * (`next start`, a deployed image) never opens it, whatever the stage says.
 * Deployed environments therefore never show invented numbers.
 */
export function isExamplePreview(
  environment: PreviewEnvironment,
  preview: string | readonly string[] | undefined,
): boolean {
  const stage = environment.STOREVIA_ENV;
  return (
    (stage === "development" || stage === "test") &&
    environment.NODE_ENV !== "production" &&
    preview === "example"
  );
}

export const DASHBOARD_PERIODS = ["7d", "30d", "90d"] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export const PERIOD_DAYS: Readonly<Record<DashboardPeriod, number>> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** `?range=` as a period; anything else is the 30-day default. */
export function parsePeriod(value: string | readonly string[] | undefined): DashboardPeriod {
  return typeof value === "string" && (DASHBOARD_PERIODS as readonly string[]).includes(value)
    ? (value as DashboardPeriod)
    : "30d";
}
