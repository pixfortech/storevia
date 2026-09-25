"use client";

import { Button, IconButton } from "@storevia/ui/button";
import { cn } from "@storevia/ui/cn";
import { Icon } from "@storevia/ui/icons";
import { ArrowLeftRight, ImageOff, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { AdjustStockDialog } from "./adjust-stock-dialog";
import { MoveStockDialog } from "./move-stock-dialog";

// Stock by variant and location. Each row can be adjusted (add, remove or
// set a count) or moved between locations; every change lands in the
// history with its reason.

export interface InventoryTableRow {
  readonly key: string;
  readonly productHref: string;
  readonly productTitle: string;
  readonly variantId: string;
  readonly variantTitle: string;
  readonly sku: string | null;
  readonly tracked: boolean;
  readonly oversell: boolean;
  readonly levels: Readonly<Record<string, number>>;
  readonly available: number;
  readonly image: { readonly src: string; readonly alt: string } | null;
  readonly low: boolean;
  readonly out: boolean;
}

export function InventoryTable({
  storeId,
  rows,
  locations,
  canAdjust,
}: {
  storeId: string;
  rows: readonly InventoryTableRow[];
  locations: readonly { readonly id: string; readonly name: string }[];
  canAdjust: boolean;
}) {
  // Up to four locations get their own column (two from laptop width, three
  // or four from desktop); beyond that, the total and the dialog show the split.
  const columns = locations.length <= 4 ? locations : [];
  const locationCell = locations.length <= 2 ? "hidden lg:table-cell" : "hidden xl:table-cell";
  const name = (row: InventoryTableRow) =>
    row.variantTitle === "Default" ? row.productTitle : `${row.productTitle} · ${row.variantTitle}`;
  const actions = (row: InventoryTableRow) =>
    canAdjust && row.tracked ? (
      <span className="flex justify-end gap-1">
        <AdjustStockDialog
          storeId={storeId}
          variantId={row.variantId}
          title={name(row)}
          locations={locations.map((l) => ({
            id: l.id,
            name: l.name,
            available: row.levels[l.id] ?? 0,
          }))}
          trigger={
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={SlidersHorizontal}
              aria-label={`Update stock for ${name(row)}`}
            >
              Update
            </Button>
          }
        />
        {locations.length > 1 ? (
          <MoveStockDialog
            storeId={storeId}
            variantId={row.variantId}
            title={name(row)}
            locations={locations.map((l) => ({
              id: l.id,
              name: l.name,
              available: row.levels[l.id] ?? 0,
            }))}
            trigger={
              <IconButton
                size="sm"
                icon={ArrowLeftRight}
                aria-label={`Move stock for ${name(row)}`}
              />
            }
          />
        ) : null}
      </span>
    ) : null;
  const status = (row: InventoryTableRow) =>
    !row.tracked ? (
      <span className="whitespace-nowrap text-ink-faint">Not tracked</span>
    ) : (
      <span
        className={cn(
          "font-medium whitespace-nowrap tabular-nums",
          row.out ? "text-danger-700" : row.low ? "text-warning-700" : "text-ink",
        )}
      >
        {row.available.toLocaleString("en-IN")}
        {row.out ? (
          <span className="block text-caption font-normal">Out of stock</span>
        ) : row.low ? (
          <span className="block text-caption font-normal">Low</span>
        ) : null}
      </span>
    );
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">Stock by variant and location</caption>
          <thead>
            <tr className="text-caption font-medium text-ink-faint shadow-[inset_0_-1px_0_var(--color-line)]">
              <th scope="col" className="h-10 pl-6 font-medium">
                Product
              </th>
              <th scope="col" className="hidden h-10 w-44 px-3 font-medium xl:table-cell">
                SKU
              </th>
              {columns.map((l) => (
                <th
                  key={l.id}
                  scope="col"
                  className={cn("h-10 w-28 px-3 text-right font-medium", locationCell)}
                >
                  <span className="line-clamp-2">{l.name}</span>
                </th>
              ))}
              <th scope="col" className="h-10 w-28 px-3 text-right font-medium">
                Available
              </th>
              {canAdjust ? (
                <th
                  scope="col"
                  className={cn(
                    "h-10 pr-6 text-right font-medium",
                    locations.length > 1 ? "w-40" : "w-32",
                  )}
                >
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.key} data-testid="inventory-row" className="hover:bg-subtle">
                <td className="py-2.5 pl-6">
                  <Link
                    href={row.productHref}
                    className="flex min-w-0 items-center gap-3 pr-3 hover:text-brand-700"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-subtle">
                      {row.image ? (
                        <img
                          src={row.image.src}
                          alt=""
                          width={36}
                          height={36}
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <Icon icon={ImageOff} size="xs" className="text-ink-faint" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-body-sm font-medium text-ink">
                        {row.productTitle}
                      </span>
                      {row.variantTitle !== "Default" ? (
                        <span className="block truncate text-caption text-ink-muted">
                          {row.variantTitle}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </td>
                <td className="hidden truncate px-3 py-2.5 text-body-sm text-ink-muted xl:table-cell">
                  {row.sku ?? "—"}
                </td>
                {columns.map((l) => (
                  <td
                    key={l.id}
                    className={cn(
                      "px-3 py-2.5 text-right text-body-sm text-ink-muted tabular-nums",
                      locationCell,
                    )}
                  >
                    {row.tracked ? (row.levels[l.id] ?? 0).toLocaleString("en-IN") : "—"}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right text-body-sm">{status(row)}</td>
                {canAdjust ? <td className="py-2.5 pr-6">{actions(row)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((row) => (
          <li key={row.key} className="space-y-2 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <Link href={row.productHref} className="min-w-0">
                <span className="block truncate text-body-sm font-medium text-ink">
                  {row.productTitle}
                </span>
                <span className="block truncate text-caption text-ink-muted">
                  {[row.variantTitle !== "Default" ? row.variantTitle : null, row.sku]
                    .filter(Boolean)
                    .join(" · ") || " "}
                </span>
              </Link>
              <span className="shrink-0 text-body-sm">{status(row)}</span>
            </div>
            {actions(row)}
          </li>
        ))}
      </ul>
    </>
  );
}
