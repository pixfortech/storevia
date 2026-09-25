"use client";

import { Button } from "@storevia/ui/button";
import { Field, SearchInput, Select } from "@storevia/ui/form";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";
import { SlidersHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

// Search, filters and sort for the product list. Every choice lives in the
// URL (shareable, back-button friendly); the server re-validates each value,
// so a hand-edited URL can only ever narrow the store's own products.

export interface FilterOptions {
  readonly vendors: readonly string[];
  readonly productTypes: readonly string[];
  readonly collections: readonly { readonly id: string; readonly title: string }[];
}

const SORTS = [
  { value: "updated", label: "Recently updated" },
  { value: "created", label: "Newest" },
  { value: "title_asc", label: "Title A–Z" },
  { value: "title_desc", label: "Title Z–A" },
];

const STOCK = [
  { value: "", label: "Any stock" },
  { value: "in_stock", label: "In stock" },
  { value: "low_stock", label: "Low stock" },
  { value: "out_of_stock", label: "Out of stock" },
  { value: "untracked", label: "Not tracked" },
];

type FilterKey = "stock" | "vendor" | "productType" | "collection" | "sort";
const EVERY_FILTER: readonly FilterKey[] = ["stock", "vendor", "productType", "collection", "sort"];
/** Filters that live behind "More filters" at desktop width. */
const MORE_FILTERS: readonly FilterKey[] = ["vendor", "productType", "collection"];
const CLEARED = { stock: "", vendor: "", productType: "", collection: "" };

function FilterFields({
  values,
  options,
  onChange,
  keys = EVERY_FILTER,
}: {
  values: Record<string, string>;
  options: FilterOptions;
  onChange: (name: string, value: string) => void;
  keys?: readonly FilterKey[];
}) {
  const select = (
    name: string,
    label: string,
    items: readonly { value: string; label: string }[],
  ) => (
    <Field label={label} className="min-w-0 xl:w-44">
      <Select
        size="md"
        value={values[name] ?? ""}
        onChange={(event) => {
          onChange(name, event.currentTarget.value);
        }}
      >
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>
    </Field>
  );
  const shows = (key: FilterKey) => keys.includes(key);
  return (
    <>
      {shows("stock") ? select("stock", "Stock", STOCK) : null}
      {shows("vendor") && options.vendors.length > 0
        ? select("vendor", "Vendor", [
            { value: "", label: "Any vendor" },
            ...options.vendors.map((v) => ({ value: v, label: v })),
          ])
        : null}
      {shows("productType") && options.productTypes.length > 0
        ? select("productType", "Type", [
            { value: "", label: "Any type" },
            ...options.productTypes.map((v) => ({ value: v, label: v })),
          ])
        : null}
      {shows("collection") && options.collections.length > 0
        ? select("collection", "Collection", [
            { value: "", label: "Any collection" },
            ...options.collections.map((c) => ({ value: c.id, label: c.title })),
          ])
        : null}
      {shows("sort") ? select("sort", "Sort by", SORTS) : null}
    </>
  );
}

export function ProductFilters({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const values: Record<string, string> = {
    stock: params.get("stock") ?? "",
    vendor: params.get("vendor") ?? "",
    productType: params.get("productType") ?? "",
    collection: params.get("collection") ?? "",
    sort: params.get("sort") ?? "updated",
  };
  const active = ["stock", "vendor", "productType", "collection"].filter((k) => values[k]).length;
  const moreActive = MORE_FILTERS.filter((k) => values[k]).length;
  const hasMore =
    options.vendors.length + options.productTypes.length + options.collections.length > 0;

  const navigate = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value && !(key === "sort" && value === "updated")) next.set(key, value);
      else next.delete(key);
    }
    next.delete("cursor"); // a new filter starts from the first page
    const search = next.toString();
    startTransition(() => {
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    });
  };

  // Search as you type, once the typing pauses.
  const latest = useRef(query);
  useEffect(() => {
    latest.current = query;
    if (query === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => {
      if (latest.current === query) navigate({ q: query.trim() });
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  // A render helper, not a component: a component defined here would remount
  // (and close) on every navigation.
  const filterDialog = ({
    label,
    title,
    keys,
  }: {
    label: string;
    title: string;
    keys: readonly FilterKey[];
  }) => (
    <Dialog
      side="bottom"
      title={title}
      trigger={
        <Button variant="secondary" leadingIcon={SlidersHorizontal}>
          {label}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FilterFields
          values={values}
          options={options}
          keys={keys}
          onChange={(name, value) => {
            navigate({ [name]: value });
          }}
        />
      </div>
      <DialogFooter>
        {active > 0 ? (
          <Button
            variant="ghost"
            onClick={() => {
              navigate(CLEARED);
            }}
          >
            Clear filters
          </Button>
        ) : null}
        <DialogClose asChild>
          <Button>Done</Button>
        </DialogClose>
      </DialogFooter>
    </Dialog>
  );

  return (
    <div
      className="flex flex-col gap-3 border-b border-line px-4 py-3.5 sm:flex-row sm:items-center sm:px-6 xl:items-end"
      aria-busy={pending || undefined}
    >
      <form
        role="search"
        className="min-w-0 flex-1"
        onSubmit={(event) => {
          event.preventDefault();
          navigate({ q: query.trim() });
        }}
      >
        <SearchInput
          aria-label="Search products"
          placeholder="Search by title, SKU, barcode, vendor or tag"
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
          }}
          onClear={() => {
            setQuery("");
            navigate({ q: "" });
          }}
        />
      </form>
      {/* Desktop: search, stock and sort inline; the rest behind "More filters". */}
      <div className="hidden items-end gap-3 xl:flex">
        <FilterFields
          values={values}
          options={options}
          keys={["stock", "sort"]}
          onChange={(name, value) => {
            navigate({ [name]: value });
          }}
        />
        {hasMore
          ? filterDialog({
              label: `More filters${moreActive > 0 ? ` (${String(moreActive)})` : ""}`,
              title: "More filters",
              keys: MORE_FILTERS,
            })
          : null}
      </div>
      {/* Phones, tablets and laptops: every filter in one sheet. */}
      <div className="flex items-center gap-2 xl:hidden">
        {filterDialog({
          label: `Filters${active > 0 ? ` (${String(active)})` : ""}`,
          title: "Filter and sort",
          keys: EVERY_FILTER,
        })}
        {active > 0 ? (
          <Button
            variant="ghost"
            onClick={() => {
              navigate(CLEARED);
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
