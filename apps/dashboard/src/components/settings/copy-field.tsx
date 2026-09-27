"use client";

import { Button } from "@storevia/ui/button";
import { Field, Input } from "@storevia/ui/form";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * A read-only value to paste elsewhere (a webhook URL), with a Copy button.
 * The field selects its whole value on focus, so copying by hand works too
 * (and when the clipboard API isn't available).
 */
export function CopyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (status === "idle") return;
    const timer = setTimeout(() => {
      setStatus("idle");
    }, 2500);
    return () => {
      clearTimeout(timer);
    };
  }, [status]);
  return (
    <div className="grid gap-2">
      <Field label={label} hint={hint}>
        {({ id, describedBy }) => (
          <div className="flex min-w-0 gap-2">
            <Input
              id={id}
              aria-describedby={describedBy}
              readOnly
              value={value}
              onFocus={(event) => {
                event.currentTarget.select();
              }}
              className="min-w-0 flex-1 font-mono text-body-sm"
            />
            <Button
              type="button"
              variant="secondary"
              leadingIcon={status === "copied" ? Check : Copy}
              onClick={() => {
                // Undefined outside secure contexts, whatever the DOM types say.
                const clipboard = navigator.clipboard as Clipboard | undefined;
                if (!clipboard) {
                  setStatus("failed");
                  return;
                }
                clipboard.writeText(value).then(
                  () => {
                    setStatus("copied");
                  },
                  () => {
                    setStatus("failed");
                  },
                );
              }}
            >
              Copy<span className="sr-only"> {label.toLowerCase()}</span>
            </Button>
          </div>
        )}
      </Field>
      <p role="status" className="text-label font-normal text-ink-muted empty:hidden">
        {status === "copied"
          ? "Copied."
          : status === "failed"
            ? "Couldn't copy. Select the field and copy it by hand."
            : ""}
      </p>
    </div>
  );
}
