import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge resolves conflicting utilities (the later class wins), so a
// caller's className reliably overrides a component default. It must know
// Storevia's custom token names, or `text-h2` would be mistaken for a colour
// and dropped next to `text-ink`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "display-xl",
        "display-l",
        "h1",
        "h2",
        "h3",
        "h4",
        "body-lg",
        "body",
        "body-sm",
        "label",
        "caption",
        "overline",
        "metric",
        "metric-lg",
        "table",
      ],
      radius: ["control", "card", "panel", "pill"],
      shadow: ["card", "raised", "popover", "window", "inset"],
      font: ["display"],
      ease: ["standard", "emphasised", "exit"],
    },
  },
});

export function cn(...values: ClassValue[]): string {
  return twMerge(clsx(values));
}
