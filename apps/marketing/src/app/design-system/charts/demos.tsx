"use client";
// Interactive chart specimens: the period filter re-scopes the chart, the
// headline and the table twin together. Every figure is example data.
import { ChartCard, ChartHeadline, LineChart, type ChartStatus } from "@storevia/ui/charts";
import { DateRangePicker } from "@storevia/ui/date-range-picker";
import { useState } from "react";
import {
  exampleRevenue,
  examplePercentChange,
  exampleTotal,
  PERIOD_DAYS,
  type ExamplePeriod,
} from "./example-data";

const USD: Intl.NumberFormatOptions = {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
};
const usd = new Intl.NumberFormat("en-US", USD);

const PRESETS = ["7d", "30d", "90d"] as const;

function isPeriod(value: string): value is ExamplePeriod {
  return value in PERIOD_DAYS;
}

/**
 * The period is a filter, so it sits in a row above what it scopes (the
 * card's headline, chart and table all follow it), not inside the card. It
 * is the dashboard's one period control, DateRangePicker, without "Custom"
 * here because the example series only cover these presets.
 */
export function RevenueCard({
  status = "example",
  defaultPeriod = "30d",
  defaultView,
}: {
  status?: ChartStatus;
  defaultPeriod?: ExamplePeriod;
  defaultView?: "chart" | "table";
}) {
  const [period, setPeriod] = useState<ExamplePeriod>(defaultPeriod);
  const series = exampleRevenue(period);
  const current = exampleTotal(series[0]);
  const previous = exampleTotal(series[1]);
  const days = PERIOD_DAYS[period];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <DateRangePicker
          size="sm"
          aria-label="Period"
          presets={PRESETS}
          allowCustom={false}
          value={{ preset: period }}
          onValueChange={(next) => {
            if (isPeriod(next.preset)) setPeriod(next.preset);
          }}
        />
        <span className="text-caption text-ink-faint">Scopes everything below</span>
      </div>
      <ChartCard
        title="Revenue"
        description={`Last ${String(days)} days compared with the ${String(days)} days before`}
        status={status}
        defaultView={defaultView}
        metric={
          <ChartHeadline
            value={usd.format(current)}
            delta={examplePercentChange(current, previous)}
            comparison="vs previous period"
          />
        }
        footer="Generated for this page"
      >
        <LineChart
          label={`Revenue, last ${String(days)} days`}
          series={series}
          valueFormat={USD}
          height={260}
        />
      </ChartCard>
    </div>
  );
}
