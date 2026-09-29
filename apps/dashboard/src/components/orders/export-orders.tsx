import { Button } from "@storevia/ui/button";
import { Field, Input } from "@storevia/ui/form";
import { Download } from "lucide-react";

/**
 * Downloads the orders in the current view (status tab and search) as CSV,
 * optionally between two dates in the store's timezone. A plain GET form, so
 * it works before hydration; the export route streams the file.
 */
export function ExportOrders({
  action,
  status,
  q,
  from,
  to,
  timezone,
}: {
  /** The export route for this store. */
  action: string;
  status: string;
  q: string;
  from: string;
  to: string;
  timezone: string;
}) {
  const view = [status !== "all" ? "this tab" : null, q ? "this search" : null]
    .filter(Boolean)
    .join(" and ");
  return (
    <form
      method="get"
      action={action}
      aria-label="Export orders"
      className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3.5 sm:px-6"
    >
      {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
      {q ? <input type="hidden" name="q" value={q} /> : null}
      <Field label="From" className="w-40">
        <Input type="date" name="from" defaultValue={from} />
      </Field>
      <Field label="To" className="w-40">
        <Input type="date" name="to" defaultValue={to} />
      </Field>
      <Button type="submit" variant="secondary" leadingIcon={Download}>
        Export CSV
      </Button>
      <p className="basis-full text-caption text-ink-muted">
        Exports {view ? `the orders in ${view}` : "your orders"}
        {status === "all" && !q ? " (archived orders have their own tab)" : ""}. Dates are in your
        store&apos;s time zone ({timezone}); leave them empty for every date.
      </p>
    </form>
  );
}
