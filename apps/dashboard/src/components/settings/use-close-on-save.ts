"use client";

import { useEffect, useRef } from "react";
import type { FormState } from "@/components/forms";

/** Calls `onSaved` once for each successful result of a dialog's form action. */
export function useCloseOnSave(state: FormState, onSaved: () => void): void {
  const latest = useRef(onSaved);
  useEffect(() => {
    latest.current = onSaved;
  });
  useEffect(() => {
    if (state.ok) latest.current();
  }, [state]);
}
