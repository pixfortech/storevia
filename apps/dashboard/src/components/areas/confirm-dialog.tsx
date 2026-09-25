"use client";

import { Button, Dialog, DialogClose, DialogFooter } from "@storevia/ui";
import type { ReactNode } from "react";
import { FormMessage, SubmitButton, type FormState } from "@/components/forms";

/**
 * A confirmation for an action that removes access or hides data: an
 * alertdialog (it doesn't close on a stray click, and focus starts on
 * Cancel), the consequence in plain words and one clearly labelled button.
 * The action itself is the page's unchanged server action.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  action,
  state,
  tone = "danger",
  children,
}: {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  action: (formData: FormData) => void;
  /** The action's result, shown in the dialog when it fails. */
  state?: FormState;
  tone?: "danger" | "default";
  children?: ReactNode;
}) {
  return (
    <Dialog role="alertdialog" size="sm" title={title} description={description} trigger={trigger}>
      <form action={action} className="space-y-5">
        {state ? <FormMessage state={state} /> : null}
        {children}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <SubmitButton variant={tone === "danger" ? "danger" : "primary"}>
            {confirmLabel}
          </SubmitButton>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
