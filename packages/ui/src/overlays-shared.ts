// Motion shared by the overlay modules (overlays, dropdown-menu, feedback,
// popover). Server-safe.

// Radix waits for an exit animation only when its name differs from the
// entrance's, so each exit reuses a different token keyframe played in reverse.
export const EXIT_FADE =
  "data-[state=closed]:animate-[fade-in_var(--duration-fast)_var(--ease-exit)_reverse_forwards]";

// Tooltips and popovers scale in and fade out.
export const POP_ENTER =
  "data-[state=open]:animate-[scale-in_var(--duration-base)_var(--ease-emphasised)] " +
  "data-[state=delayed-open]:animate-[scale-in_var(--duration-fast)_var(--ease-emphasised)] " +
  "data-[state=instant-open]:animate-[scale-in_var(--duration-fast)_var(--ease-emphasised)]";
export const POP_EXIT = EXIT_FADE;
