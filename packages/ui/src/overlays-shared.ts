// Motion shared by overlays.tsx and dropdown-menu.tsx. Server-safe.

// Radix waits for an exit animation only when its name differs from the
// entrance's, so each exit reuses a different token keyframe played in reverse.
export const EXIT_FADE =
  "data-[state=closed]:animate-[fade-in_var(--duration-fast)_var(--ease-exit)_reverse_forwards]";
