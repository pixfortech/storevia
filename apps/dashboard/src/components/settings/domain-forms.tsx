"use client";

import { Button } from "@storevia/ui/button";
import { Check, Copy, Plus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import {
  addDomainAction,
  checkDomainAction,
  makePrimaryDomainAction,
  removeDomainAction,
} from "@/app/(app)/s/[storeId]/settings/domains/actions";
import { ConfirmDialog } from "@/components/areas/confirm-dialog";
import { FormMessage, SubmitButton, TextField, type FormState } from "@/components/forms";

// Custom domains (ADR-0032): the add form, the per-domain actions and the
// DNS records table. Every action is re-checked on the server.

export function AddDomainForm({ storeId }: { storeId: string }) {
  const [state, action] = useActionState(addDomainAction.bind(null, storeId), { ok: false });
  // A fresh, empty field after each successful add.
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (state.ok) setRound((r) => r + 1);
  }, [state]);
  return (
    <form action={action} noValidate className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <TextField
            key={round}
            label="Domain"
            name="hostname"
            state={state.ok ? { ok: false } : state}
            placeholder="shop.example.com"
            hint="Without https://. A root domain (example.com) or a subdomain (www.example.com, shop.example.com)."
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="url"
          />
        </div>
        <SubmitButton leadingIcon={Plus} className="sm:mt-7">
          Add domain
        </SubmitButton>
      </div>
      <FormMessage state={state} variant="inline" />
    </form>
  );
}

function ActionButton({
  label,
  srLabel,
  action,
  variant = "secondary",
}: {
  label: string;
  srLabel: string;
  action: (prev: FormState) => Promise<FormState>;
  variant?: "secondary" | "ghost";
}) {
  const [state, run] = useActionState<FormState>(action, { ok: false });
  return (
    <form action={run} className="contents">
      <SubmitButton size="sm" variant={variant}>
        {label}
        <span className="sr-only"> {srLabel}</span>
      </SubmitButton>
      <FormMessage state={state} variant="inline" className="basis-full" />
    </form>
  );
}

export function CheckDomainButton({
  storeId,
  domainId,
  hostname,
}: {
  storeId: string;
  domainId: string;
  hostname: string;
}) {
  return (
    <ActionButton
      label="Check again"
      srLabel={hostname}
      action={checkDomainAction.bind(null, storeId, domainId)}
    />
  );
}

export function MakePrimaryButton({
  storeId,
  domainId,
  hostname,
}: {
  storeId: string;
  domainId: string;
  hostname: string;
}) {
  return (
    <ActionButton
      label="Make primary"
      srLabel={hostname}
      action={makePrimaryDomainAction.bind(null, storeId, domainId)}
    />
  );
}

export function RemoveDomainButton({
  storeId,
  domainId,
  hostname,
  isPrimary,
  fallbackHostname,
}: {
  storeId: string;
  domainId: string;
  hostname: string;
  isPrimary: boolean;
  fallbackHostname: string;
}) {
  const [state, action] = useActionState(removeDomainAction.bind(null, storeId, domainId), {
    ok: false,
  });
  return (
    <ConfirmDialog
      title={`Remove ${hostname}?`}
      description={
        isPrimary
          ? `Your store will be served at ${fallbackHostname} again, and ${hostname} will stop working. You can add it again later, but you'll need to verify it again.`
          : `${hostname} will stop working for your store. You can add it again later, but you'll need to verify it again.`
      }
      confirmLabel="Remove domain"
      action={action}
      state={state}
      trigger={
        <Button size="sm" variant="ghost">
          Remove<span className="sr-only"> {hostname}</span>
        </Button>
      }
    />
  );
}

export function CopyButton({ value, label }: { value: string; label: string }) {
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
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="ghost"
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
        {status === "copied" ? "Copied" : "Copy"}
        <span className="sr-only"> {label}</span>
      </Button>
      <span role="status" className="text-caption text-ink-muted empty:hidden">
        {status === "failed" ? "Couldn't copy. Select the text and copy it by hand." : ""}
      </span>
    </span>
  );
}
