"use client";

import { buttonClasses } from "@storevia/ui/button";
import { Checkbox, Switch } from "@storevia/ui/choice";
import { Field, Input } from "@storevia/ui/form";
import { RadioGroup, RadioItem } from "@storevia/ui/choice";
import { Card, CardBody, CardHeader } from "@storevia/ui/surfaces";
import Link from "next/link";
import { startTransition, useActionState, useRef, useState } from "react";
import { createProductAction } from "@/app/(app)/s/[storeId]/products/actions";
import { FormMessage, SubmitButton, TextField } from "@/components/forms";
import { WeightInput, weightDraftOf, type WeightDraft } from "./editor/weight-input";
import { FREE_PRODUCT_CODE, FreeProductDialog } from "./free-product-dialog";
import { LazyRichTextEditor } from "./lazy-rich-text";
import { UnsavedChangesGuard } from "./unsaved-guard";

// The first step for a product: what it is, what it costs, how many there
// are and how it ships. Everything else (images, options, SEO) is in the
// editor it opens. Saving a product priced at 0 as active asks first.

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
  const [ships, setShips] = useState(true);
  const [taxable, setTaxable] = useState(true);
  const [weight, setWeight] = useState<WeightDraft>(weightDraftOf(null));
  const error = (name: string) => state.fieldErrors?.[name];
  const value = (name: string) => state.values?.[name];
  // The last submission, repeated with the confirmation when the merchant
  // publishes a product priced at 0 anyway.
  const submitted = useRef<FormData | null>(null);
  const [answered, setAnswered] = useState<typeof state | null>(null);
  const [confirming, setConfirming] = useState(false);
  const needsConfirmation = !state.ok && state.code === FREE_PRODUCT_CODE && answered !== state;

  return (
    <form
      action={(formData) => {
        setDirty(false);
        setConfirming(false);
        submitted.current = formData;
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
        {state.message && !state.ok && state.code !== FREE_PRODUCT_CODE ? (
          <FormMessage state={state} />
        ) : null}
        <FreeProductDialog
          message={needsConfirmation ? (state.message ?? "") : null}
          pending={confirming}
          cancelLabel="Keep editing"
          onCancel={() => {
            setAnswered(state);
          }}
          onConfirm={() => {
            const formData = submitted.current;
            if (!formData) return;
            formData.set("confirmFree", "true");
            setConfirming(true);
            startTransition(() => {
              action(formData);
            });
          }}
        />
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
            <div className="sm:col-span-2">
              <Checkbox
                label="Charge tax on this product"
                description="Your store's tax rates apply to it at checkout."
                checked={taxable}
                onCheckedChange={(v) => {
                  setTaxable(v === true);
                  setDirty(true);
                }}
              />
              <input type="hidden" name="taxable" value={taxable ? "true" : "false"} />
            </div>
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

        <Card>
          <CardHeader divider={false} title="Shipping" />
          <CardBody className="space-y-5 pt-4 pb-6">
            <Switch
              label="Physical product that needs shipping"
              description="Turn off for services and digital goods: checkout skips the shipping step when nothing in the cart needs it."
              checked={ships}
              onCheckedChange={(v) => {
                setShips(v);
                setDirty(true);
              }}
            />
            <input type="hidden" name="requiresShipping" value={ships ? "true" : "false"} />
            {ships ? (
              <div className="sm:max-w-64">
                <WeightInput
                  label="Weight"
                  name="weightGrams"
                  value={weight}
                  onChange={(next) => {
                    setWeight(next);
                    setDirty(true);
                  }}
                  error={error("weightGrams")}
                  description="Packed weight, saved with each order."
                />
              </div>
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
            <TextField
              label="HSN code"
              name="hsnCode"
              state={state}
              inputMode="numeric"
              maxLength={12}
              autoComplete="off"
              hint="4, 6 or 8 digits. Stored with the product for GST classification; it doesn't change prices or tax yet."
            />
          </CardBody>
        </Card>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <Link href={cancelHref} className={buttonClasses("ghost", "md")}>
            Cancel
          </Link>
          <SubmitButton className="max-sm:w-full">Save product</SubmitButton>
        </div>
      </div>
    </form>
  );
}
