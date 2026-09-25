import { cn } from "@storevia/ui/cn";
import Link from "next/link";

// Navigation that looks like line tabs but is made of links (each tab is its
// own URL, so it survives reloads and can be shared). aria-current marks the
// page; counts are part of the link text.

export interface LinkTab {
  readonly href: string;
  readonly label: string;
  readonly count?: number | undefined;
  readonly current: boolean;
}

export function LinkTabs({
  tabs,
  label,
  className,
}: {
  tabs: readonly LinkTab[];
  label: string;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("min-w-0", className)}>
      <ul className="flex max-w-full items-stretch gap-5 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => (
          <li key={tab.href} className="flex shrink-0">
            <Link
              href={tab.href}
              aria-current={tab.current ? "page" : undefined}
              className={cn(
                "relative inline-flex h-10 items-center gap-1.5 text-label font-medium whitespace-nowrap transition-colors pointer-coarse:h-11",
                "focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                tab.current
                  ? "text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand-600"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span
                  className={cn(
                    "rounded-pill px-1.5 text-caption tabular-nums",
                    tab.current ? "bg-brand-50 text-brand-700" : "bg-subtle text-ink-faint",
                  )}
                >
                  {tab.count.toLocaleString("en-IN")}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
