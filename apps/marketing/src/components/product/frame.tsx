// Frames for product mockups: a browser or app window, a tablet and a phone,
// plus the wrapper that turns a composition into one labelled image and the
// caption that says it's illustrative. Server components.
import { cn } from "@storevia/ui/cn";
import { Icon } from "@storevia/ui/icons";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Makes a product mockup one decorative image: assistive technology hears
 * `label` once, and nothing inside can take focus or a click (it is inert),
 * even though it is built from real, interactive components.
 */
export function Mockup({
  label,
  className,
  children,
}: {
  label: string;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div role="img" aria-label={label} className={className}>
      <div inert className="contents">
        {children}
      </div>
    </div>
  );
}

/**
 * The visible note under (or on) a mockup: its figures and names are
 * examples, not customers or results. Pair it with every composition that
 * shows numbers.
 */
export function IllustrativeNote({
  children = "Illustrative preview with example data",
  className,
}: {
  children?: ReactNode;
  className?: string | undefined;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-caption text-ink-faint",
        "before:size-1.5 before:shrink-0 before:rounded-full before:border before:border-neutral-400",
        className,
      )}
    >
      {children}
    </p>
  );
}

export interface WindowFrameProps {
  /** An address in the bar (a browser); omit for an app window. */
  address?: string;
  /** Extra content in the title bar, right-aligned (e.g. an editor's actions). */
  toolbar?: ReactNode;
  className?: string | undefined;
  bodyClassName?: string | undefined;
  children: ReactNode;
}

/** A quiet window: hairline edge, the window shadow and a light title bar. */
export function WindowFrame({
  address,
  toolbar,
  className,
  bodyClassName,
  children,
}: WindowFrameProps) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-panel border border-line bg-surface text-left shadow-window",
        className,
      )}
    >
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-surface-sunken px-3.5">
        <span className="flex w-12 shrink-0 gap-1.5">
          {[0, 1, 2].map((dot) => (
            <span key={dot} className="size-2.5 rounded-full bg-neutral-200" />
          ))}
        </span>
        {address ? (
          <span className="mx-auto flex h-6 min-w-0 items-center gap-1.5 rounded-sm border border-line bg-surface px-3 text-[11px] text-ink-faint">
            <Icon icon={Lock} size="xs" className="size-3" />
            <span className="truncate">{address}</span>
          </span>
        ) : (
          <span className="flex-1" />
        )}
        {toolbar ?? <span className="w-12 shrink-0" />}
      </div>
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </div>
  );
}

/**
 * A phone: a thin white bezel, a status bar and a screen for an app layout.
 * Sized by its width; the screen keeps a 9 : 19.5 shape.
 */
export function PhoneFrame({
  className,
  screenClassName,
  children,
}: {
  className?: string | undefined;
  screenClassName?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[2.5rem] border border-line-strong bg-surface p-[7px] text-left shadow-window",
        className,
      )}
    >
      <div
        className={cn(
          "relative flex aspect-[9/19.5] flex-col overflow-hidden rounded-[2.05rem] border border-line bg-canvas",
          screenClassName,
        )}
      >
        <div className="flex h-8 shrink-0 items-center justify-between px-6 pt-1 text-[11px] font-semibold text-ink tabular-nums">
          <span>9:41</span>
          <span className="absolute top-2 left-1/2 h-[18px] w-[72px] -translate-x-1/2 rounded-pill bg-navy-950" />
          <span className="flex items-center gap-1">
            <span className="flex h-2.5 items-end gap-px">
              {[4, 6, 8, 10].map((h) => (
                <span key={h} className="w-[2.5px] rounded-[1px] bg-ink" style={{ height: h }} />
              ))}
            </span>
            <span className="ml-1 h-2.5 w-5 rounded-[3px] border border-ink/70 p-px">
              <span className="block h-full w-3/4 rounded-[1.5px] bg-ink" />
            </span>
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}

/** A tablet in landscape: the same bezel language, a 4 : 3 screen. */
export function TabletFrame({
  className,
  children,
}: {
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.75rem] border border-line-strong bg-surface p-[9px] text-left shadow-window",
        className,
      )}
    >
      <div className="relative flex aspect-[4/3] flex-col overflow-hidden rounded-[1.2rem] border border-line bg-canvas">
        {children}
      </div>
    </div>
  );
}
