"use client";

import { Button } from "@storevia/ui/button";
import { SearchInput } from "@storevia/ui/form";
import { useRef } from "react";

/**
 * A search box that submits as a plain GET form (works before hydration):
 * the query lands in the URL, paging restarts and any `keep` parameters
 * (e.g. the status tab) are carried along.
 */
export function ListSearch({
  label,
  placeholder,
  defaultValue,
  keep = {},
}: {
  label: string;
  placeholder: string;
  defaultValue: string;
  keep?: Readonly<Record<string, string>>;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      method="get"
      role="search"
      aria-label={label}
      className="flex gap-2 border-b border-line px-4 py-3.5 sm:px-6"
    >
      {Object.entries(keep).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}
      <SearchInput
        name="q"
        aria-label={label}
        placeholder={placeholder}
        defaultValue={defaultValue}
        maxLength={100}
        onClear={() => {
          form.current?.requestSubmit();
        }}
        className="min-w-0 flex-1 sm:max-w-96"
      />
      <Button type="submit" variant="secondary">
        Search
      </Button>
    </form>
  );
}
