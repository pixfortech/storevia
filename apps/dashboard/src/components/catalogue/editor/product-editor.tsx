"use client";

import { slugify } from "@storevia/commerce/handles";
import { Button } from "@storevia/ui/button";
import { Field, Input, Textarea } from "@storevia/ui/form";
import { Card, CardHeader } from "@storevia/ui/surfaces";
import { useActionState, useEffect, useRef, useState } from "react";
import { updateProductAction } from "@/app/(app)/s/[storeId]/products/actions";
import { FormMessage, TextField } from "@/components/forms";
import { collectionsPath, inventoryPath } from "@/lib/catalogue";
import { LazyRichTextEditor } from "../lazy-rich-text";
import { UnsavedChangesGuard } from "../unsaved-guard";
import { MediaCard } from "./media-card";
import { CollectionsCard, StatusCard, StockCard } from "./side-cards";
import type { EditorContext } from "./types";
import { VariantsCard } from "./variants-card";
import { ProductVersionContext } from "./version";

// The product editor: details, media and variants in the main column;
// status, stock, collections, organisation and search appearance beside
// them. The details (title, description, organisation, SEO) save together
// through one form; media, variants, stock and collections save on their
// own, each with its own feedback. Unsaved details are guarded.

const FORM_ID = "product-details";

const later = (a: string, b: string) => (new Date(a).getTime() >= new Date(b).getTime() ? a : b);

export function ProductEditor({ context }: { context: EditorContext }) {
  const { storeId, product, can } = context;
  const [state, action, pending] = useActionState(
    updateProductAction.bind(null, storeId, product.id),
    { ok: false },
  );
  const [dirty, setDirty] = useState(false);
  const [seoTitle, setSeoTitle] = useState(product.seoTitle);
  const [seoDescription, setSeoDescription] = useState(product.seoDescription);
  const [handle, setHandle] = useState(product.handle);
  const [title, setTitle] = useState(product.title);
  const formRef = useRef<HTMLFormElement>(null);
  const [ownVersion, setOwnVersion] = useState<string | null>(null);
  // Other saves on this page (media, variants) also move updatedAt; the
  // details form always sends the newest version it has seen.
  const expected = [state.values?.["expectedUpdatedAt"], ownVersion].reduce<string>(
    (newest, v) => (v ? later(v, newest) : newest),
    product.updatedAt,
  );

  useEffect(() => {
    if (state.ok) setDirty(false);
  }, [state]);

  // Any field that belongs to the details form (including those outside the
  // <form> element via the form attribute) marks it dirty.
  useEffect(() => {
    const mark = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      if (target?.form?.id === FORM_ID) setDirty(true);
    };
    document.addEventListener("input", mark);
    document.addEventListener("change", mark);
    return () => {
      document.removeEventListener("input", mark);
      document.removeEventListener("change", mark);
    };
  }, []);

  const single = product.options.length === 0 ? product.variants[0] : undefined;
  const readOnly = !can.edit;

  return (
    <ProductVersionContext.Provider
      value={(v) => {
        setOwnVersion((current) => (current ? later(v, current) : v));
      }}
    >
      <UnsavedChangesGuard dirty={dirty} />
      <form id={FORM_ID} ref={formRef} action={action} noValidate>
        <input type="hidden" name="expectedUpdatedAt" value={expected} />
      </form>

      {state.message && !state.ok ? (
        <div className="mb-6">
          <FormMessage state={state} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          {/* Phones and tablets: status first; desktop shows it in the side column. */}
          <div className="lg:hidden">
            <StatusCard
              storeId={storeId}
              productId={product.id}
              status={product.status}
              canEdit={can.edit}
              canArchive={can.archive}
            />
          </div>
          <Card>
            <fieldset disabled={readOnly} className="min-w-0 space-y-5 px-5 py-6 sm:px-6">
              <legend className="sr-only">Details</legend>
              <TextField
                label="Title"
                name="title"
                form={FORM_ID}
                required
                state={state}
                defaultValue={product.title}
                onChange={(event) => {
                  setTitle(event.currentTarget.value);
                }}
              />
              <LazyRichTextEditor
                name="description"
                form={FORM_ID}
                label="Description"
                defaultValue={product.description}
                error={state.fieldErrors?.["description"]}
                disabled={readOnly}
                onChange={() => {
                  setDirty(true);
                }}
              />
            </fieldset>
          </Card>

          <MediaCard
            storeId={storeId}
            productId={product.id}
            productTitle={product.title}
            media={product.media}
            canEdit={can.edit}
            canUpload={can.uploadMedia}
          />

          <VariantsCard
            storeId={storeId}
            productId={product.id}
            currency={product.currency}
            locale={context.locale}
            options={product.options}
            variants={product.variants}
            canEdit={can.edit}
          />

          <Card>
            <CardHeader
              divider={false}
              title="Search engine listing"
              description="How the product appears in search results and its web address."
            />
            <fieldset disabled={readOnly} className="min-w-0 space-y-5 px-5 pt-4 pb-6 sm:px-6">
              <legend className="sr-only">Search engine listing</legend>
              <div
                className="rounded-card border border-line bg-subtle p-4"
                aria-label="Search result preview"
              >
                <p className="truncate text-caption text-ink-faint">
                  {context.storefrontHost ?? "your-store"}/products/
                  {handle || slugify(title) || "product"}
                </p>
                <p className="mt-0.5 truncate text-body font-medium text-brand-700">
                  {seoTitle || title || "Product title"}
                </p>
                <p className="mt-0.5 line-clamp-2 text-body-sm text-ink-muted">
                  {seoDescription || "Add a description to show here."}
                </p>
              </div>
              <Field
                label="URL handle"
                error={state.fieldErrors?.["handle"]}
                description="Lower-case letters, numbers and hyphens. Changing it changes the product's address."
              >
                <Input
                  name="handle"
                  form={FORM_ID}
                  defaultValue={product.handle}
                  onChange={(event) => {
                    setHandle(event.currentTarget.value);
                  }}
                />
              </Field>
              <Field
                label="Page title"
                error={state.fieldErrors?.["seoTitle"]}
                description={`${String(seoTitle.length)} of 70 characters recommended.`}
              >
                <Input
                  name="seoTitle"
                  form={FORM_ID}
                  maxLength={255}
                  defaultValue={product.seoTitle}
                  placeholder={title}
                  onChange={(event) => {
                    setSeoTitle(event.currentTarget.value);
                  }}
                />
              </Field>
              <Field
                label="Meta description"
                error={state.fieldErrors?.["seoDescription"]}
                description={`${String(seoDescription.length)} of 160 characters recommended.`}
              >
                <Textarea
                  name="seoDescription"
                  form={FORM_ID}
                  rows={3}
                  maxLength={1000}
                  defaultValue={product.seoDescription}
                  onChange={(event) => {
                    setSeoDescription(event.currentTarget.value);
                  }}
                />
              </Field>
            </fieldset>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <div className="hidden lg:block">
            <StatusCard
              storeId={storeId}
              productId={product.id}
              status={product.status}
              canEdit={can.edit}
              canArchive={can.archive}
            />
          </div>
          <StockCard
            storeId={storeId}
            productTitle={product.title}
            variant={single}
            variantCount={product.variants.length}
            locations={context.locations}
            canAdjust={can.adjust}
            inventoryHref={inventoryPath(storeId, `/history?product=${product.id}`)}
          />
          <Card>
            <CardHeader divider={false} title="Organisation" />
            <fieldset disabled={readOnly} className="min-w-0 space-y-5 px-5 pt-4 pb-6 sm:px-6">
              <legend className="sr-only">Organisation</legend>
              <TextField
                label="Vendor"
                name="vendor"
                form={FORM_ID}
                state={state}
                defaultValue={product.vendor}
              />
              <TextField
                label="Product type"
                name="productType"
                form={FORM_ID}
                state={state}
                defaultValue={product.productType}
              />
              <TextField
                label="Tags"
                name="tags"
                form={FORM_ID}
                state={state}
                defaultValue={product.tags.join(", ")}
                hint="Separate tags with commas."
              />
            </fieldset>
          </Card>
          <CollectionsCard
            storeId={storeId}
            productId={product.id}
            collections={product.collections}
            allCollections={context.allCollections}
            canManage={can.collections}
            collectionsHref={collectionsPath(storeId)}
          />
        </div>
      </div>

      {can.edit ? (
        <div
          className={
            dirty
              ? "sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-(--z-sticky) mt-6 flex flex-wrap items-center justify-end gap-3 rounded-card border border-line bg-surface/95 px-4 py-3 shadow-popover backdrop-blur md:bottom-4"
              : "mt-6 flex flex-wrap items-center justify-end gap-3"
          }
          role={dirty ? "region" : undefined}
          aria-label={dirty ? "Unsaved changes" : undefined}
        >
          {dirty ? (
            <p className="mr-auto text-body-sm font-medium text-ink">Unsaved changes</p>
          ) : state.ok && state.message ? (
            <FormMessage state={state} variant="inline" className="mr-auto" />
          ) : null}
          {dirty ? (
            <Button
              variant="ghost"
              onClick={() => {
                setDirty(false);
                window.location.reload();
              }}
            >
              Discard
            </Button>
          ) : null}
          <Button type="submit" form={FORM_ID} pending={pending} disabled={!dirty && !pending}>
            Save
          </Button>
        </div>
      ) : null}
    </ProductVersionContext.Provider>
  );
}
