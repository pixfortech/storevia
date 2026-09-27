import type { BusinessType } from "@storevia/tenancy/business-types";
import type { ActivityItem } from "@/lib/dashboard/activity";
import type { FocusArea } from "@/lib/dashboard/compose";
import type { ExampleFormat } from "@/lib/dashboard/example-data";
import type { DashboardPeriod } from "@/lib/dashboard/preview";
import type { CustomerFigures, SalesFigures } from "@/lib/dashboard/sales";
import type { SetupTask } from "@/lib/dashboard/setup";

/** What every widget may need, resolved once by the page. */
export interface DashboardScope {
  readonly businessType: BusinessType;
  /** Example data is allowed (development preview). */
  readonly preview: boolean;
  readonly period: DashboardPeriod;
  /** The period's last day, fixed per request. */
  readonly today: Date;
  readonly format: ExampleFormat;
  /** Billing page link, for members who may read billing (plan locks link to it). */
  readonly billingHref: string | null;
}

export interface WebsiteSummary {
  /** The store is live: its site serves visitors. */
  readonly live: boolean;
  /** The primary hostname; a store may not have one yet. */
  readonly hostname: string | null;
  readonly currency: string;
  readonly locale: string;
  readonly timezone: string;
  readonly settingsHref: string;
}

export interface PlanSummary {
  readonly name: string;
  readonly status?: { readonly label: string; readonly tone: "info" | "warning" | "neutral" };
  /** e.g. "Trial ends 8 Oct 2026". */
  readonly note?: string;
  readonly usage: readonly {
    readonly key: string;
    readonly label: string;
    readonly used: number;
    readonly limit: number | "unlimited";
    /** Measured in bytes (media storage). */
    readonly bytes?: boolean;
  }[];
  readonly href: string;
}

export interface TeamSummary {
  readonly organisationName: string;
  /** Active members, oldest first (names only). */
  readonly people: readonly { readonly name: string }[];
  /** "1 owner · 1 designer". */
  readonly roles: string;
  readonly href: string;
  readonly inviteHref: string | null;
}

export interface CatalogueSummary {
  readonly products: {
    readonly total: number;
    readonly active: number;
    readonly draft: number;
    readonly archived: number;
  };
  readonly lowStockVariants: number;
  readonly outOfStockVariants: number;
  readonly lowStockThreshold: number;
  readonly recentlyUpdated: readonly {
    readonly title: string;
    readonly status: "DRAFT" | "ACTIVE" | "ARCHIVED";
    readonly href: string;
    readonly when: string;
  }[];
  readonly lowStock: readonly {
    readonly label: string;
    readonly available: number;
    readonly href: string;
  }[];
  readonly productsHref: string;
  readonly newProductHref: string | null;
  readonly inventoryHref: string;
}

export interface ContentSummary {
  /** Pages edited most recently, newest first. */
  readonly recentlyUpdated: readonly {
    readonly title: string;
    readonly status: "published" | "draft" | "changes";
    readonly href: string;
    readonly when: string;
  }[];
  readonly pagesHref: string;
}

/** Real order figures for the period (Revenue, Orders, Sales, Top products). */
export interface SalesSummary {
  readonly figures: SalesFigures;
  /** The orders list. */
  readonly ordersHref: string;
}

/** Real new-customer figures for the period (Customers). */
export interface CustomersSummary {
  readonly figures: CustomerFigures;
  /** The customers list. */
  readonly customersHref: string;
}

/** Real data for the live widgets. Null where the member may not read it. */
export interface LiveData {
  readonly setup: readonly SetupTask[];
  readonly website: WebsiteSummary;
  readonly plan: PlanSummary | null;
  readonly team: TeamSummary | null;
  readonly activity: readonly ActivityItem[] | null;
  /** Real catalogue numbers. */
  readonly catalogue: CatalogueSummary | null;
  /** Order figures (order.read), not loaded in a preview, which shows example data instead. */
  readonly sales: SalesSummary | null;
  /** New customers (customer.read), likewise. */
  readonly customers: CustomersSummary | null;
  /** The site's pages, for members who may edit them. */
  readonly content: ContentSummary | null;
  readonly focus: readonly (FocusArea & { readonly href: string })[];
}
