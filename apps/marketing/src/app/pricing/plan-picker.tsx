"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@storevia/ui/navigation";
import type { CSSProperties, ReactNode } from "react";

/**
 * The phone comparison: pick a plan, see every feature it includes, grouped.
 * The panels are server-rendered; only the active one is mounted. The picker
 * stays under the site header while the list scrolls.
 */
export function PlanPicker({
  plans,
}: {
  plans: readonly { id: string; name: string; panel: ReactNode }[];
}) {
  const first = plans[0];
  if (!first) return null;
  return (
    <Tabs defaultValue={first.id} variant="pill">
      <div className="sticky top-16 z-(--z-raised) -mx-4 bg-canvas/95 px-4 py-3 sm:-mx-6 sm:px-6">
        {/* One row of plans; two rows on the narrowest phones, so no name is cut short. */}
        <TabsList
          aria-label="Choose a plan"
          className="grid w-full grid-cols-[repeat(var(--plans),minmax(0,1fr))] max-[379px]:grid-cols-2"
          style={{ "--plans": String(plans.length) } as CSSProperties}
        >
          {plans.map((plan) => (
            <TabsTrigger key={plan.id} value={plan.id} className="min-w-0 px-1.5 text-label">
              <span className="truncate">{plan.name}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {plans.map((plan) => (
        <TabsContent key={plan.id} value={plan.id} className="mt-4">
          {plan.panel}
        </TabsContent>
      ))}
    </Tabs>
  );
}
