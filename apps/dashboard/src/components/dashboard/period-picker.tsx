"use client";

import { DateRangePicker } from "@storevia/ui/date-range-picker";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DASHBOARD_PERIODS, type DashboardPeriod } from "@/lib/dashboard/preview";

const isPeriod = (value: string): value is DashboardPeriod =>
  (DASHBOARD_PERIODS as readonly string[]).includes(value);

/**
 * The home's one period filter (7, 30 or 90 days). The period lives in the
 * URL (?range=), so the server renders every widget for it and the view is
 * shareable; the control moves at once while the page catches up.
 */
export function PeriodPicker({
  value,
  hrefs,
}: {
  value: DashboardPeriod;
  /** The page's URL for each period, built by the server. */
  hrefs: Readonly<Record<DashboardPeriod, string>>;
}) {
  const router = useRouter();
  const [period, setPeriod] = useState(value);
  const [, startTransition] = useTransition();
  return (
    // The default size: segments stay 44 px wide and tall on touch screens.
    <DateRangePicker
      aria-label="Period"
      presets={DASHBOARD_PERIODS}
      allowCustom={false}
      value={{ preset: period }}
      onValueChange={(next) => {
        if (!isPeriod(next.preset)) return;
        const preset = next.preset;
        setPeriod(preset);
        startTransition(() => {
          router.replace(hrefs[preset], { scroll: false });
        });
      }}
    />
  );
}
