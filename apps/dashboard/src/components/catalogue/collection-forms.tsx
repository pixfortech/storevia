"use client";

import { Button, IconButton } from "@storevia/ui/button";
import { Field, SearchInput, Textarea } from "@storevia/ui/form";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";
import { Alert, Badge, Card, CardHeader } from "@storevia/ui/surfaces";
import type { JSONContent } from "@tiptap/react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import { searchProductsAction } from "@/app/(app)/s/[storeId]/products/actions";
import {
  addToCollectionAction,
  createCollectionAction,
  removeFromCollectionAction,
  reorderCollectionAction,
  setCollectionArchivedAction,
  updateCollectionAction,
} from "@/app/(app)/s/[storeId]/products/collections/actions";
import { ConfirmDialog } from "@/components/areas/confirm-dialog";
import { FormMessage, SubmitButton, TextField } from "@/components/forms";
import { PRODUCT_STATUS, productPath, type ProductStatus } from "@/lib/catalogue";
import { LazyRichTextEditor } from "./lazy-rich-text";
import { UnsavedChangesGuard } from "./unsaved-guard";

export function CreateCollectionDialog({ storeId }: { storeId: string }) {
  const [state, action] = useActionState(createCollectionAction.bind(null, storeId), { ok: false });
  return (
    <Dialog
      title="Create collection"
      description="Group products by theme, season or anything else. You choose which products go in and their order."
      size="sm"
      trigger={<Button leadingIcon={Plus}>Create collection</Button>}
    >
      <form action={action} className="space-y-5" noValidate>
        <FormMessage state={state} />
        <TextField
          label="Title"
          name="title"
          required
          state={state}
          placeholder="Summer edit"
          autoFocus
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" type="button">
              Cancel
            </Button>
          </DialogClose>
          <SubmitButton>Create</SubmitButton>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

export function CollectionDetailsForm({
  storeId,
  collectionId,
  values,
  canEdit,
}: {
  storeId: string;
  collectionId: string;
  values: {
    title: string;
    handle: string;
    description: JSONContent | null;
    seoTitle: string;
    seoDescription: string;
  };
  canEdit: boolean;
}) {
  const [state, action] = useActionState(updateCollectionAction.bind(null, storeId, collectionId), {
    ok: false,
  });
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (state.ok) setDirty(false);
  }, [state]);
  return (
    <form
      action={action}
      noValidate
      onChange={() => {
        setDirty(true);
      }}
    >
      <UnsavedChangesGuard dirty={dirty} />
      <Card>
        <fieldset disabled={!canEdit} className="min-w-0 space-y-5 px-5 py-6 sm:px-6">
          <legend className="sr-only">Collection details</legend>
          <FormMessage state={state} />
          <TextField
            label="Title"
            name="title"
            required
            state={state}
            defaultValue={values.title}
          />
          <LazyRichTextEditor
            name="description"
            label="Description"
            defaultValue={values.description}
            error={state.fieldErrors?.["description"]}
            disabled={!canEdit}
            placeholder="What ties these products together."
            onChange={() => {
              setDirty(true);
            }}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="URL handle"
              name="handle"
              state={state}
              defaultValue={values.handle}
              hint="Lower-case letters, numbers and hyphens."
            />
            <TextField
              label="Page title"
              name="seoTitle"
              state={state}
              defaultValue={values.seoTitle}
            />
          </div>
          <Field label="Meta description" error={state.fieldErrors?.["seoDescription"]}>
            <Textarea
              name="seoDescription"
              rows={2}
              maxLength={1000}
              defaultValue={values.seoDescription}
            />
          </Field>
        </fieldset>
        {canEdit ? (
          <div className="flex justify-end border-t border-line px-5 py-3.5 sm:px-6">
            <SubmitButton>Save collection</SubmitButton>
          </div>
        ) : null}
      </Card>
    </form>
  );
}

interface Member {
  readonly id: string;
  readonly title: string;
  readonly status: ProductStatus;
}

export function CollectionProducts({
  storeId,
  collectionId,
  products,
  canEdit,
}: {
  storeId: string;
  collectionId: string;
  products: readonly Member[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly { id: string; title: string; status: string }[]>(
    [],
  );
  const ids = products.map((p) => p.id);

  useEffect(() => {
    if (!canEdit || query.trim().length < 1) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void searchProductsAction(storeId, query.trim()).then((r) => {
        if (r.ok) setResults(r.data);
      });
    }, 250);
    return () => {
      clearTimeout(timer);
    };
  }, [query, storeId, canEdit]);

  const run = (fn: () => Promise<{ ok: boolean; message?: string | undefined }>) => {
    startTransition(async () => {
      const result = await fn();
      setError(result.ok ? null : (result.message ?? "That didn't work."));
      router.refresh();
    });
  };
  const move = (index: number, delta: number) => {
    const next = [...ids];
    const [item] = next.splice(index, 1);
    if (item === undefined) return;
    next.splice(index + delta, 0, item);
    run(() => reorderCollectionAction(storeId, collectionId, next));
  };
  const candidates = results.filter((r) => !ids.includes(r.id));

  return (
    <Card>
      <CardHeader
        divider={false}
        title="Products"
        description={`${String(products.length)} ${products.length === 1 ? "product" : "products"}, in the order shoppers will see them.`}
      />
      <div className="space-y-4 px-5 pt-4 pb-5 sm:px-6" aria-busy={pending || undefined}>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {canEdit ? (
          <div className="relative">
            <SearchInput
              aria-label="Find products to add"
              placeholder="Search products to add"
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
              }}
              onClear={() => {
                setQuery("");
              }}
            />
            {candidates.length > 0 ? (
              <ul
                className="mt-2 divide-y divide-line rounded-card border border-line"
                aria-label="Search results"
              >
                {candidates.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate text-body-sm text-ink">{r.title}</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      leadingIcon={Plus}
                      onClick={() => {
                        run(() => addToCollectionAction(storeId, collectionId, [r.id]));
                      }}
                    >
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            ) : query.trim() && results.length > 0 ? (
              <p className="mt-2 text-body-sm text-ink-muted">
                Everything matching is already in this collection.
              </p>
            ) : null}
          </div>
        ) : null}
        {products.length === 0 ? (
          <p className="rounded-card border border-dashed border-line-strong px-4 py-8 text-center text-body-sm text-ink-muted">
            No products yet. {canEdit ? "Search above to add some." : ""}
          </p>
        ) : (
          <ol className="divide-y divide-line rounded-card border border-line">
            {products.map((p, index) => (
              <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                <span className="w-6 shrink-0 text-right text-caption text-ink-faint tabular-nums">
                  {index + 1}
                </span>
                <Link
                  href={productPath(storeId, p.id)}
                  className="min-w-0 flex-1 truncate text-body-sm font-medium text-ink hover:text-brand-700"
                >
                  {p.title}
                </Link>
                <Badge
                  size="sm"
                  variant="dot"
                  tone={PRODUCT_STATUS[p.status].tone}
                  className="hidden sm:inline-flex"
                >
                  {PRODUCT_STATUS[p.status].label}
                </Badge>
                {canEdit ? (
                  <span className="flex shrink-0">
                    <IconButton
                      size="sm"
                      icon={ArrowUp}
                      aria-label={`Move ${p.title} up`}
                      disabled={index === 0}
                      onClick={() => {
                        move(index, -1);
                      }}
                    />
                    <IconButton
                      size="sm"
                      icon={ArrowDown}
                      aria-label={`Move ${p.title} down`}
                      disabled={index === products.length - 1}
                      onClick={() => {
                        move(index, 1);
                      }}
                    />
                    <IconButton
                      size="sm"
                      icon={X}
                      aria-label={`Remove ${p.title} from the collection`}
                      onClick={() => {
                        run(() => removeFromCollectionAction(storeId, collectionId, [p.id]));
                      }}
                    />
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

export function CollectionArchiveControl({
  storeId,
  collectionId,
  archived,
}: {
  storeId: string;
  collectionId: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [state, action] = useActionState(
    async () => {
      const result = await setCollectionArchivedAction(storeId, collectionId, !archived);
      if (result.ok) router.refresh();
      return result;
    },
    { ok: false },
  );
  if (archived) {
    return (
      <form action={action}>
        <SubmitButton variant="secondary">Restore collection</SubmitButton>
      </form>
    );
  }
  return (
    <ConfirmDialog
      tone="default"
      trigger={<Button variant="secondary">Archive</Button>}
      title="Archive this collection?"
      description="It's hidden and its products stay as they are. You can restore it any time."
      confirmLabel="Archive collection"
      action={action}
      state={state}
    />
  );
}
