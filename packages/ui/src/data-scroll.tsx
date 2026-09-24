"use client";

// The scroll area behind Table and DataList (data.tsx). Internal: data.tsx
// stays server-safe and renders this client leaf around its <table>.
//
// Only while the table overflows does the area become a named, focusable
// region (so keyboard users can scroll it; WCAG 2.1.1), and only then does it
// show a quiet shadow on each edge that has more content beyond it.
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "./cn";

export interface ScrollState {
  /** Wider or taller than the area. */
  overflow: boolean;
  /** More content to the left / right of what is visible. */
  before: boolean;
  after: boolean;
  /** More content above / below what is visible (a maxHeight table). */
  above: boolean;
  below: boolean;
}

const IDLE: ScrollState = {
  overflow: false,
  before: false,
  after: false,
  above: false,
  below: false,
};

const same = (a: ScrollState, b: ScrollState) =>
  a.overflow === b.overflow &&
  a.before === b.before &&
  a.after === b.after &&
  a.above === b.above &&
  a.below === b.below;

/** Measures a scroll box. Pure, so it is unit-tested without a DOM. */
export function scrollState(box: {
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}): ScrollState {
  const wide = box.scrollWidth - box.clientWidth > 1;
  const tall = box.scrollHeight - box.clientHeight > 1;
  return {
    overflow: wide || tall,
    before: wide && box.scrollLeft > 1,
    after: wide && box.scrollLeft + box.clientWidth < box.scrollWidth - 1,
    above: tall && box.scrollTop > 1,
    below: tall && box.scrollTop + box.clientHeight < box.scrollHeight - 1,
  };
}

// A soft inner shadow on the edge, never a gradient wash over the content.
// (Full class names: Tailwind only generates classes it can read verbatim.)
const EDGE =
  "pointer-events-none absolute z-(--z-raised) opacity-0 transition-opacity duration-(--duration-base) ease-(--ease-standard)";

export function TableScrollArea({
  children,
  className,
  scrollClassName,
  style,
  label,
  stickyHeader = false,
}: {
  children: ReactNode;
  /** The outer box (e.g. "hidden md:block"). */
  className?: string | undefined;
  /** The scrolling box. */
  scrollClassName?: string | undefined;
  style?: CSSProperties | undefined;
  /** Names the region when the table has no caption. */
  label?: string | undefined;
  /** The header sticks, and lifts once rows pass under it instead of a top shadow. */
  stickyHeader?: boolean | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ScrollState>(IDLE);
  const [captionId, setCaptionId] = useState<string | null>(null);
  const fallbackId = useId();

  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    // The region is named by the table's caption (TableCaption is often
    // screen-reader only, and still names it).
    const caption = box.querySelector(":scope > table > caption");
    if (caption) {
      if (!caption.id) caption.id = `${fallbackId}caption`;
      setCaptionId(caption.id);
    }
    const update = () => {
      const next = scrollState(box);
      setState((prev) => (same(prev, next) ? prev : next));
    };
    update();
    box.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(box);
    if (box.firstElementChild) observer?.observe(box.firstElementChild);
    return () => {
      box.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [fallbackId]);

  const region = state.overflow
    ? {
        tabIndex: 0,
        role: "region",
        ...(captionId
          ? { "aria-labelledby": captionId }
          : { "aria-label": label ?? "Scrollable table" }),
      }
    : {};

  return (
    <div className={cn("relative min-w-0", className)}>
      <div
        ref={ref}
        {...region}
        data-overflow={state.overflow ? "" : undefined}
        // TableHead lifts a sticky header off the rows scrolled under it.
        data-sv-scrolled={state.above ? "" : undefined}
        className={cn(
          "w-full overflow-auto overscroll-x-contain",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
          scrollClassName,
        )}
        style={style}
      >
        {children}
      </div>
      <span
        aria-hidden="true"
        className={cn(
          EDGE,
          "inset-y-0 left-0 w-4 shadow-[inset_12px_0_10px_-10px_rgb(11_21_48/0.14)]",
          state.before && "opacity-100",
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          EDGE,
          "inset-y-0 right-0 w-4 shadow-[inset_-12px_0_10px_-10px_rgb(11_21_48/0.14)]",
          state.after && "opacity-100",
        )}
      />
      {stickyHeader ? null : (
        <span
          aria-hidden="true"
          className={cn(
            EDGE,
            "inset-x-0 top-0 h-4 shadow-[inset_0_12px_10px_-10px_rgb(11_21_48/0.14)]",
            state.above && "opacity-100",
          )}
        />
      )}
      <span
        aria-hidden="true"
        className={cn(
          EDGE,
          "inset-x-0 bottom-0 h-4 shadow-[inset_0_-12px_10px_-10px_rgb(11_21_48/0.14)]",
          state.below && "opacity-100",
        )}
      />
    </div>
  );
}
