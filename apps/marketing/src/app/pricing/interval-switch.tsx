"use client";

import { SegmentedControl } from "@storevia/ui";
import { useState, type ReactNode } from "react";
import type { Interval } from "@/lib/pricing";

/**
 * Monthly or yearly prices for the plan cards inside it. The cards are
 * server-rendered with both prices; this only flips `data-interval` on their
 * wrapper, and CSS shows the matching one (monthly until JavaScript runs).
 */
export function IntervalSwitch({
  bestSaving,
  children,
}: {
  /** The best yearly saving in percent, from the catalogue; null when there's none. */
  bestSaving: number | null;
  children: ReactNode;
}) {
  const [interval, setPeriod] = useState<Interval>("month");
  // Announced only after a change; the initial monthly view needs no message.
  const [changed, setChanged] = useState(false);
  return (
    <div data-interval={interval} className="group/pricing">
      <div className="mb-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <SegmentedControl
          aria-label="Show prices"
          value={interval}
          onValueChange={(value) => {
            setPeriod(value === "year" ? "year" : "month");
            setChanged(true);
          }}
          options={[
            { value: "month", label: "Monthly" },
            { value: "year", label: "Yearly" },
          ]}
          className="min-w-56"
        />
        {bestSaving ? (
          <p className="text-caption text-ink-muted">
            Yearly prices save up to {bestSaving}% compared with monthly.
          </p>
        ) : null}
      </div>
      <p aria-live="polite" className="sr-only">
        {changed ? `Showing ${interval === "year" ? "yearly" : "monthly"} prices.` : ""}
      </p>
      {children}
    </div>
  );
}
