import { Badge, type BadgeProps } from "@storevia/ui/surfaces";
import { STATUS_LABELS, type Status } from "@/content/capabilities";

// One look per capability status, on the design system's Badge. The words
// always carry the meaning; the tone and dot only support them.
const LOOK: Record<Status, Pick<BadgeProps, "tone" | "variant">> = {
  available: { tone: "success", variant: "soft" },
  "in-development": { tone: "brand", variant: "soft" },
  roadmap: { tone: "neutral", variant: "dot" },
  future: { tone: "neutral", variant: "outline" },
};

export interface StatusPillProps {
  status: Status;
  size?: "sm" | "md";
  /** Replaces the standard label, e.g. "Milestone 3" (keep it a status). */
  label?: string;
  className?: string;
}

/** A capability's status ("Available now", "Up next", …) from content/capabilities.ts. */
export function StatusPill({ status, size = "sm", label, className }: StatusPillProps) {
  const look = LOOK[status];
  return (
    <Badge {...look} size={size} dot={look.variant === "soft"} className={className}>
      {label ?? STATUS_LABELS[status]}
    </Badge>
  );
}
