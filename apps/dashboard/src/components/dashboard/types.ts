import type { BusinessType } from "@storevia/tenancy/business-types";
import type { ActivityItem } from "@/lib/dashboard/activity";
import type { FocusArea } from "@/lib/dashboard/compose";
import type { ExampleFormat } from "@/lib/dashboard/example-data";
import type { DashboardPeriod } from "@/lib/dashboard/preview";
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

/** Real data for the live widgets. Null where the member may not read it. */
export interface LiveData {
  readonly setup: readonly SetupTask[];
  readonly website: WebsiteSummary;
  readonly plan: PlanSummary | null;
  readonly team: TeamSummary | null;
  readonly activity: readonly ActivityItem[] | null;
  /** Real catalogue numbers (never revenue, orders or customers: those don't exist yet). */
  readonly catalogue: CatalogueSummary | null;
  readonly focus: readonly (FocusArea & { readonly href: string })[];
}
