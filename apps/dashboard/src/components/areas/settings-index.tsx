"use client";

import { cn } from "@storevia/ui/cn";
import { useEffect, useState } from "react";

export interface SettingsSectionLink {
  readonly id: string;
  readonly label: string;
  /** The danger zone reads in the danger tone. */
  readonly danger?: boolean;
}

// Below the shell's sticky 56 px bar, with some air.
const ACTIVE_LINE = 120;

/**
 * The settings page's side index (desktop): in-page links to each section,
 * marking the one being read. Plain anchors, so it works before hydration
 * and without script; the highlight is a progressive enhancement.
 */
export function SettingsIndex({
  sections,
  className,
}: {
  sections: readonly SettingsSectionLink[];
  className?: string;
}) {
  const [active, setActive] = useState(sections[0]?.id);
  const ids = sections.map((s) => s.id).join(" ");

  useEffect(() => {
    const targets = ids
      .split(" ")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    let frame = 0;
    const update = () => {
      frame = 0;
      const atEnd =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const current = atEnd
        ? targets.at(-1)
        : (targets.filter((el) => el.getBoundingClientRect().top <= ACTIVE_LINE).at(-1) ??
          targets[0]);
      setActive(current?.id);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ids]);

  return (
    <nav aria-label="Settings sections" className={className}>
      <ul className="sticky top-24 border-l border-line">
        {sections.map((section) => {
          const current = section.id === active;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={current ? "location" : undefined}
                className={cn(
                  "-ml-px flex min-h-9 items-center border-l-2 border-transparent py-1.5 pl-4 text-body-sm transition-colors duration-(--duration-fast)",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
                  current
                    ? section.danger
                      ? "border-danger-600 font-medium text-danger-700"
                      : "border-brand-600 font-medium text-ink"
                    : section.danger
                      ? "text-danger-700 hover:border-danger-500/40"
                      : "text-ink-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
