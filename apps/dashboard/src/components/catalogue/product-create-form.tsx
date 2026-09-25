"use client";

import { Switch } from "@storevia/ui/choice";
import { Field, Input } from "@storevia/ui/form";
import { RadioGroup, RadioItem } from "@storevia/ui/choice";
import { Card, CardBody, CardHeader } from "@storevia/ui/surfaces";
import Link from "next/link";
import { useActionState, useState } from "react";
import { createProductAction } from "@/app/(app)/s/[storeId]/products/actions";
import { FormMessage, SubmitButton, TextField } from "@/components/forms";
import { LazyRichTextEditor } from "./lazy-rich-text";
import { UnsavedChangesGuard } from "./unsaved-guard";

// The first step for a product: what it is, what it costs and how many there
// are. Everything else (images, options, SEO) is in the editor it opens.

export function ProductCreateForm({
  storeId,
  currency,
  cancelHref,
}: {
  storeId: string;
  currency: string;
  cancelHref: string;
}) {
  const [state, action] = useActionState(createProductAction.bind(null, storeId), { ok: false });
  const [dirty, setDirty] = useState(false);
  const [track, setTrack] = useState(true);
  const error = (name: string) => state.fieldErrors?.[name];
  const value = (name: string) => state.values?.[name];

  return (
    <form
      action={(formData) => {
        setDirty(false);
        action(formData);
      }}
      noValidate
      onChange={() => {
        setDirty(true);
      }}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
    >
      <UnsavedChangesGuard dirty={dirty} />
      <div className="min-w-0 space-y-6">
        {state.message && !state.ok ? <FormMessage state={state} /> : null}
        <Card>
          <CardBody className="space-y-5 py-6">
            <TextField
              label="Title"
              name="title"
              required
              state={state}
              placeholder="Linen shirt"
              autoFocus
            />
            <LazyRichTextEditor
              name="description"
              label="Description"
              defaultValue={null}
              error={error("description")}
              onChange={() => {
                setDirty(true);
              }}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            divider={false}
            title="Price"
            description={
              <>In {currency}, the store&apos;s currency. Add sizes or colours after saving.</>
            }
          />
          <CardBody className="grid gap-5 pt-4 pb-6 sm:grid-cols-2">
            <Field label="Price" error={error("price")} description="Leave empty for 0.">
              <Input
                name="price"
                inputMode="decimal"
                addon={currency}
                placeholder="0.00"
                defaultValue={value("price")}
              />
            </Field>
            <Field
              label="Compare-at price"
              error={error("compareAtPrice")}
              description="Optional: the higher price shown crossed out."
            >
              <Input
                name="compareAtPrice"
                inputMode="decimal"
                addon={currency}
                defaultValue={value("compareAtPrice")}
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader divider={false} title="Inventory" />
          <CardBody className="space-y-5 pt-4 pb-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="SKU"
                name="sku"
                state={state}
                hint="Your own stock code. Unique in this store."
              />
              <TextField
                label="Barcode"
                name="barcode"
                state={state}
                hint="ISBN, UPC, EAN or similar."
              />
            </div>
            <Switch
              label="Track stock"
              description="Count units at your locations and stop selling at zero."
              checked={track}
              onCheckedChange={(v) => {
                setTrack(v);
                setDirty(true);
              }}
            />
            <input type="hidden" name="trackInventory" value={track ? "true" : "false"} />
            {track ? (
              <Field
                label="Stock on hand"
                error={error("initialStock")}
                description="Recorded at your main location as initial stock. You can adjust it any time."
              >
                <Input
                  name="initialStock"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  placeholder="0"
                  className="sm:max-w-40"
                  defaultValue={value("initialStock")}
                />
              </Field>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <div className="min-w-0 space-y-6 lg:sticky lg:top-20">
        <Card>
          <CardHeader divider={false} title="Status" />
          <CardBody className="pt-4 pb-6">
            <RadioGroup name="status" defaultValue={value("status") ?? "DRAFT"} aria-label="Status">
              <RadioItem value="DRAFT" label="Draft" description="Only your team can see it." />
              <RadioItem
                value="ACTIVE"
                label="Active"
                description="Ready to sell once your storefront is live."
              />
            </RadioGroup>
          </CardBody>
        </Card>
        <Card>
          <CardHeader divider={false} title="Organisation" />
          <CardBody className="space-y-5 pt-4 pb-6">
            <TextField label="Vendor" name="vendor" state={state} placeholder="Who makes it" />
            <TextField label="Product type" name="productType" state={state} placeholder="Shirts" />
          </CardBody>
        </Card>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end lg:flex-col-reverse">
          <Link
            href={cancelHref}
            className="inline-flex h-10 items-center justify-center rounded-control px-4 text-label font-medium text-ink-muted hover:bg-subtle hover:text-ink pointer-coarse:h-11"
          >
            Cancel
          </Link>
          <SubmitButton fullWidth>Save product</SubmitButton>
        </div>
      </div>
    </form>
  );
}
