"use client";

import { SearchInput } from "@storevia/ui/form";
import { SegmentedControl } from "@storevia/ui/segmented-control";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export function InventoryFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [, startTransition] = useTransition();
  const navigate = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("after");
    const s = next.toString();
    startTransition(() => {
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    });
  };
  useEffect(() => {
    if (query === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => {
      navigate({ q: query.trim() });
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [query]);
  return (
    <div className="flex flex-col gap-3 border-b border-line px-4 py-3.5 sm:flex-row sm:items-center sm:px-6">
      <SearchInput
        aria-label="Search stock"
        placeholder="Search by product, variant or SKU"
        value={query}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
        }}
        onClear={() => {
          setQuery("");
          navigate({ q: "" });
        }}
        className="sm:max-w-96 sm:flex-1"
      />
      <SegmentedControl
        aria-label="Stock level"
        size="sm"
        value={params.get("stock") ?? ""}
        onValueChange={(value) => {
          navigate({ stock: value });
        }}
        options={[
          { value: "", label: "All" },
          { value: "low_stock", label: "Low" },
          { value: "out_of_stock", label: "Out" },
        ]}
      />
    </div>
  );
}
