import type { UsageLine } from "@storevia/entitlements";
import { Meter } from "@storevia/ui";

/** Plan usage as meters. Real counts only; never estimated. */
export function UsageMeters({ usage }: { usage: readonly UsageLine[] }) {
  return (
    <div className="space-y-5">
      {usage.map((line) => (
        <div key={line.key} data-testid={`usage-${line.key}`}>
          <Meter
            label={line.name}
            value={Number(line.usage)}
            max={line.limit === "unlimited" ? null : Number(line.limit)}
            tone={line.overLimit ? "danger" : "default"}
          />
        </div>
      ))}
    </div>
  );
}
