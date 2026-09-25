"use client";

import { useEffect, useRef } from "react";
import { FormMessage, type FormState } from "@/components/forms";

/**
 * The sign-in result, focused when it arrives: the submit button is disabled
 * while pending, so focus would otherwise fall to <body>. Stays mounted while
 * field errors show (`hidden`), so an old result never takes focus back.
 */
export function AuthFormMessage({ state, hidden }: { state: FormState; hidden?: boolean }) {
  const target = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.message) target.current?.focus();
  }, [state]);

  if (!state.message) return null;
  return (
    <div
      ref={target}
      tabIndex={-1}
      hidden={hidden}
      className="rounded-card outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <FormMessage state={state} />
    </div>
  );
}
