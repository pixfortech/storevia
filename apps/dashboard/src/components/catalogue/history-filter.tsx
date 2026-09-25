"use client";

import { Select } from "@storevia/ui/form";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function HistoryLocationFilter({
  locations,
}: {
  locations: readonly { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (locations.length < 2 && !params.get("product")) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
      {locations.length >= 2 ? (
        <Select
          size="sm"
          aria-label="Location"
          value={params.get("location") ?? ""}
          onChange={(event) => {
            const next = new URLSearchParams(params.toString());
            const value = event.currentTarget.value;
            if (value) next.set("location", value);
            else next.delete("location");
            next.delete("before");
            router.replace(`${pathname}?${next.toString()}`, { scroll: false });
          }}
          className="w-52"
        >
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      ) : null}
      {params.get("product") ? (
        <button
          type="button"
          className="text-body-sm font-medium text-brand-700 hover:underline"
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            next.delete("product");
            next.delete("before");
            router.replace(`${pathname}?${next.toString()}`, { scroll: false });
          }}
        >
          Showing one product · show all
        </button>
      ) : null}
    </div>
  );
}
