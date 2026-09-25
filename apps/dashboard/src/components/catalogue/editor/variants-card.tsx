"use client";

import {
  planOptionChange,
  OPTION_LIMITS,
  OptionPlanError,
  type DesiredOption,
} from "@storevia/commerce/variants";
import { Button, IconButton } from "@storevia/ui/button";
import { Checkbox, Switch } from "@storevia/ui/choice";
import { cn } from "@storevia/ui/cn";
import { Field, Input } from "@storevia/ui/form";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";
import { Alert, Badge, Card, CardHeader } from "@storevia/ui/surfaces";
import { ArrowDown, ArrowUp, History, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState, useTransition, type KeyboardEvent } from "react";
import {
  changeOptionsAction,
  updateVariantsAction,
} from "@/app/(app)/s/[storeId]/products/actions";
import type { VariantRemoval } from "@storevia/commerce";
import { formatMoney } from "@/lib/catalogue";
import type { EditorOption, EditorVariant } from "./types";
import { useNoteVersion } from "./version";

// Pricing, options and variants. A product without options edits its one
// variant inline; adding options (size, colour…) generates variants, and the
// matrix edits prices, SKUs, barcodes, cost and tracking for all of them at
// once. Option edits that would remove variants ask first, listing exactly
// what each holds.

interface VariantDraft {
  price: string;
  compareAtPrice: string;
  cost: string;
  sku: string;
  barcode: string;
  tracked: boolean;
  oversell: boolean;
}

const draftOf = (v: EditorVariant): VariantDraft => ({
  price: v.price,
  compareAtPrice: v.compareAtPrice,
  cost: v.cost,
  sku: v.sku,
  barcode: v.barcode,
  tracked: v.tracked,
  oversell: v.inventoryPolicy === "CONTINUE",
});

const same = (a: VariantDraft, b: VariantDraft) =>
  a.price === b.price &&
  a.compareAtPrice === b.compareAtPrice &&
  a.cost === b.cost &&
  a.sku === b.sku &&
  a.barcode === b.barcode &&
  a.tracked === b.tracked &&
  a.oversell === b.oversell;

function MoneyInput({
  label,
  currency,
  value,
  onChange,
  error,
  hideLabel,
}: {
  label: string;
  currency: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  hideLabel?: boolean;
}) {
  if (hideLabel) {
    return (
      <Input
        aria-label={label}
        aria-invalid={error ? true : undefined}
        title={error}
        inputMode="decimal"
        size="sm"
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        className={cn("w-full min-w-0", error && "border-danger-500")}
      />
    );
  }
  return (
    <Field label={label} error={error}>
      <Input
        inputMode="decimal"
        addon={currency}
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
      />
    </Field>
  );
}

export function VariantsCard({
  storeId,
  productId,
  currency,
  locale,
  options,
  variants,
  canEdit,
}: {
  storeId: string;
  productId: string;
  currency: string;
  locale: string;
  options: readonly EditorOption[];
  variants: readonly EditorVariant[];
  canEdit: boolean;
}) {
  const [editingOptions, setEditingOptions] = useState(false);
  const simple = options.length === 0;
  return (
    <>
      <Card>
        <CardHeader
          divider={false}
          title={simple ? "Pricing and inventory" : "Variants"}
          description={
            simple
              ? `Prices in ${currency}.`
              : `${String(variants.length)} ${variants.length === 1 ? "variant" : "variants"} from ${options
                  .map((o) => o.name.toLowerCase())
                  .join(" and ")}. Prices in ${currency}.`
          }
          actions={
            canEdit && !editingOptions ? (
              <Button
                size="sm"
                variant="secondary"
                leadingIcon={simple ? Plus : undefined}
                onClick={() => {
                  setEditingOptions(true);
                }}
              >
                {simple ? "Add options" : "Edit options"}
              </Button>
            ) : undefined
          }
        />
        {editingOptions ? (
          <OptionsEditor
            storeId={storeId}
            productId={productId}
            options={options}
            variants={variants}
            locale={locale}
            onDone={() => {
              setEditingOptions(false);
            }}
          />
        ) : null}
        {simple && variants[0] ? (
          <SingleVariantForm
            key={variants[0].id}
            storeId={storeId}
            productId={productId}
            variant={variants[0]}
            currency={currency}
            canEdit={canEdit}
          />
        ) : !simple ? (
          <VariantMatrix
            key={variants.map((v) => v.id).join("|")}
            storeId={storeId}
            productId={productId}
            variants={variants}
            currency={currency}
            canEdit={canEdit}
          />
        ) : null}
      </Card>
    </>
  );
}

function SingleVariantForm({
  storeId,
  productId,
  variant,
  currency,
  canEdit,
}: {
  storeId: string;
  productId: string;
  variant: EditorVariant;
  currency: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const noteVersion = useNoteVersion();
  const [draft, setDraft] = useState(draftOf(variant));
  // When the server's copy changes (after a save or another edit on the page),
  // take it unless the field has local edits.
  const [baseline, setBaseline] = useState(draftOf(variant));
  const server = draftOf(variant);
  if (!same(server, baseline)) {
    setBaseline(server);
    if (same(draft, baseline)) setDraft(server);
  }
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = !same(draft, draftOf(variant));
  const set = (patch: Partial<VariantDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setMessage(null);
  };
  const save = () => {
    startTransition(async () => {
      const result = await updateVariantsAction(storeId, productId, {
        variants: [
          {
            variantId: variant.id,
            price: draft.price,
            compareAtPrice: draft.compareAtPrice,
            cost: draft.cost,
            sku: draft.sku,
            barcode: draft.barcode,
            trackInventory: draft.tracked,
            inventoryPolicy: draft.oversell ? "CONTINUE" : "DENY",
          },
        ],
      });
      if (!result.ok) {
        const fields = Object.fromEntries(
          Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [
            k.replace(/^variants\.0\./, ""),
            v,
          ]),
        );
        setErrors(fields);
        setMessage({ ok: false, text: result.message ?? "That didn't save." });
        return;
      }
      setErrors({});
      noteVersion(result.data.updatedAt);
      setMessage({ ok: true, text: "Saved." });
      router.refresh();
    });
  };
  return (
    <fieldset disabled={!canEdit} className="min-w-0 space-y-5 px-5 pt-4 pb-5 sm:px-6 sm:pb-6">
      <div className="grid gap-5 sm:grid-cols-3">
        <MoneyInput
          label="Price"
          currency={currency}
          value={draft.price}
          onChange={(price) => {
            set({ price });
          }}
          error={errors["price"]}
        />
        <MoneyInput
          label="Compare-at price"
          currency={currency}
          value={draft.compareAtPrice}
          onChange={(compareAtPrice) => {
            set({ compareAtPrice });
          }}
          error={errors["compareAtPrice"]}
        />
        <MoneyInput
          label="Cost"
          currency={currency}
          value={draft.cost}
          onChange={(cost) => {
            set({ cost });
          }}
          error={errors["cost"]}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="SKU" error={errors["sku"]}>
          <Input
            value={draft.sku}
            onChange={(event) => {
              set({ sku: event.currentTarget.value });
            }}
          />
        </Field>
        <Field label="Barcode" error={errors["barcode"]} description="ISBN, UPC, EAN or similar.">
          <Input
            value={draft.barcode}
            onChange={(event) => {
              set({ barcode: event.currentTarget.value });
            }}
          />
        </Field>
      </div>
      <div className="space-y-3">
        <Switch
          label="Track stock"
          description="Count units by location. Stock is kept if you turn this off."
          checked={draft.tracked}
          onCheckedChange={(tracked) => {
            set({ tracked });
          }}
        />
        {draft.tracked ? (
          <Checkbox
            label="Keep selling when out of stock"
            description="Allows stock to go below zero."
            checked={draft.oversell}
            onCheckedChange={(value) => {
              set({ oversell: value === true });
            }}
          />
        ) : null}
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
          {message ? (
            <p
              role={message.ok ? "status" : "alert"}
              className={cn(
                "mr-auto text-body-sm",
                message.ok ? "text-success-700" : "text-danger-700",
              )}
            >
              {message.text}
            </p>
          ) : null}
          {dirty ? (
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(draftOf(variant));
              }}
            >
              Discard
            </Button>
          ) : null}
          <Button onClick={save} pending={pending} disabled={!dirty}>
            Save pricing
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

function VariantMatrix({
  storeId,
  productId,
  variants,
  currency,
  canEdit,
}: {
  storeId: string;
  productId: string;
  variants: readonly EditorVariant[];
  currency: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const noteVersion = useNoteVersion();
  const [drafts, setDrafts] = useState<Record<string, VariantDraft>>(() =>
    Object.fromEntries(variants.map((v) => [v.id, draftOf(v)])),
  );
  // Rows follow the server's copy after a save, except rows with local edits.
  const [baseline, setBaseline] = useState<Record<string, VariantDraft>>(() =>
    Object.fromEntries(variants.map((v) => [v.id, draftOf(v)])),
  );
  const stale = variants.some((v) => {
    const b = baseline[v.id];
    return !b || !same(b, draftOf(v));
  });
  if (stale) {
    const next: Record<string, VariantDraft> = {};
    const nextDrafts: Record<string, VariantDraft> = { ...drafts };
    for (const v of variants) {
      const server = draftOf(v);
      const before = baseline[v.id];
      next[v.id] = server;
      const local = drafts[v.id];
      if (!local || !before || same(local, before)) nextDrafts[v.id] = server;
    }
    setBaseline(next);
    setDrafts(nextDrafts);
  }
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [bulkPrice, setBulkPrice] = useState("");
  const [pending, startTransition] = useTransition();
  const changed = variants.filter((v) => {
    const d = drafts[v.id];
    return d !== undefined && !same(d, draftOf(v));
  });
  const set = (id: string, patch: Partial<VariantDraft>) => {
    setDrafts((current) => {
      const existing = current[id];
      return existing ? { ...current, [id]: { ...existing, ...patch } } : current;
    });
    setMessage(null);
  };
  const save = () => {
    const rows = changed;
    startTransition(async () => {
      const result = await updateVariantsAction(storeId, productId, {
        variants: rows.map((v) => {
          const d = drafts[v.id] ?? draftOf(v);
          return {
            variantId: v.id,
            price: d.price,
            compareAtPrice: d.compareAtPrice,
            cost: d.cost,
            sku: d.sku,
            barcode: d.barcode,
            trackInventory: d.tracked,
            inventoryPolicy: d.oversell ? "CONTINUE" : "DENY",
          };
        }),
      });
      if (!result.ok) {
        const byVariant: Record<string, Record<string, string>> = {};
        for (const [key, text] of Object.entries(result.fieldErrors ?? {})) {
          const match = /^variants\.(\d+)\.(\w+)$/.exec(key);
          const row = match ? rows[Number(match[1])] : undefined;
          if (row && match?.[2]) (byVariant[row.id] ??= {})[match[2]] = text;
        }
        setErrors(byVariant);
        setMessage({ ok: false, text: result.message ?? "That didn't save." });
        return;
      }
      setErrors({});
      noteVersion(result.data.updatedAt);
      setMessage({
        ok: true,
        text: `Saved ${String(rows.length)} ${rows.length === 1 ? "variant" : "variants"}.`,
      });
      router.refresh();
    });
  };

  return (
    <div className="min-w-0">
      {canEdit ? (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-y border-line bg-subtle px-5 py-3 sm:px-6">
          <Field label="Set every price" className="w-44">
            <Input
              inputMode="decimal"
              size="sm"
              addon={currency}
              value={bulkPrice}
              onChange={(event) => {
                setBulkPrice(event.currentTarget.value);
              }}
            />
          </Field>
          <Button
            size="sm"
            variant="secondary"
            disabled={bulkPrice.trim() === ""}
            onClick={() => {
              for (const v of variants) set(v.id, { price: bulkPrice.trim() });
            }}
          >
            Apply to all
          </Button>
        </div>
      ) : null}

      {/* Tablet and desktop: one row per variant. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[42rem] table-fixed border-collapse text-left">
          <caption className="sr-only">Variants</caption>
          <thead>
            <tr className="text-caption font-medium text-ink-faint shadow-[inset_0_-1px_0_var(--color-line)]">
              <th scope="col" className="h-10 w-[18%] pr-3 pl-6 font-medium">
                Variant
              </th>
              <th scope="col" className="h-10 pr-2 font-medium">
                Price
              </th>
              <th scope="col" className="h-10 pr-2 font-medium">
                Compare at
              </th>
              <th scope="col" className="h-10 pr-2 font-medium">
                Cost
              </th>
              <th scope="col" className="h-10 w-[18%] pr-2 font-medium">
                SKU
              </th>
              <th scope="col" className="h-10 w-[15%] pr-2 font-medium">
                Barcode
              </th>
              <th scope="col" className="h-10 w-20 pr-6 text-right font-medium">
                Stock
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {variants.map((v) => {
              const d = drafts[v.id] ?? draftOf(v);
              const e = errors[v.id] ?? {};
              const messages = Object.values(e);
              return (
                <Fragment key={v.id}>
                  <tr className={cn(!same(d, draftOf(v)) && "bg-brand-25")}>
                    <th
                      scope="row"
                      className="py-2.5 pr-3 pl-6 text-body-sm font-medium break-words text-ink"
                    >
                      {v.title}
                    </th>
                    <td className="py-2.5 pr-2">
                      <MoneyInput
                        hideLabel
                        label={`Price for ${v.title}`}
                        currency={currency}
                        value={d.price}
                        onChange={(price) => {
                          set(v.id, { price });
                        }}
                        error={e["price"]}
                      />
                    </td>
                    <td className="py-2.5 pr-2">
                      <MoneyInput
                        hideLabel
                        label={`Compare-at price for ${v.title}`}
                        currency={currency}
                        value={d.compareAtPrice}
                        onChange={(compareAtPrice) => {
                          set(v.id, { compareAtPrice });
                        }}
                        error={e["compareAtPrice"]}
                      />
                    </td>
                    <td className="py-2.5 pr-2">
                      <MoneyInput
                        hideLabel
                        label={`Cost for ${v.title}`}
                        currency={currency}
                        value={d.cost}
                        onChange={(cost) => {
                          set(v.id, { cost });
                        }}
                        error={e["cost"]}
                      />
                    </td>
                    <td className="py-2.5 pr-2">
                      <Input
                        size="sm"
                        aria-label={`SKU for ${v.title}`}
                        aria-invalid={e["sku"] ? true : undefined}
                        title={e["sku"]}
                        value={d.sku}
                        disabled={!canEdit}
                        onChange={(event) => {
                          set(v.id, { sku: event.currentTarget.value });
                        }}
                        className={cn("w-full min-w-0", e["sku"] && "border-danger-500")}
                      />
                    </td>
                    <td className="py-2.5 pr-2">
                      <Input
                        size="sm"
                        aria-label={`Barcode for ${v.title}`}
                        aria-invalid={e["barcode"] ? true : undefined}
                        title={e["barcode"]}
                        value={d.barcode}
                        disabled={!canEdit}
                        onChange={(event) => {
                          set(v.id, { barcode: event.currentTarget.value });
                        }}
                        className={cn("w-full min-w-0", e["barcode"] && "border-danger-500")}
                      />
                    </td>
                    <td className="py-2.5 pr-6 text-right text-body-sm tabular-nums text-ink-muted">
                      {v.tracked ? v.available.toLocaleString("en-IN") : "Not tracked"}
                    </td>
                  </tr>
                  {messages.length > 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="pb-2.5 pl-6 text-body-sm text-danger-700"
                        role="alert"
                      >
                        {v.title}: {messages.join(" ")}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phones: a card per variant. */}
      <ul className="divide-y divide-line md:hidden">
        {variants.map((v) => {
          const d = drafts[v.id] ?? draftOf(v);
          const e = errors[v.id] ?? {};
          return (
            <li key={v.id} className="space-y-3 px-5 py-4">
              <p className="flex items-center justify-between gap-2 text-body-sm font-medium text-ink">
                {v.title}
                <span className="text-caption font-normal text-ink-muted">
                  {v.tracked ? `${v.available.toLocaleString("en-IN")} in stock` : "Not tracked"}
                </span>
              </p>
              <fieldset disabled={!canEdit} className="grid grid-cols-2 gap-3">
                <MoneyInput
                  label="Price"
                  currency={currency}
                  value={d.price}
                  onChange={(price) => {
                    set(v.id, { price });
                  }}
                  error={e["price"]}
                />
                <MoneyInput
                  label="Compare at"
                  currency={currency}
                  value={d.compareAtPrice}
                  onChange={(compareAtPrice) => {
                    set(v.id, { compareAtPrice });
                  }}
                  error={e["compareAtPrice"]}
                />
                <Field label="SKU" error={e["sku"]}>
                  <Input
                    value={d.sku}
                    onChange={(event) => {
                      set(v.id, { sku: event.currentTarget.value });
                    }}
                  />
                </Field>
                <Field label="Barcode" error={e["barcode"]}>
                  <Input
                    value={d.barcode}
                    onChange={(event) => {
                      set(v.id, { barcode: event.currentTarget.value });
                    }}
                  />
                </Field>
              </fieldset>
            </li>
          );
        })}
      </ul>

      {canEdit ? (
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-3.5 sm:px-6">
          {message ? (
            <p
              role={message.ok ? "status" : "alert"}
              className={cn(
                "mr-auto text-body-sm",
                message.ok ? "text-success-700" : "text-danger-700",
              )}
            >
              {message.text}
            </p>
          ) : changed.length > 0 ? (
            <p className="mr-auto text-body-sm text-ink-muted">
              {changed.length} unsaved {changed.length === 1 ? "change" : "changes"}
            </p>
          ) : null}
          {changed.length > 0 ? (
            <Button
              variant="ghost"
              onClick={() => {
                setDrafts(Object.fromEntries(variants.map((v) => [v.id, draftOf(v)])));
                setErrors({});
              }}
            >
              Discard
            </Button>
          ) : null}
          <Button onClick={save} pending={pending} disabled={changed.length === 0}>
            Save variants
          </Button>
        </div>
      ) : null}
    </div>
  );
}

interface OptionDraft {
  readonly key: string;
  readonly id?: string | undefined;
  name: string;
  values: { key: string; id?: string | undefined; value: string }[];
}

let keySeq = 0;
const newKey = () => `k${String((keySeq += 1))}`;

function OptionsEditor({
  storeId,
  productId,
  options,
  variants,
  locale,
  onDone,
}: {
  storeId: string;
  productId: string;
  options: readonly EditorOption[];
  variants: readonly EditorVariant[];
  locale: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const noteVersion = useNoteVersion();
  const [drafts, setDrafts] = useState<OptionDraft[]>(() =>
    options.length > 0
      ? options.map((o) => ({
          key: newKey(),
          id: o.id,
          name: o.name,
          values: o.values.map((v) => ({ key: newKey(), id: v.id, value: v.value })),
        }))
      : [{ key: newKey(), name: "Size", values: [] }],
  );
  const [newValue, setNewValue] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [removals, setRemovals] = useState<readonly VariantRemoval[] | null>(null);
  const [pending, startTransition] = useTransition();

  const desired: DesiredOption[] = drafts.map((o) => ({
    id: o.id,
    name: o.name,
    values: o.values.map((v) => ({ id: v.id, value: v.value })),
  }));

  // The same plan the server will apply, previewed as you type.
  const preview = useMemo(() => {
    try {
      const plan = planOptionChange(
        options.map((o) => ({ id: o.id, name: o.name, values: o.values })),
        variants.map((v) => ({ id: v.id, values: v.optionValues })),
        desired,
      );
      return {
        ok: true as const,
        create: plan.create.length,
        remove: plan.remove.length,
        total: plan.keep.length + plan.create.length,
      };
    } catch (e) {
      return {
        ok: false as const,
        message: e instanceof OptionPlanError ? e.message : "Check the options.",
      };
    }
  }, [drafts, options, variants]);

  const update = (key: string, fn: (o: OptionDraft) => OptionDraft) => {
    setDrafts((current) => current.map((o) => (o.key === key ? fn(o) : o)));
    setError(null);
  };
  const addValue = (option: OptionDraft) => {
    const raw = (newValue[option.key] ?? "").trim();
    if (!raw) return;
    const parts = raw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    update(option.key, (o) => ({
      ...o,
      values: [
        ...o.values,
        ...parts
          .filter((p) => !o.values.some((v) => v.value.toLowerCase() === p.toLowerCase()))
          .map((p) => ({ key: newKey(), value: p })),
      ],
    }));
    setNewValue((n) => ({ ...n, [option.key]: "" }));
  };
  const moveOption = (index: number, delta: number) => {
    setDrafts((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (!item) return current;
      next.splice(index + delta, 0, item);
      return next;
    });
  };

  const submit = (confirm?: readonly string[]) => {
    startTransition(async () => {
      const result = await changeOptionsAction(storeId, productId, {
        options: desired,
        ...(confirm ? { confirmRemoveVariantIds: [...confirm] } : {}),
      });
      if (!result.ok) {
        setError(
          Object.values(result.fieldErrors ?? {})[0] ?? result.message ?? "That didn't save.",
        );
        return;
      }
      if (result.data.status === "confirmation_required") {
        setRemovals(result.data.removals);
        return;
      }
      setRemovals(null);
      noteVersion(new Date(result.data.updatedAt).toISOString());
      onDone();
      router.refresh();
    });
  };

  return (
    <div className="mt-4 space-y-4 border-y border-line bg-subtle px-5 py-5 sm:px-6">
      {drafts.map((option, index) => (
        <fieldset key={option.key} className="rounded-card border border-line bg-surface p-4">
          <legend className="sr-only">Option {index + 1}</legend>
          <div className="flex items-end gap-2">
            <Field label="Option name" className="min-w-0 flex-1">
              <Input
                value={option.name}
                placeholder="Size, Colour, Material"
                maxLength={255}
                onChange={(event) => {
                  const name = event.currentTarget.value;
                  update(option.key, (o) => ({ ...o, name }));
                }}
              />
            </Field>
            <IconButton
              icon={ArrowUp}
              aria-label={`Move option ${option.name || String(index + 1)} up`}
              disabled={index === 0}
              onClick={() => {
                moveOption(index, -1);
              }}
            />
            <IconButton
              icon={ArrowDown}
              aria-label={`Move option ${option.name || String(index + 1)} down`}
              disabled={index === drafts.length - 1}
              onClick={() => {
                moveOption(index, 1);
              }}
            />
            <IconButton
              icon={Trash2}
              aria-label={`Remove option ${option.name || String(index + 1)}`}
              onClick={() => {
                setDrafts((current) => current.filter((o) => o.key !== option.key));
              }}
            />
          </div>
          <div className="mt-3">
            <p className="mb-1.5 text-label font-medium text-ink" id={`${option.key}-values`}>
              Values
            </p>
            <ul aria-labelledby={`${option.key}-values`} className="flex flex-wrap gap-2">
              {option.values.map((value) => (
                <li
                  key={value.key}
                  className="flex items-center gap-1 rounded-pill border border-line bg-subtle py-0.5 pr-0.5 pl-2.5"
                >
                  <input
                    aria-label={`Value ${value.value}`}
                    value={value.value}
                    size={Math.max(value.value.length, 2)}
                    onChange={(event) => {
                      const text = event.currentTarget.value;
                      update(option.key, (o) => ({
                        ...o,
                        values: o.values.map((v) =>
                          v.key === value.key ? { ...v, value: text } : v,
                        ),
                      }));
                    }}
                    className="bg-transparent text-body-sm text-ink outline-none"
                  />
                  <IconButton
                    size="sm"
                    icon={X}
                    aria-label={`Remove value ${value.value}`}
                    onClick={() => {
                      update(option.key, (o) => ({
                        ...o,
                        values: o.values.filter((v) => v.key !== value.key),
                      }));
                    }}
                    className="size-6"
                  />
                </li>
              ))}
              <li>
                <input
                  aria-label={`Add a value to ${option.name || "this option"}`}
                  placeholder={option.values.length === 0 ? "S, M, L" : "Add value"}
                  value={newValue[option.key] ?? ""}
                  onChange={(event) => {
                    const text = event.currentTarget.value;
                    setNewValue((n) => ({ ...n, [option.key]: text }));
                  }}
                  onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      addValue(option);
                    }
                  }}
                  onBlur={() => {
                    addValue(option);
                  }}
                  className="h-8 w-32 rounded-pill border border-dashed border-line-strong bg-surface px-3 text-body-sm outline-none focus:border-brand-500"
                />
              </li>
            </ul>
          </div>
        </fieldset>
      ))}
      {drafts.length < OPTION_LIMITS.maxOptions ? (
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={Plus}
          onClick={() => {
            setDrafts((current) => [...current, { key: newKey(), name: "", values: [] }]);
          }}
        >
          Add another option
        </Button>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p
          className={cn("mr-auto text-body-sm", preview.ok ? "text-ink-muted" : "text-danger-700")}
          aria-live="polite"
        >
          {error ??
            (preview.ok
              ? `${String(preview.total)} ${preview.total === 1 ? "variant" : "variants"}${
                  preview.create ? `, ${String(preview.create)} new` : ""
                }${preview.remove ? `, ${String(preview.remove)} removed` : ""}.`
              : preview.message)}
        </p>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            submit();
          }}
          pending={pending}
          disabled={!preview.ok}
        >
          Save options
        </Button>
      </div>

      <Dialog
        role="alertdialog"
        open={removals !== null}
        onOpenChange={(open) => {
          if (!open) setRemovals(null);
        }}
        title={`Remove ${String(removals?.length ?? 0)} ${removals?.length === 1 ? "variant" : "variants"}?`}
        description="These combinations no longer exist with the new options. Check what they hold before removing them."
        size="lg"
      >
        <div className="max-h-[50vh] overflow-y-auto rounded-card border border-line">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-subtle text-caption text-ink-faint">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Variant
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  SKU
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Stock
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Price
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(removals ?? []).map((r) => (
                <tr key={r.variantId}>
                  <td className="px-3 py-2 text-ink">
                    {r.title}
                    {r.hasInventoryHistory ? (
                      <Badge size="sm" variant="outline" icon={History} className="ml-2">
                        Kept in stock history
                      </Badge>
                    ) : null}
                    {r.hasImage ? (
                      <span className="ml-2 text-caption text-ink-faint">has an image</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{r.sku ?? "—"}</td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      r.available !== 0 ? "font-medium text-warning-700" : "text-ink-muted",
                    )}
                  >
                    {r.available.toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                    {formatMoney(r.price, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(removals ?? []).some((r) => r.available !== 0) ? (
          <Alert tone="warning" className="mt-4">
            Some of these variants still have stock. Their stock history is kept, but they
            won&apos;t be sellable.
          </Alert>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Keep editing</Button>
          </DialogClose>
          <Button
            variant="danger"
            pending={pending}
            onClick={() => {
              submit((removals ?? []).map((r) => r.variantId));
            }}
          >
            Remove and save
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
