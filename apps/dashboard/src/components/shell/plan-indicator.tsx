import { cn } from "@storevia/ui/cn";
import { formatBytes } from "@storevia/entitlements/format";
import { UsageMeter } from "@storevia/ui/data";
import { Icon } from "@storevia/ui/icons";
import { Badge } from "@storevia/ui/surfaces";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ShellPlan } from "./types";

/**
 * The organisation's plan and the usage line closest to its limit, linking
 * to Billing. Shown only to members who may read billing (lib/shell.ts).
 * The whole card is the link's hit area; the link is named by the plan and
 * the meter keeps its own accessible value. It reads like the Billing page's
 * meters: amber from 80%, with "At limit" or "Over limit" in words and an icon.
 */
export function PlanIndicator({ plan, className }: { plan: ShellPlan; className?: string }) {
  return (
    <div
      className={cn(
        "group relative rounded-card border border-line bg-surface px-3 py-2.5",
        "transition-colors duration-(--duration-fast) hover:border-line-strong hover:bg-subtle",
        "has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus",
        className,
      )}
    >
      <div className="flex min-h-5 items-center gap-2">
        <Link
          href={plan.href}
          className="min-w-0 flex-1 truncate text-body-sm font-semibold text-ink outline-none after:absolute after:inset-0 after:rounded-card"
        >
          {plan.name}
        </Link>
        {plan.status ? (
          <Badge tone={plan.status.tone} size="sm">
            {plan.status.label}
          </Badge>
        ) : (
          <Icon
            icon={ChevronRight}
            size="xs"
            className="text-ink-faint transition-colors group-hover:text-ink-muted"
          />
        )}
      </div>
      {plan.meter ? (
        <UsageMeter
          label={plan.meter.label}
          used={plan.meter.used}
          limit={plan.meter.limit}
          {...(plan.meter.bytes
            ? { format: (value: number) => formatBytes(BigInt(Math.round(value))) }
            : {})}
          size="sm"
          className="mt-2"
        />
      ) : null}
    </div>
  );
}
