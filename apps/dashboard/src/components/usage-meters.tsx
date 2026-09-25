import type { UsageLine } from "@storevia/entitlements";
import { cn } from "@storevia/ui/cn";
import { UsageMeter } from "@storevia/ui/data";

/**
 * Plan usage as meters: real counts only, never estimated. Each meter spells
 * out "At limit" or "Over limit" in words, not colour alone.
 */
export function UsageMeters({
  usage,
  className,
}: {
  usage: readonly UsageLine[];
  className?: string;
}) {
  return (
    <div className={cn("grid gap-x-10 gap-y-6 sm:grid-cols-2", className)}>
      {usage.map((line) => (
        <UsageMeter
          key={line.key}
          data-testid={`usage-${line.key}`}
          label={line.name}
          used={Number(line.usage)}
          limit={line.limit === "unlimited" ? "unlimited" : Number(line.limit)}
        />
      ))}
    </div>
  );
}
