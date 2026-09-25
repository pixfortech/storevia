"use client";

import { Button } from "@storevia/ui/button";
import { Checkbox } from "@storevia/ui/choice";
import { cn } from "@storevia/ui/cn";
import { Select } from "@storevia/ui/form";
import { Icon } from "@storevia/ui/icons";
import { Alert, Badge } from "@storevia/ui/surfaces";
import { ImageOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { bulkProductsAction } from "@/app/(app)/s/[storeId]/products/actions";
import { PRODUCT_STATUS, type ProductStatus } from "@/lib/catalogue";

// The product list with selection and bulk actions. Every row is a link to
// its editor; selection is for bulk actions only. The same data renders as a
// table from tablet width and as cards on phones. Bulk actions run on the
// server per product and report which ones failed, and why.

export interface ProductListRow {
  readonly id: string;
  readonly href: string;
  readonly title: string;
  readonly handle: string;
  readonly status: ProductStatus;
  readonly vendor: string | null;
  readonly price: string;
  readonly stock: { readonly text: string; readonly tone: "warning" | "danger" | null };
  readonly variants: number;
  readonly updated: string;
  readonly image: { readonly src: string; readonly srcSet: string; readonly alt: string } | null;
}

export interface BulkOption {
  readonly value: string;
  readonly label: string;
}

function Thumbnail({ image, title }: { image: ProductListRow["image"]; title: string }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-subtle">
      {image ? (
        <img
          src={image.src}
          srcSet={image.srcSet}
          sizes="44px"
          alt={image.alt || title}
          width={44}
          height={44}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <Icon icon={ImageOff} size="sm" className="text-ink-faint" label="No image" />
      )}
    </span>
  );
}

function StockText({ stock }: { stock: ProductListRow["stock"] }) {
  return (
    <span
      className={cn(
        "text-body-sm",
        stock.tone === "danger"
          ? "font-medium text-danger-700"
          : stock.tone === "warning"
            ? "text-warning-700"
            : "text-ink-muted",
      )}
    >
      {stock.text}
    </span>
  );
}

export function ProductList({
  storeId,
  rows,
  bulkOptions,
  collections,
}: {
  storeId: string;
  rows: readonly ProductListRow[];
  /** Bulk actions this member may run (filtered by permission on the server). */
  bulkOptions: readonly BulkOption[];
  collections: readonly { readonly id: string; readonly title: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [action, setAction] = useState("");
  const [collection, setCollection] = useState("");
  const [tags, setTags] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    tone: "success" | "warning" | "danger";
    text: string;
    failures: string[];
  } | null>(null);
  const selectable = bulkOptions.length > 0;
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = rows.some((r) => selected.has(r.id));
  const titles = new Map(rows.map((r) => [r.id, r.title]));

  const toggle = (id: string, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const run = () => {
    if (!action || selected.size === 0) return;
    const productIds = [...selected];
    const input =
      action === "addToCollection"
        ? { action, productIds, collectionId: collection }
        : action === "addTags" || action === "removeTags"
          ? { action, productIds, tags }
          : { action, productIds };
    startTransition(async () => {
      const response = await bulkProductsAction(storeId, input);
      if (!response.ok) {
        setResult({ tone: "danger", text: response.message ?? "That didn't work.", failures: [] });
        return;
      }
      const { succeeded, failed } = response.data;
      setResult({
        tone: failed.length === 0 ? "success" : succeeded.length === 0 ? "danger" : "warning",
        text:
          failed.length === 0
            ? `Done for ${String(succeeded.length)} ${succeeded.length === 1 ? "product" : "products"}.`
            : `Done for ${String(succeeded.length)}; ${String(failed.length)} couldn't be changed.`,
        failures: failed.map((f) => `${titles.get(f.id) ?? "A product"}: ${f.message}`),
      });
      setSelected(new Set(failed.map((f) => f.id)));
      router.refresh();
    });
  };

  const needsCollection = action === "addToCollection";
  const needsTags = action === "addTags" || action === "removeTags";
  const ready =
    action !== "" && (!needsCollection || collection !== "") && (!needsTags || tags.trim() !== "");

  return (
    <>
      {result ? (
        <div className="border-b border-line px-4 py-3 sm:px-6" role="status" aria-live="polite">
          <Alert
            tone={result.tone}
            onDismiss={() => {
              setResult(null);
            }}
          >
            {result.text}
            {result.failures.length > 0 ? (
              <ul className="mt-1 list-disc pl-5">
                {result.failures.slice(0, 10).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            ) : null}
          </Alert>
        </div>
      ) : null}

      {selectable && selected.size > 0 ? (
        <div
          className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-(--z-raised) flex flex-wrap items-center gap-2 border-b border-line bg-brand-25 px-4 py-2.5 shadow-sm sm:px-6 md:static md:shadow-none"
          role="region"
          aria-label="Bulk actions"
        >
          <span className="text-body-sm font-medium text-ink">{selected.size} selected</span>
          <Select
            size="sm"
            aria-label="Bulk action"
            value={action}
            onChange={(event) => {
              setAction(event.currentTarget.value);
            }}
            className="w-44"
          >
            <option value="">Choose an action</option>
            {bulkOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          {needsCollection ? (
            <Select
              size="sm"
              aria-label="Collection"
              value={collection}
              onChange={(event) => {
                setCollection(event.currentTarget.value);
              }}
              className="w-44"
            >
              <option value="">Choose a collection</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </Select>
          ) : null}
          {needsTags ? (
            <input
              aria-label="Tags, separated by commas"
              placeholder="summer, sale"
              value={tags}
              onChange={(event) => {
                setTags(event.currentTarget.value);
              }}
              className="h-8 w-44 rounded-control border border-line-control bg-surface px-2.5 text-body-sm outline-none focus:border-brand-500 focus:ring-3 focus:ring-brand-100"
            />
          ) : null}
          <Button size="sm" onClick={run} pending={pending} disabled={!ready}>
            Apply
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelected(new Set());
            }}
          >
            Clear selection
          </Button>
        </div>
      ) : null}

      {/* Tablet and desktop: a table. */}
      <div className="hidden md:block">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">Products</caption>
          <thead>
            <tr className="text-caption font-medium text-ink-faint shadow-[inset_0_-1px_0_var(--color-line)]">
              {selectable ? (
                <th scope="col" className="h-10 w-12 pl-6">
                  <Checkbox
                    aria-label="Select all products on this page"
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(value) => {
                      setSelected(value === true ? new Set(rows.map((r) => r.id)) : new Set());
                    }}
                  />
                </th>
              ) : null}
              <th scope="col" className={cn("h-10 font-medium", selectable ? "pl-2" : "pl-6")}>
                Product
              </th>
              <th scope="col" className="h-10 w-28 font-medium">
                Status
              </th>
              <th scope="col" className="hidden h-10 w-52 font-medium lg:table-cell">
                Stock
              </th>
              <th scope="col" className="h-10 w-36 pr-4 text-right font-medium">
                Price
              </th>
              <th
                scope="col"
                className="hidden h-10 w-32 pr-6 text-right font-medium xl:table-cell"
              >
                Updated
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr
                key={row.id}
                data-testid="product-row"
                className={cn(
                  "group transition-colors hover:bg-subtle",
                  selected.has(row.id) && "bg-brand-25",
                )}
              >
                {selectable ? (
                  <td className="py-3 pl-6 align-middle">
                    <Checkbox
                      aria-label={`Select ${row.title}`}
                      checked={selected.has(row.id)}
                      onCheckedChange={(value) => {
                        toggle(row.id, value === true);
                      }}
                    />
                  </td>
                ) : null}
                <td className={cn("py-3 align-middle", selectable ? "pl-2" : "pl-6")}>
                  <Link
                    href={row.href}
                    className="flex min-w-0 items-center gap-3 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <Thumbnail image={row.image} title={row.title} />
                    <span className="min-w-0">
                      <span className="block truncate text-body-sm font-medium text-ink group-hover:text-brand-700">
                        {row.title}
                      </span>
                      <span className="block truncate text-caption text-ink-faint">
                        {[row.vendor, row.variants > 1 ? `${String(row.variants)} variants` : null]
                          .filter(Boolean)
                          .join(" · ") || `/${row.handle}`}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="py-3 align-middle">
                  <Badge variant="dot" tone={PRODUCT_STATUS[row.status].tone}>
                    {PRODUCT_STATUS[row.status].label}
                  </Badge>
                </td>
                <td className="hidden py-3 align-middle lg:table-cell">
                  <StockText stock={row.stock} />
                </td>
                <td className="py-3 pr-4 text-right align-middle text-body-sm text-ink tabular-nums">
                  {row.price}
                </td>
                <td className="hidden py-3 pr-6 text-right align-middle text-caption text-ink-faint xl:table-cell">
                  {row.updated}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: cards. */}
      <ul className="divide-y divide-line md:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn(
              "flex items-start gap-3 px-4 py-3.5",
              selected.has(row.id) && "bg-brand-25",
            )}
          >
            {selectable ? (
              <span className="flex h-11 items-center">
                <Checkbox
                  aria-label={`Select ${row.title}`}
                  checked={selected.has(row.id)}
                  onCheckedChange={(value) => {
                    toggle(row.id, value === true);
                  }}
                />
              </span>
            ) : null}
            <Link
              href={row.href}
              className="flex min-w-0 flex-1 items-start gap-3 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Thumbnail image={row.image} title={row.title} />
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-body-sm font-medium text-ink">
                    {row.title}
                  </span>
                  <span className="shrink-0 text-body-sm text-ink tabular-nums">{row.price}</span>
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge size="sm" variant="dot" tone={PRODUCT_STATUS[row.status].tone}>
                    {PRODUCT_STATUS[row.status].label}
                  </Badge>
                  <StockText stock={row.stock} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
