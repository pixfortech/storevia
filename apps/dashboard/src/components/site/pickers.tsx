"use client";

import { Button } from "@storevia/ui/button";
import { cn } from "@storevia/ui/cn";
import { Field, Input, SearchInput, Select } from "@storevia/ui/form";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";
import { Alert, EmptyState } from "@storevia/ui/surfaces";
import { ImagePlus, Upload } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  mediaOptionsAction,
  searchProductsAction,
  type PickerImage,
  type PickerOption,
} from "@/app/(app)/s/[storeId]/website/actions";
import { ACCEPT, uploadImage } from "@/components/catalogue/upload";

// Pickers for block settings: images from the store's own media library
// (upload goes through the one media pipeline), and typed links to pages,
// products, collections or a checked web address. They produce ids only;
// the server checks every id belongs to this store when the page is saved.

export interface SiteOptions {
  readonly storeId: string;
  readonly pages: readonly PickerOption[];
  readonly collections: readonly PickerOption[];
  readonly hasCatalogue: boolean;
  readonly canUpload: boolean;
  /** Names for ids already in the document (products chosen earlier, etc.). */
  readonly names: Readonly<Record<string, string>>;
  readonly rememberName: (id: string, title: string) => void;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export function MediaPickerDialog({
  storeId,
  canUpload,
  open,
  onOpenChange,
  onPick,
}: {
  storeId: string;
  canUpload: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (image: PickerImage) => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<readonly PickerImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void mediaOptionsAction(storeId, query).then((result) => {
        if (cancelled) return;
        if (result.ok) setItems(result.data);
        else setError(result.message ?? "Couldn't load your images.");
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, storeId]);

  async function upload(files: FileList | null) {
    const chosen = files?.[0];
    if (!chosen) return;
    setUploading(true);
    setError(null);
    const outcome = await uploadImage(storeId, chosen);
    setUploading(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    const src = outcome.media.thumbnailUrl;
    if (!src) {
      setError(`${chosen.name}: the image is still being processed. Try again in a moment.`);
      return;
    }
    onPick({
      id: outcome.media.id,
      filename: outcome.media.filename,
      alt: outcome.media.altText ?? "",
      src,
    });
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Choose an image"
      description="Images from your media library. Uploads are cleaned and resized on the server."
      footer={
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          {canUpload ? (
            <>
              <input
                ref={file}
                type="file"
                accept={ACCEPT}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  void upload(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                leadingIcon={Upload}
                pending={uploading}
                onClick={() => file.current?.click()}
              >
                Upload
              </Button>
            </>
          ) : null}
        </DialogFooter>
      }
    >
      <div className="grid gap-4">
        <SearchInput
          aria-label="Search images"
          placeholder="Search by file name"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {items === null ? (
          <p className="text-body-sm text-ink-muted" role="status">
            Loading images…
          </p>
        ) : items.length === 0 ? (
          <EmptyState
            compact
            icon={<ImagePlus className="size-5" aria-hidden="true" />}
            title={query ? "No images match" : "No images yet"}
            description={
              canUpload
                ? "Upload one to use it here."
                : "Ask someone who manages media to upload one."
            }
          />
        ) : (
          <ul
            className="grid max-h-[26rem] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4"
            aria-label="Images"
          >
            {items.map((image) => (
              <li key={image.id}>
                <button
                  type="button"
                  className="group block w-full overflow-hidden rounded-control border border-line text-left focus-visible:outline-2 focus-visible:outline-focus"
                  onClick={() => {
                    onPick(image);
                    onOpenChange(false);
                  }}
                >
                  <img
                    src={image.src}
                    alt=""
                    className="aspect-square w-full bg-subtle object-cover group-hover:opacity-90"
                  />
                  <span className="block truncate px-2 py-1 text-caption text-ink-muted">
                    <span className="sr-only">Choose </span>
                    {image.filename}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

export interface MediaValue {
  readonly mediaId: string;
  readonly alt?: string;
}

export function MediaField({
  label,
  value,
  preview,
  options,
  error,
  onChange,
}: {
  label: string;
  value: MediaValue | null;
  /** A thumbnail for the current image, when known. */
  preview: string | null;
  options: SiteOptions;
  error?: string | undefined;
  onChange: (value: MediaValue | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const altId = useId();
  const errorId = useId();
  const src = picked ?? preview;
  return (
    <div className="grid gap-2">
      <span className="text-label text-ink">{label}</span>
      {error ? (
        <p id={errorId} className="text-label font-normal text-danger-700">
          {error}
        </p>
      ) : null}
      {value ? (
        <div className="flex items-start gap-3">
          <div className="size-16 shrink-0 overflow-hidden rounded-control border border-line bg-subtle">
            {src ? <img src={src} alt="" className="size-full object-cover" /> : null}
          </div>
          <div className="grid min-w-0 flex-1 gap-2">
            <label htmlFor={altId} className="text-caption text-ink-muted">
              Alternative text (read aloud in place of the image)
            </label>
            <Input
              id={altId}
              size="sm"
              maxLength={512}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              value={value.alt ?? ""}
              onChange={(e) => {
                onChange(
                  e.target.value
                    ? { mediaId: value.mediaId, alt: e.target.value }
                    : { mediaId: value.mediaId },
                );
              }}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setOpen(true);
                }}
              >
                Replace
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  onChange(null);
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={ImagePlus}
          onClick={() => {
            setOpen(true);
          }}
        >
          Choose image
        </Button>
      )}
      <MediaPickerDialog
        storeId={options.storeId}
        canUpload={options.canUpload}
        open={open}
        onOpenChange={setOpen}
        onPick={(image) => {
          setPicked(image.src);
          onChange(image.alt ? { mediaId: image.id, alt: image.alt } : { mediaId: image.id });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export type LinkValue =
  | { readonly type: "url"; readonly href: string }
  | { readonly type: "home" | "search" | "cart" }
  | { readonly type: "page" | "product" | "collection"; readonly id: string };

const SAFE_URL = /^(https?:\/\/[^\s]+|mailto:[^\s]+|tel:\+?[0-9() -]{3,32})$/i;

/** The link's own options, for the kinds this store has. */
function kinds(options: SiteOptions) {
  return [
    { value: "home", label: "Home page" },
    { value: "page", label: "Page" },
    ...(options.hasCatalogue
      ? [
          { value: "collection", label: "Collection" },
          { value: "product", label: "Product" },
          { value: "search", label: "All products" },
          { value: "cart", label: "Cart" },
        ]
      : []),
    { value: "url", label: "Web address" },
  ];
}

export function LinkField({
  label,
  value,
  options,
  error,
  onChange,
}: {
  label: string;
  value: LinkValue | null;
  options: SiteOptions;
  /** A problem with the link (e.g. "Choose a product."). */
  error?: string | undefined;
  onChange: (value: LinkValue) => void;
}) {
  const typeId = useId();
  const errorId = useId();
  const invalid = error
    ? ({ "aria-invalid": true, "aria-describedby": errorId } as const)
    : ({} as const);
  const [href, setHref] = useState(value?.type === "url" ? value.href : "https://");
  const hrefValid = SAFE_URL.test(href.trim());
  const type = value?.type ?? "home";
  const id = value && "id" in value ? value.id : "";
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-label text-ink">{label}</legend>
      <label htmlFor={typeId} className="sr-only">
        {label}: link to
      </label>
      <Select
        id={typeId}
        size="sm"
        {...invalid}
        value={type}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "home" || next === "search" || next === "cart") onChange({ type: next });
          else if (next === "url") onChange({ type: "url", href: href.trim() });
          else {
            const first =
              next === "page"
                ? options.pages[0]
                : next === "collection"
                  ? options.collections[0]
                  : undefined;
            onChange({ type: next as "page" | "product" | "collection", id: first?.id ?? "" });
          }
        }}
      >
        {kinds(options).map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </Select>
      {type === "url" ? (
        <Field
          label="Web address"
          error={hrefValid ? undefined : "Use an address starting with https://, mailto: or tel:."}
        >
          <Input
            size="sm"
            inputMode="url"
            value={href}
            maxLength={2048}
            onChange={(e) => {
              setHref(e.target.value);
              if (SAFE_URL.test(e.target.value.trim()))
                onChange({ type: "url", href: e.target.value.trim() });
            }}
          />
        </Field>
      ) : null}
      {type === "page" || type === "collection" ? (
        <Field label={type === "page" ? "Page" : "Collection"}>
          <Select
            size="sm"
            {...invalid}
            value={id}
            onChange={(e) => {
              onChange({ type, id: e.target.value });
            }}
          >
            {id === "" ? <option value="">Choose…</option> : null}
            {(type === "page" ? options.pages : options.collections).map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {type === "product" ? (
        <ProductSearch
          storeId={options.storeId}
          label="Product"
          chosen={id ? [{ id, title: options.names[id] ?? "Chosen product" }] : []}
          invalid={invalid}
          onChoose={(product) => {
            options.rememberName(product.id, product.title);
            onChange({ type: "product", id: product.id });
          }}
        />
      ) : null}
      {error ? (
        <p id={errorId} className="text-label font-normal text-danger-700">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export function ProductSearch({
  storeId,
  label,
  chosen,
  invalid,
  onChoose,
}: {
  storeId: string;
  label: string;
  chosen: readonly PickerOption[];
  /** aria-invalid/aria-describedby for the search box when the choice has a problem. */
  invalid?: Readonly<Record<string, unknown>>;
  onChoose: (product: PickerOption) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly PickerOption[]>([]);
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchProductsAction(storeId, query).then((result) => {
        if (!cancelled && result.ok) setResults(result.data);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, storeId]);
  return (
    <div className="grid gap-2">
      {chosen.length > 0 ? (
        <p className="text-body-sm text-ink">
          {chosen.length === 1
            ? `Chosen: ${chosen[0]?.title ?? ""}`
            : `${String(chosen.length)} chosen`}
        </p>
      ) : null}
      <SearchInput
        {...invalid}
        aria-label={`${label}: search products`}
        placeholder="Search products"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
      />
      {results.length > 0 ? (
        <ul className="grid max-h-48 gap-1 overflow-y-auto" aria-label="Matching products">
          {results.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                className={cn(
                  "w-full rounded-control px-2 py-1.5 text-left text-body-sm hover:bg-subtle focus-visible:outline-2 focus-visible:outline-focus",
                  chosen.some((c) => c.id === product.id) && "font-medium text-brand-700",
                )}
                onClick={() => {
                  onChoose(product);
                }}
              >
                {product.title}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
