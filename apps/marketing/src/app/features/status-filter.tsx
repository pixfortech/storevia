"use client";

import { Select } from "@storevia/ui/form";
import { useId, useState, type ReactNode } from "react";
import { STATUS_LABELS, STATUSES, type Status } from "@/content/capabilities";

type Filter = Status | "all";

function isFilter(value: string): value is Filter {
  return value === "all" || (STATUSES as readonly string[]).includes(value);
}

function FilterSelect({
  filter,
  onChange,
  counts,
  total,
}: {
  filter: Filter;
  onChange: (filter: Filter) => void;
  counts: Readonly<Record<Status, number>>;
  total: number;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-3 lg:flex-col lg:items-stretch lg:gap-2">
      <label htmlFor={id} className="shrink-0 text-label text-ink">
        Show
      </label>
      <Select
        id={id}
        value={filter}
        onChange={(event) => {
          const value = event.target.value;
          if (isFilter(value)) onChange(value);
        }}
        className="w-52 lg:w-full pointer-coarse:h-11"
      >
        <option value="all">Every status ({total})</option>
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABELS[status]} ({counts[status]})
          </option>
        ))}
      </Select>
    </div>
  );
}

/**
 * The feature matrix's layout and status filter: a sticky bar of area links
 * and the filter on phones and tablets, a sticky side column on desktop. The
 * matrix is server-rendered in full; this only sets `data-filter` on its
 * wrapper, and each row and area hides itself with CSS when it doesn't match
 * (HIDE_* in page.tsx). Without JavaScript everything shows.
 */
export function StatusFilter({
  counts,
  navBar,
  navSide,
  children,
}: {
  counts: Readonly<Record<Status, number>>;
  /** Area links in a row (phones and tablets). */
  navBar: ReactNode;
  /** Area links in a column (desktop). */
  navSide: ReactNode;
  children: ReactNode;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const total = STATUSES.reduce((sum, status) => sum + counts[status], 0);
  const select = (
    <FilterSelect filter={filter} onChange={setFilter} counts={counts} total={total} />
  );
  return (
    <div data-filter={filter} className="group/features">
      <div className="sticky top-16 z-(--z-raised) border-y border-line bg-canvas lg:hidden">
        <div className="mx-auto flex w-full max-w-(--container-content) flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
          <div className="min-w-0 flex-1">{navBar}</div>
          {select}
        </div>
      </div>
      <div className="mx-auto grid w-full max-w-(--container-content) px-4 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16">
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-8 pt-12">
            {select}
            {navSide}
          </div>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
      <p aria-live="polite" className="sr-only">
        {filter === "all"
          ? ""
          : `Showing ${String(counts[filter])} features: ${STATUS_LABELS[filter]}.`}
      </p>
    </div>
  );
}
