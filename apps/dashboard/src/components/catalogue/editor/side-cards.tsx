"use client";

import { Button, IconButton } from "@storevia/ui/button";
import { Select } from "@storevia/ui/form";
import { Icon } from "@storevia/ui/icons";
import { Badge, Card, CardHeader } from "@storevia/ui/surfaces";
import { Archive, ArrowRight, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import {
  archiveProductAction,
  restoreProductAction,
  setProductStatusAction,
} from "@/app/(app)/s/[storeId]/products/actions";
import {
  addToCollectionAction,
  removeFromCollectionAction,
} from "@/app/(app)/s/[storeId]/products/collections/actions";
import { ConfirmDialog } from "@/components/areas/confirm-dialog";
import { FormMessage } from "@/components/forms";
import { PRODUCT_STATUS, type ProductStatus } from "@/lib/catalogue";
import { AdjustStockDialog } from "../adjust-stock-dialog";
import type { EditorLocation, EditorVariant } from "./types";
import { useNoteVersion } from "./version";

export function StatusCard({
  storeId,
  productId,
  status,
  canEdit,
  canArchive,
}: {
  storeId: string;
  productId: string;
  status: ProductStatus;
  canEdit: boolean;
  canArchive: boolean;
}) {
  const router = useRouter();
  const noteVersion = useNoteVersion();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; message?: string | undefined } | null>(
    null,
  );
  const [archiveState, archive] = useActionState(
    async () => {
      const result = await archiveProductAction(storeId, productId);
      if (result.ok) router.refresh();
      return result;
    },
    { ok: false },
  );
  const info = PRODUCT_STATUS[status];
  const run = (
    fn: () => Promise<{
      ok: boolean;
      message?: string | undefined;
      values?: Readonly<Record<string, string>> | undefined;
    }>,
  ) => {
    startTransition(async () => {
      const result = await fn();
      setMessage(result);
      const updatedAt = result.values?.["updatedAt"];
      if (result.ok && updatedAt) noteVersion(updatedAt);
      router.refresh();
    });
  };
  return (
    <Card>
      <CardHeader divider={false} title="Status" />
      <div className="space-y-4 px-5 pt-4 pb-5 sm:px-6">
        <div className="flex items-start gap-3">
          <Badge variant="dot" tone={info.tone} size="md">
            {info.label}
          </Badge>
          <p className="text-body-sm text-ink-muted">{info.help}</p>
        </div>
        {message?.message ? <FormMessage state={message} variant="inline" /> : null}
        <div className="flex flex-wrap gap-2">
          {status === "DRAFT" && canEdit ? (
            <Button
              size="sm"
              pending={pending}
              onClick={() => {
                run(() => setProductStatusAction(storeId, productId, "ACTIVE"));
              }}
            >
              Set as active
            </Button>
          ) : null}
          {status === "ACTIVE" && canEdit ? (
            <Button
              size="sm"
              variant="secondary"
              pending={pending}
              onClick={() => {
                run(() => setProductStatusAction(storeId, productId, "DRAFT"));
              }}
            >
              Set as draft
            </Button>
          ) : null}
          {status === "ARCHIVED" && canArchive ? (
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={RotateCcw}
              pending={pending}
              onClick={() => {
                run(() => restoreProductAction(storeId, productId));
              }}
            >
              Restore as draft
            </Button>
          ) : null}
          {status !== "ARCHIVED" && canArchive ? (
            <ConfirmDialog
              tone="default"
              trigger={
                <Button size="sm" variant="ghost" leadingIcon={Archive}>
                  Archive
                </Button>
              }
              title="Archive this product?"
              description="It's hidden and stops counting against your plan's product limit. Its stock history is kept, and you can restore it any time."
              confirmLabel="Archive product"
              action={archive}
              state={archiveState}
            />
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export function StockCard({
  storeId,
  productTitle,
  variant,
  variantCount,
  locations,
  canAdjust,
  inventoryHref,
}: {
  storeId: string;
  productTitle: string;
  /** The product's single variant, when it has no options. */
  variant: EditorVariant | undefined;
  variantCount: number;
  locations: readonly EditorLocation[];
  canAdjust: boolean;
  inventoryHref: string;
}) {
  return (
    <Card>
      <CardHeader
        divider={false}
        title="Stock"
        actions={
          <Link
            href={inventoryHref}
            className="inline-flex items-center gap-1 text-body-sm font-medium text-brand-700 hover:underline"
          >
            History
            <Icon icon={ArrowRight} size="xs" />
          </Link>
        }
      />
      <div className="space-y-3 px-5 pt-4 pb-5 sm:px-6">
        {!variant ? (
          <p className="text-body-sm text-ink-muted">
            Stock is kept per variant ({variantCount}). See each variant&apos;s stock in the table,
            or adjust it on the Inventory page.
          </p>
        ) : !variant.tracked ? (
          <p className="text-body-sm text-ink-muted">Stock isn&apos;t tracked for this product.</p>
        ) : (
          <>
            <ul className="divide-y divide-line rounded-control border border-line">
              {locations.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-body-sm"
                >
                  <span className="min-w-0 truncate text-ink">{l.name}</span>
                  <span className="font-medium text-ink tabular-nums">
                    {(variant.levels[l.id] ?? 0).toLocaleString("en-IN")}
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 bg-subtle px-3 py-2 text-body-sm">
                <span className="font-medium text-ink">Available</span>
                <span className="font-semibold text-ink tabular-nums">
                  {variant.available.toLocaleString("en-IN")}
                </span>
              </li>
            </ul>
            {canAdjust ? (
              <AdjustStockDialog
                storeId={storeId}
                variantId={variant.id}
                title={productTitle}
                locations={locations.map((l) => ({
                  id: l.id,
                  name: l.name,
                  available: variant.levels[l.id] ?? 0,
                }))}
                trigger={
                  <Button size="sm" variant="secondary" leadingIcon={SlidersHorizontal} fullWidth>
                    Update stock
                  </Button>
                }
              />
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}

export function CollectionsCard({
  storeId,
  productId,
  collections,
  allCollections,
  canManage,
  collectionsHref,
}: {
  storeId: string;
  productId: string;
  collections: readonly { readonly id: string; readonly title: string }[];
  allCollections: readonly { readonly id: string; readonly title: string }[];
  canManage: boolean;
  collectionsHref: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const others = allCollections.filter((c) => !collections.some((m) => m.id === c.id));
  const run = (fn: () => Promise<{ ok: boolean; message?: string | undefined }>) => {
    startTransition(async () => {
      const result = await fn();
      setError(result.ok ? null : (result.message ?? "That didn't work."));
      router.refresh();
    });
  };
  return (
    <Card>
      <CardHeader divider={false} title="Collections" />
      <div className="space-y-3 px-5 pt-4 pb-5 sm:px-6" aria-busy={pending || undefined}>
        {collections.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {collections.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-1 rounded-pill border border-line bg-subtle py-0.5 pr-0.5 pl-2.5 text-body-sm text-ink"
              >
                {c.title}
                {canManage ? (
                  <IconButton
                    size="sm"
                    icon={X}
                    aria-label={`Remove from ${c.title}`}
                    className="size-6"
                    onClick={() => {
                      run(() => removeFromCollectionAction(storeId, c.id, [productId]));
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-ink-muted">Not in any collection.</p>
        )}
        {canManage && others.length > 0 ? (
          <Select
            size="sm"
            aria-label="Add to collection"
            value=""
            onChange={(event) => {
              const id = event.currentTarget.value;
              if (id) run(() => addToCollectionAction(storeId, id, [productId]));
            }}
          >
            <option value="">Add to a collection…</option>
            {others.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        ) : null}
        {canManage && allCollections.length === 0 ? (
          <Link
            href={collectionsHref}
            className="text-body-sm font-medium text-brand-700 hover:underline"
          >
            Create a collection
          </Link>
        ) : null}
        {error ? (
          <p role="alert" className="text-body-sm text-danger-700">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
