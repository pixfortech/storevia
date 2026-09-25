// Illustrative content for the product mockups. Everything here is fiction:
// the Northwind business, its people, products, posts and every figure.
// Mockups that show it are labelled as illustrative example data; nothing on
// the site presents these numbers as real customers or results.
import type { BusinessType } from "@storevia/tenancy/business-types";

export const SAMPLE_ORGANISATION = "Northwind Ltd";
export const SAMPLE_PERSON = { name: "Amara Okafor", firstName: "Amara" } as const;
export const SAMPLE_STORE_ADDRESS = "northwind.example";

/** Day the example series end on. Fixed, so server and client render the same dates. */
const SERIES_END = Date.UTC(2026, 8, 23);
const DAY = 86_400_000;

/**
 * A deterministic example series: a gentle trend, a weekly rhythm and fixed
 * jitter (a seeded LCG), so every render draws the same line.
 */
export function exampleSeries(
  length: number,
  {
    base,
    growth,
    weekly = 0,
    jitter = 0,
    seed = 1,
  }: {
    base: number;
    /** Total rise across the series, as a share of base (0.2 = +20%). */
    growth: number;
    /** Weekly swing, as a share of base. */
    weekly?: number;
    /** Random swing, as a share of base. */
    jitter?: number;
    seed?: number;
  },
): number[] {
  let state = seed >>> 0 || 1;
  const random = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
  return Array.from({ length }, (_, index) => {
    const progress = length > 1 ? index / (length - 1) : 1;
    const trend = base * (1 + growth * progress);
    const season = base * weekly * Math.sin((index / 7) * Math.PI * 2);
    const noise = base * jitter * (random() * 2 - 1);
    return Math.max(0, Math.round(trend + season + noise));
  });
}

/**
 * Rescales a series so it sums to `total` exactly (the last point absorbs
 * rounding), so a chart agrees with the figure printed beside it.
 */
export function scaleSeries(series: readonly number[], total: number): number[] {
  const sum = series.reduce((acc, value) => acc + value, 0);
  if (sum === 0 || series.length === 0) return series.map(() => 0);
  const scaled = series.map((value) => Math.round((value * total) / sum));
  const drift = total - scaled.reduce((acc, value) => acc + value, 0);
  scaled[scaled.length - 1] = (scaled.at(-1) ?? 0) + drift;
  return scaled;
}

/** Dates for a daily series ending on the fixed example day. */
export function exampleDates(length: number): Date[] {
  return Array.from({ length }, (_, index) => new Date(SERIES_END - (length - 1 - index) * DAY));
}

export interface SampleKpi {
  readonly label: string;
  readonly value: string;
  /** Signed change, in percent unless `deltaLabel` says otherwise. */
  readonly delta: number;
  readonly deltaLabel?: string;
  readonly trend: readonly number[];
}

export interface SampleRow {
  readonly label: string;
  readonly detail: string;
  readonly value: string;
}

export interface SampleDashboard {
  readonly store: string;
  /** The page's primary action in the top bar. */
  readonly action: string;
  readonly kpis: readonly SampleKpi[];
  readonly chart: {
    readonly title: string;
    readonly headline: string;
    readonly delta: number;
    readonly data: readonly number[];
    readonly previous: readonly number[];
    readonly format: Intl.NumberFormatOptions;
  };
  readonly list: { readonly title: string; readonly rows: readonly SampleRow[] };
}

const USD: Intl.NumberFormatOptions = {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
};
const COUNT: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };

export const SAMPLE_DASHBOARDS: Readonly<Record<BusinessType, SampleDashboard>> = {
  ECOMMERCE: {
    store: "Northwind Studio",
    action: "New product",
    kpis: [
      {
        label: "Revenue",
        value: "$12,480",
        delta: 12.4,
        trend: exampleSeries(14, { base: 760, growth: 0.3, jitter: 0.08, seed: 3 }),
      },
      {
        label: "Orders",
        value: "318",
        delta: 4.3,
        trend: exampleSeries(14, { base: 21, growth: 0.18, jitter: 0.1, seed: 5 }),
      },
      {
        label: "Visitors",
        value: "8,940",
        delta: 9.1,
        trend: exampleSeries(14, { base: 560, growth: 0.22, jitter: 0.09, seed: 8 }),
      },
      {
        label: "New customers",
        value: "126",
        delta: 8.6,
        trend: exampleSeries(14, { base: 8, growth: 0.25, jitter: 0.12, seed: 13 }),
      },
    ],
    chart: {
      title: "Sales",
      headline: "$12,480",
      delta: 12.4,
      data: scaleSeries(
        exampleSeries(30, { base: 360, growth: 0.32, weekly: 0.12, jitter: 0.1, seed: 21 }),
        12480,
      ),
      previous: exampleSeries(30, { base: 330, growth: 0.1, weekly: 0.1, jitter: 0.1, seed: 34 }),
      format: USD,
    },
    list: {
      title: "Top products",
      // Ranked by revenue, the figure the list emphasises.
      rows: [
        { label: "Linen apron", detail: "61 sold", value: "$2,867" },
        { label: "Oak serving board", detail: "47 sold", value: "$2,773" },
        { label: "Stoneware mug", detail: "84 sold", value: "$2,352" },
        { label: "Ceramic vase", detail: "39 sold", value: "$2,301" },
      ],
    },
  },
  BUSINESS: {
    store: "Northwind Workshop",
    action: "New page",
    kpis: [
      {
        label: "Visitors",
        value: "6,210",
        delta: 7.8,
        trend: exampleSeries(14, { base: 410, growth: 0.2, jitter: 0.08, seed: 4 }),
      },
      {
        label: "Page views",
        value: "18,420",
        delta: 5.2,
        trend: exampleSeries(14, { base: 1200, growth: 0.15, jitter: 0.07, seed: 6 }),
      },
      {
        label: "Enquiries",
        value: "42",
        delta: 16.7,
        trend: exampleSeries(14, { base: 2, growth: 0.5, jitter: 0.2, seed: 9 }),
      },
      {
        label: "Pages updated",
        value: "9",
        delta: 0,
        trend: exampleSeries(14, { base: 6, growth: 0.1, jitter: 0.2, seed: 10 }),
      },
    ],
    chart: {
      title: "Visitors",
      headline: "6,210",
      delta: 7.8,
      data: scaleSeries(
        exampleSeries(30, { base: 190, growth: 0.25, weekly: 0.18, jitter: 0.08, seed: 22 }),
        6210,
      ),
      previous: exampleSeries(30, {
        base: 180,
        growth: 0.08,
        weekly: 0.16,
        jitter: 0.08,
        seed: 35,
      }),
      format: COUNT,
    },
    list: {
      title: "Top pages",
      rows: [
        { label: "Home", detail: "/", value: "4,120" },
        { label: "Services", detail: "/services", value: "1,860" },
        { label: "About", detail: "/about", value: "1,240" },
        { label: "Contact", detail: "/contact", value: "910" },
      ],
    },
  },
  PUBLISHING: {
    store: "Northwind Journal",
    action: "New post",
    kpis: [
      {
        label: "Readers",
        value: "24,900",
        delta: 11.2,
        trend: exampleSeries(14, { base: 1600, growth: 0.25, jitter: 0.08, seed: 7 }),
      },
      {
        label: "Page views",
        value: "61,300",
        delta: 8.4,
        trend: exampleSeries(14, { base: 4100, growth: 0.2, jitter: 0.07, seed: 11 }),
      },
      {
        label: "Posts published",
        value: "12",
        delta: 20,
        trend: exampleSeries(14, { base: 5, growth: 0.4, jitter: 0.2, seed: 12 }),
      },
      {
        label: "Average read",
        value: "4m 12s",
        delta: 3.1,
        trend: exampleSeries(14, { base: 240, growth: 0.06, jitter: 0.05, seed: 14 }),
      },
    ],
    chart: {
      title: "Readers",
      headline: "24,900",
      delta: 11.2,
      data: scaleSeries(
        exampleSeries(30, { base: 720, growth: 0.3, weekly: 0.2, jitter: 0.08, seed: 23 }),
        24900,
      ),
      previous: exampleSeries(30, { base: 690, growth: 0.1, weekly: 0.18, jitter: 0.08, seed: 36 }),
      format: COUNT,
    },
    list: {
      title: "Top posts",
      rows: [
        { label: "A field guide to slow mornings", detail: "Guides", value: "6,420" },
        { label: "What we learned firing stoneware", detail: "Studio", value: "4,980" },
        { label: "The case for fewer, better tools", detail: "Essays", value: "3,760" },
        { label: "Notes from the studio: September", detail: "Studio", value: "2,110" },
      ],
    },
  },
  PORTFOLIO: {
    store: "Northwind Design",
    action: "New project",
    kpis: [
      {
        label: "Project views",
        value: "3,480",
        delta: 14.6,
        trend: exampleSeries(14, { base: 220, growth: 0.3, jitter: 0.1, seed: 15 }),
      },
      {
        label: "Enquiries",
        value: "18",
        delta: 12.5,
        trend: exampleSeries(14, { base: 1, growth: 0.6, jitter: 0.3, seed: 16 }),
      },
      {
        label: "Visitors",
        value: "2,960",
        delta: 6.9,
        trend: exampleSeries(14, { base: 200, growth: 0.2, jitter: 0.08, seed: 17 }),
      },
      {
        label: "Projects updated",
        value: "4",
        delta: 0,
        trend: exampleSeries(14, { base: 3, growth: 0.1, jitter: 0.2, seed: 18 }),
      },
    ],
    chart: {
      title: "Project views",
      headline: "3,480",
      delta: 14.6,
      data: scaleSeries(
        exampleSeries(30, { base: 100, growth: 0.35, weekly: 0.15, jitter: 0.1, seed: 24 }),
        3480,
      ),
      previous: exampleSeries(30, { base: 95, growth: 0.1, weekly: 0.14, jitter: 0.1, seed: 37 }),
      format: COUNT,
    },
    list: {
      title: "Popular projects",
      rows: [
        { label: "Harbour House identity", detail: "Branding", value: "1,240" },
        { label: "Field notes, printed", detail: "Editorial", value: "980" },
        { label: "Northwind packaging", detail: "Packaging", value: "760" },
        { label: "Studio lighting study", detail: "Photography", value: "520" },
      ],
    },
  },
};

export interface SampleActivity {
  readonly person: string;
  readonly action: string;
  readonly subject: string;
  readonly when: string;
}

/** Team activity, as the dashboard's audit-trail feed would show it. */
export const SAMPLE_ACTIVITY: readonly SampleActivity[] = [
  { person: "Amara Okafor", action: "published", subject: "Autumn collection", when: "2 min ago" },
  {
    person: "Jonas Weber",
    action: "updated stock for",
    subject: "Stoneware mug",
    when: "18 min ago",
  },
  {
    person: "Mei Tanaka",
    action: "invited",
    subject: "Leo Martin as Order manager",
    when: "1 h ago",
  },
  { person: "Amara Okafor", action: "changed", subject: "shipping settings", when: "Yesterday" },
];

export type ProductArtKind = "mug" | "vase" | "board" | "apron";

export interface SampleProduct {
  readonly name: string;
  readonly price: string;
  readonly art: ProductArtKind;
}

export const SAMPLE_PRODUCTS: readonly SampleProduct[] = [
  { name: "Stoneware mug", price: "$28", art: "mug" },
  { name: "Ceramic vase", price: "$59", art: "vase" },
  { name: "Oak serving board", price: "$59", art: "board" },
  { name: "Linen apron", price: "$47", art: "apron" },
];
