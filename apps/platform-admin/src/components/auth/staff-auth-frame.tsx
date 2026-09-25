import { Badge, Icon, Logo } from "@storevia/ui";
import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

const STAGE_LABELS = {
  development: "Development",
  test: "Test",
  preview: "Preview",
  staging: "Staging",
  production: "Production",
} as const;

/**
 * The staff sign-in frame: the internal tool is labelled, not darkened.
 * An admin-tagged logo, the environment outside production, and one card
 * that says who it is for. No merchant marketing. The card sits at a fixed
 * offset from the top, so an error above the fields never moves it.
 */
export function StaffAuthFrame({
  stage,
  children,
}: {
  stage: keyof typeof STAGE_LABELS;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-subtle">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-3 sm:px-8">
        <Logo variant="admin" tag="Platform admin" size="sm" />
        {stage === "production" ? null : (
          <Badge tone="warning" dot>
            <span>
              {STAGE_LABELS[stage]}
              <span className="max-sm:sr-only"> environment</span>
            </span>
          </Badge>
        )}
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 flex-col items-center px-4 pt-12 pb-16 outline-none sm:pt-[clamp(4rem,14vh,8rem)]"
      >
        <div className="w-full max-w-[26rem] overflow-hidden rounded-panel border border-line bg-surface shadow-card">
          <div className="p-6 sm:p-8">{children}</div>
          <div className="flex items-start gap-3 border-t border-line bg-subtle px-6 py-4 sm:px-8">
            <Icon icon={ShieldCheck} size="md" className="mt-px text-ink-muted" />
            <p className="text-body-sm text-ink-muted">
              <span className="font-medium text-ink">Storevia staff only.</span> Access is logged.
            </p>
          </div>
        </div>
        <p className="mt-6 max-w-[26rem] text-center text-caption text-ink-faint">
          Running a store on Storevia? Sign in to your merchant dashboard instead.
        </p>
      </main>
    </div>
  );
}
