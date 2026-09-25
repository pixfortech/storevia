"use client";

import { useEffect, useRef } from "react";
import { FormMessage, type FormState } from "@/components/forms";

/**
 * An auth form's server result, focused when it arrives. The submit button is
 * disabled while pending, so without this, keyboard and screen-reader users
 * land on <body> and start again from the top; from the message, Tab goes
 * straight back to the first field.
 *
 * Stays mounted while client checks show field errors (`hidden`), so an old
 * result reappearing never takes focus from the field being typed in.
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
