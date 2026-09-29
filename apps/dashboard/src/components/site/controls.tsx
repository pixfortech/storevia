"use client";

import { inputConstraints } from "@storevia/editor/document";
import type { PropertyControl } from "@storevia/editor/registry";
import { safeRichText } from "@storevia/editor/rich-text";
import { Button, IconButton } from "@storevia/ui/button";
import { Checkbox, RadioGroup, RadioItem, Switch } from "@storevia/ui/choice";
import { Field, Input, Select, Textarea } from "@storevia/ui/form";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { LazyRichTextEditor } from "@/components/catalogue/lazy-rich-text";
import {
  LinkField,
  MediaField,
  ProductSearch,
  type LinkValue,
  type MediaValue,
  type SiteOptions,
} from "./pickers";

// The settings panel: one control per declared editor control
// (ADR-0030 §3), so a new block needs no builder change. Controls produce
// plain values; the builder validates the whole document on every change
// (and the server on every save) and passes each problem back to the
// control it belongs to, keyed like the controls' paths ("cta.label",
// "items.1.title"). Inputs take their length and range limits from the
// block's schema.

type Props = Readonly<Record<string, unknown>>;

export interface ControlContext {
  readonly options: SiteOptions;
  /** Thumbnails for media ids the canvas has resolved. */
  readonly previews: Readonly<Record<string, string>>;
  /** Distinguishes editors of different sections (rich-text editors remount per section). */
  readonly sectionId: string;
  /** Problems by control path. */
  readonly errors: Readonly<Record<string, string>>;
  /** The block's props schema (for input limits). */
  readonly schema: unknown;
}

/** The problem shown at the control with this path, if any. */
function errorFor(context: ControlContext, path: string): string | undefined {
  return context.errors[path];
}

/** The wrapper "Show" finds a control by. */
function At({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div data-field={path} className="grid">
      {children}
    </div>
  );
}

function ControlError({ id, error }: { id: string; error: string | undefined }) {
  if (!error) return null;
  return (
    <p id={id} className="text-label font-normal text-danger-700">
      {error}
    </p>
  );
}

let itemKeys = 0;
const nextItemKey = () => `item-${String(++itemKeys)}`;

export function SettingsForm({
  controls,
  props,
  onChange,
  context,
}: {
  controls: readonly PropertyControl[];
  props: Props;
  onChange: (props: Props) => void;
  context: ControlContext;
}) {
  return (
    <div className="grid gap-5">
      {controls.map((control) => (
        <At key={control.prop} path={control.prop}>
          <Control
            control={control}
            value={props[control.prop]}
            onChange={(value) => {
              onChange({ ...props, [control.prop]: value });
            }}
            context={context}
            path={control.prop}
          />
        </At>
      ))}
    </div>
  );
}

function Control({
  control,
  value,
  onChange,
  context,
  path,
}: {
  control: PropertyControl;
  value: unknown;
  onChange: (value: unknown) => void;
  context: ControlContext;
  path: string;
}): ReactNode {
  const { options } = context;
  const error = errorFor(context, path);
  const limits = inputConstraints(context.schema, path);
  switch (control.kind) {
    case "text":
    case "email":
      return (
        <Field
          label={control.label}
          description={control.help}
          error={error}
          required={(limits.minLength ?? 0) > 0}
        >
          <Input
            type={control.kind === "email" ? "email" : "text"}
            maxLength={limits.maxLength}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => {
              onChange(e.target.value);
            }}
          />
        </Field>
      );
    case "textarea":
      return (
        <Field
          label={control.label}
          description={control.help}
          error={error}
          required={(limits.minLength ?? 0) > 0}
        >
          <Textarea
            rows={4}
            maxLength={limits.maxLength}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => {
              onChange(e.target.value);
            }}
          />
        </Field>
      );
    case "number": {
      const min = control.min ?? limits.min;
      const max = control.max ?? limits.max;
      return (
        <Field
          label={control.label}
          description={
            control.help ??
            (min !== undefined && max !== undefined
              ? `From ${String(min)} to ${String(max)}.`
              : undefined)
          }
          error={error}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={typeof value === "number" ? String(value) : ""}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(n)) onChange(n);
            }}
          />
        </Field>
      );
    }
    case "select": {
      const numeric = typeof value === "number";
      return (
        <Field label={control.label} description={control.help} error={error}>
          <Select
            value={
              typeof value === "number" ? String(value) : typeof value === "string" ? value : ""
            }
            onChange={(e) => {
              onChange(numeric ? Number(e.target.value) : e.target.value);
            }}
          >
            {(control.options ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      );
    }
    case "toggle":
      return (
        <div className="grid gap-1">
          <Switch
            label={control.label}
            checked={value === true}
            onCheckedChange={(checked) => {
              onChange(checked);
            }}
          />
          <ControlError id={`${context.sectionId}-${path}-error`} error={error} />
        </div>
      );
    case "richtext":
      return (
        <LazyRichTextEditor
          key={`${context.sectionId}:${path}`}
          name={`${context.sectionId}-${path}`}
          label={control.label}
          defaultValue={value ?? null}
          placeholder="Write here."
          error={error}
          onChange={(doc) => {
            onChange(safeRichText(doc));
          }}
        />
      );
    case "media": {
      const media = (value ?? null) as MediaValue | null;
      return (
        <MediaField
          label={control.label}
          value={media}
          preview={media ? (context.previews[media.mediaId] ?? null) : null}
          options={options}
          error={error}
          onChange={onChange}
        />
      );
    }
    case "link":
      return (
        <div className="grid gap-2">
          <LinkField
            label={control.label}
            value={(value ?? null) as LinkValue | null}
            options={options}
            error={error}
            onChange={onChange}
          />
          {value ? (
            <Button
              size="sm"
              variant="ghost"
              className="justify-self-start"
              onClick={() => {
                onChange(null);
              }}
            >
              Remove link
            </Button>
          ) : null}
        </div>
      );
    case "action":
      return (
        <ActionControl
          control={control}
          value={value}
          onChange={onChange}
          context={context}
          path={path}
        />
      );
    case "items":
      return (
        <ItemsControl
          control={control}
          value={value}
          onChange={onChange}
          context={context}
          path={path}
        />
      );
    case "collections":
      return (
        <div className="grid gap-1">
          <CollectionsControl
            control={control}
            value={value}
            onChange={onChange}
            options={options}
          />
          <ControlError id={`${context.sectionId}-${path}-error`} error={error} />
        </div>
      );
    case "product-source":
      return (
        <div className="grid gap-1">
          <ProductSourceControl
            control={control}
            value={value}
            onChange={onChange}
            options={options}
          />
          <ControlError id={`${context.sectionId}-${path}-error`} error={error} />
        </div>
      );
  }
}

function ActionControl({
  control,
  value,
  onChange,
  context,
  path,
}: {
  control: PropertyControl;
  value: unknown;
  onChange: (value: unknown) => void;
  context: ControlContext;
  path: string;
}) {
  const { options } = context;
  const action = value as { label: string; link: LinkValue } | null | undefined;
  const error = errorFor(context, path);
  if (!action) {
    return (
      <div className="grid gap-2">
        <span className="text-label text-ink">{control.label}</span>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={Plus}
          className="justify-self-start"
          onClick={() => {
            onChange({ label: "Learn more", link: { type: "home" } });
          }}
        >
          Add {control.label.toLowerCase()}
        </Button>
        <ControlError id={`${context.sectionId}-${path}-error`} error={error} />
      </div>
    );
  }
  const labelLimits = inputConstraints(context.schema, `${path}.label`);
  return (
    <fieldset className="grid gap-3 rounded-control border border-line p-3">
      <legend className="px-1 text-label text-ink">{control.label}</legend>
      <ControlError id={`${context.sectionId}-${path}-error`} error={error} />
      <At path={`${path}.label`}>
        <Field
          label="Button text"
          error={errorFor(context, `${path}.label`)}
          required={(labelLimits.minLength ?? 0) > 0}
        >
          <Input
            value={action.label}
            maxLength={labelLimits.maxLength ?? 80}
            onChange={(e) => {
              onChange({ ...action, label: e.target.value });
            }}
          />
        </Field>
      </At>
      <At path={`${path}.link`}>
        <LinkField
          label="Goes to"
          value={action.link}
          options={options}
          error={errorFor(context, `${path}.link`)}
          onChange={(link) => {
            onChange({ ...action, link });
          }}
        />
      </At>
      <Button
        size="sm"
        variant="ghost"
        className="justify-self-start"
        onClick={() => {
          onChange(null);
        }}
      >
        Remove {control.label.toLowerCase()}
      </Button>
    </fieldset>
  );
}

function ItemsControl({
  control,
  value,
  onChange,
  context,
  path,
}: {
  control: PropertyControl;
  value: unknown;
  onChange: (value: unknown) => void;
  context: ControlContext;
  path: string;
}) {
  const items = (Array.isArray(value) ? value : []) as Props[];
  const max = control.maxItems ?? 12;
  const labelKey = control.itemLabel;
  // Items have no ids of their own (the stored shape is fixed), so each gets
  // a key here that follows it through moves and removals: a control's own
  // state (a picked image, a typed address) stays with its item. The form
  // is remounted per section, so the list only changes through this control.
  const [keys, setKeys] = useState<readonly string[]>(() => items.map(nextItemKey));
  const keyAt = (index: number) =>
    keys.length === items.length ? (keys[index] ?? `at-${String(index)}`) : `at-${String(index)}`;
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const reorder = <T,>(list: readonly T[]) => {
      const next = [...list];
      const [moved] = next.splice(from, 1);
      if (moved !== undefined) next.splice(to, 0, moved);
      return next;
    };
    setKeys(reorder(keys));
    onChange(reorder(items));
  };
  const error = errorFor(context, path);
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-label text-ink">
        {control.label}{" "}
        <span className="font-normal text-ink-faint">
          {items.length} of {max}
        </span>
      </legend>
      {control.help ? <p className="text-caption text-ink-muted">{control.help}</p> : null}
      <ControlError id={`${context.sectionId}-${path}-error`} error={error} />
      {items.map((item, index) => {
        const own = labelKey ? item[labelKey] : undefined;
        const name =
          typeof own === "string" && own.trim() !== ""
            ? own
            : `${control.label} ${String(index + 1)}`;
        return (
          <div key={keyAt(index)} className="grid gap-3 rounded-control border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-body-sm font-medium text-ink">{name}</span>
              <div className="flex shrink-0 gap-1">
                <IconButton
                  size="sm"
                  icon={ArrowUp}
                  aria-label={`Move ${name} up`}
                  disabled={index === 0}
                  onClick={() => {
                    move(index, index - 1);
                  }}
                />
                <IconButton
                  size="sm"
                  icon={ArrowDown}
                  aria-label={`Move ${name} down`}
                  disabled={index === items.length - 1}
                  onClick={() => {
                    move(index, index + 1);
                  }}
                />
                <IconButton
                  size="sm"
                  icon={Trash2}
                  aria-label={`Remove ${name}`}
                  onClick={() => {
                    setKeys(keys.filter((_, i) => i !== index));
                    onChange(items.filter((_, i) => i !== index));
                  }}
                />
              </div>
            </div>
            {(control.fields ?? []).map((field) => {
              const fieldPath = `${path}.${String(index)}.${field.prop}`;
              return (
                <At key={field.prop} path={fieldPath}>
                  <Control
                    control={field}
                    value={item[field.prop]}
                    onChange={(fieldValue) => {
                      onChange(
                        items.map((it, i) =>
                          i === index ? { ...it, [field.prop]: fieldValue } : it,
                        ),
                      );
                    }}
                    context={context}
                    path={fieldPath}
                  />
                </At>
              );
            })}
          </div>
        );
      })}
      <Button
        size="sm"
        variant="secondary"
        leadingIcon={Plus}
        className="justify-self-start"
        disabled={items.length >= max}
        onClick={() => {
          setKeys([...keys, nextItemKey()]);
          onChange([...items, { ...(control.itemDefaults ?? {}) }]);
        }}
      >
        Add {control.itemLabel === "question" ? "question" : "item"}
      </Button>
    </fieldset>
  );
}

function CollectionsControl({
  control,
  value,
  onChange,
  options,
}: {
  control: PropertyControl;
  value: unknown;
  onChange: (value: unknown) => void;
  options: SiteOptions;
}) {
  const source = (value ?? { type: "all" }) as
    { type: "all" } | { type: "collections"; ids: string[] };
  const ids = source.type === "collections" ? source.ids : [];
  const name = useId();
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-label text-ink">{control.label}</legend>
      <RadioGroup
        name={name}
        value={source.type}
        onValueChange={(next) => {
          onChange(
            next === "all"
              ? { type: "all" }
              : {
                  type: "collections",
                  ids: ids.length > 0 ? ids : options.collections.slice(0, 1).map((c) => c.id),
                },
          );
        }}
      >
        <RadioItem value="all" label="All collections with products" />
        <RadioItem
          value="collections"
          label="Choose collections"
          disabled={options.collections.length === 0}
        />
      </RadioGroup>
      {source.type === "collections" ? (
        <div className="grid max-h-48 gap-1 overflow-y-auto pl-1">
          {options.collections.map((c) => (
            <Checkbox
              key={c.id}
              label={c.title}
              checked={ids.includes(c.id)}
              onCheckedChange={(checked) => {
                const next = checked === true ? [...ids, c.id] : ids.filter((id) => id !== c.id);
                if (next.length > 0) onChange({ type: "collections", ids: next });
              }}
            />
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}

function ProductSourceControl({
  control,
  value,
  onChange,
  options,
}: {
  control: PropertyControl;
  value: unknown;
  onChange: (value: unknown) => void;
  options: SiteOptions;
}) {
  const source = (value ?? { type: "catalogue" }) as
    | { type: "catalogue" }
    | { type: "collection"; id: string }
    | { type: "products"; ids: string[] };
  const name = useId();
  const chosen = source.type === "products" ? source.ids : [];
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-label text-ink">{control.label}</legend>
      <RadioGroup
        name={name}
        value={source.type}
        onValueChange={(next) => {
          if (next === "catalogue") onChange({ type: "catalogue" });
          else if (next === "collection") {
            const first = options.collections[0];
            if (first) onChange({ type: "collection", id: first.id });
          } else if (chosen.length > 0) onChange({ type: "products", ids: chosen });
          else onChange({ type: "products", ids: [] });
        }}
      >
        <RadioItem value="catalogue" label="Newest products" />
        <RadioItem
          value="collection"
          label="From a collection"
          disabled={options.collections.length === 0}
        />
        <RadioItem value="products" label="Choose products" />
      </RadioGroup>
      {source.type === "collection" ? (
        <Field label="Collection">
          <Select
            size="sm"
            value={source.id}
            onChange={(e) => {
              onChange({ type: "collection", id: e.target.value });
            }}
          >
            {options.collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {source.type === "products" ? (
        <div className="grid gap-2">
          <ul className="grid gap-1" aria-label="Chosen products">
            {chosen.map((id) => (
              <li key={id} className="flex items-center justify-between gap-2 text-body-sm">
                <span className="truncate">{options.names[id] ?? "Product"}</span>
                <IconButton
                  size="sm"
                  icon={Trash2}
                  aria-label={`Remove ${options.names[id] ?? "product"}`}
                  onClick={() => {
                    onChange({ type: "products", ids: chosen.filter((x) => x !== id) });
                  }}
                />
              </li>
            ))}
          </ul>
          <ProductSearch
            storeId={options.storeId}
            label="Add products"
            chosen={chosen.map((id) => ({ id, title: options.names[id] ?? "Product" }))}
            onChoose={(product) => {
              if (!chosen.includes(product.id) && chosen.length < 48) {
                options.rememberName(product.id, product.title);
                onChange({ type: "products", ids: [...chosen, product.id] });
              }
            }}
          />
        </div>
      ) : null}
    </fieldset>
  );
}
