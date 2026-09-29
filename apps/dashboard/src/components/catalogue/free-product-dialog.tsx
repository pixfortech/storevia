"use client";

import { Button } from "@storevia/ui/button";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";

/** The service's answer when publishing a product priced at 0 needs the merchant's say-so. */
export const FREE_PRODUCT_CODE = "CONFIRMATION_REQUIRED";

/**
 * "This product is free. Publish anyway?" The server refused to publish a
 * product priced at 0 without confirmation; `message` is its explanation
 * (the product's name and price). Confirming repeats the request with the
 * confirmation; cancelling changes nothing.
 */
export function FreeProductDialog({
  message,
  pending,
  cancelLabel = "Keep as draft",
  onConfirm,
  onCancel,
}: {
  /** null: closed. */
  message: string | null;
  pending: boolean;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      role="alertdialog"
      size="sm"
      open={message !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title="This product is free. Publish anyway?"
      description={message ?? ""}
    >
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary">{cancelLabel}</Button>
        </DialogClose>
        <Button pending={pending} onClick={onConfirm}>
          Publish anyway
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
