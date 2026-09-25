"use client";

import type { MediaView } from "@storevia/media";
import { Button } from "@storevia/ui/button";
import { cn } from "@storevia/ui/cn";
import { Field, Input, SearchInput } from "@storevia/ui/form";
import { Illustration } from "@storevia/ui/illustrations";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";
import { Alert, Badge, Card, EmptyState } from "@storevia/ui/surfaces";
import { ImagePlus, Upload } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  deleteMediaAction,
  listMediaAction,
  updateMediaAltAction,
} from "@/app/(app)/s/[storeId]/media/actions";
import { ACCEPT, uploadImage } from "./upload";

// The store's media library: every image uploaded to it, reusable across
// products. Uploads are cleaned and resized on the server; images still in
// use can't be deleted (remove them where they're used first).

const size = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;

export function MediaLibrary({
  storeId,
  initial,
  initialCursor,
  canManage,
}: {
  storeId: string;
  initial: readonly MediaView[];
  initialCursor: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(initialCursor);
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [uploading, setUploading] = useState<{ name: string; progress: number }[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<MediaView | null>(null);
  const [loading, startTransition] = useTransition();

  useEffect(() => {
    setItems(initial);
    setCursor(initialCursor);
  }, [initial, initialCursor]);

  useEffect(() => {
    if (query === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (query.trim()) next.set("q", query.trim());
      else next.delete("q");
      router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname, {
        scroll: false,
      });
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [query, params, pathname, router]);

  const upload = (files: FileList | File[]) => {
    const list = [...files].slice(0, 20);
    if (list.length === 0) return;
    setErrors([]);
    setUploading(list.map((f) => ({ name: f.name, progress: 0 })));
    void (async () => {
      const failed: string[] = [];
      for (const [i, file] of list.entries()) {
        const outcome = await uploadImage(storeId, file, (fraction) => {
          setUploading((current) =>
            current.map((u, j) => (j === i ? { ...u, progress: fraction } : u)),
          );
        });
        if (!outcome.ok) failed.push(outcome.message);
      }
      setUploading([]);
      setErrors(failed);
      router.refresh();
    })();
  };

  return (
    <>
      <Card
        className={cn("overflow-hidden", dragging && "ring-2 ring-brand-400")}
        onDragOver={(event) => {
          if (!canManage) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={(event) => {
          if (!canManage) return;
          event.preventDefault();
          setDragging(false);
          upload(event.dataTransfer.files);
        }}
      >
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3.5 sm:flex-row sm:items-center sm:px-6">
          <SearchInput
            aria-label="Search media"
            placeholder="Search by file name"
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
            }}
            onClear={() => {
              setQuery("");
            }}
            className="sm:max-w-80 sm:flex-1"
          />
          {canManage ? (
            <Button
              leadingIcon={Upload}
              onClick={() => input.current?.click()}
              className="sm:ml-auto"
            >
              Upload images
            </Button>
          ) : null}
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              if (event.currentTarget.files) upload(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
        </div>
        <div className="p-4 sm:p-6" aria-busy={uploading.length > 0 || undefined}>
          {errors.length > 0 ? (
            <Alert
              tone="danger"
              className="mb-4"
              onDismiss={() => {
                setErrors([]);
              }}
            >
              <ul className="space-y-1">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {uploading.length > 0 ? (
            <ul className="mb-4 space-y-2" aria-label="Uploads in progress">
              {uploading.map((u) => (
                <li key={u.name} className="flex items-center gap-3 text-body-sm">
                  <span className="min-w-0 flex-1 truncate text-ink-muted">{u.name}</span>
                  <progress
                    value={u.progress}
                    max={1}
                    aria-label={`Uploading ${u.name}`}
                    className="h-1.5 w-32"
                  />
                </li>
              ))}
            </ul>
          ) : null}
          {items.length === 0 ? (
            <EmptyState
              compact
              titleAs="h2"
              illustration={
                <Illustration name={query ? "empty-search" : "empty-content"} size="sm" />
              }
              title={query ? "No images match" : "No images yet"}
              description={
                query
                  ? "Try another file name."
                  : "Upload JPEG, PNG, WebP, GIF or AVIF images up to 20 MB. Drop them anywhere on this card."
              }
              action={
                canManage && !query ? (
                  <Button leadingIcon={ImagePlus} onClick={() => input.current?.click()}>
                    Upload images
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
              {items.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(m);
                    }}
                    className="group block w-full overflow-hidden rounded-card border border-line bg-surface text-left transition-shadow hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {m.thumbnailUrl ? (
                      <img
                        src={m.thumbnailUrl}
                        srcSet={m.srcSet}
                        sizes="(min-width: 1280px) 16vw, (min-width: 768px) 25vw, 50vw"
                        alt={m.altText ?? ""}
                        loading="lazy"
                        decoding="async"
                        className="aspect-square w-full bg-subtle object-cover"
                      />
                    ) : null}
                    <span className="block px-2.5 py-2">
                      <span className="block truncate text-caption font-medium text-ink">
                        {m.filename}
                      </span>
                      <span className="block truncate text-caption text-ink-faint">
                        {m.width && m.height ? `${String(m.width)} × ${String(m.height)} · ` : ""}
                        {m.productCount > 0
                          ? `${String(m.productCount)} ${m.productCount === 1 ? "product" : "products"}`
                          : "Unused"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {cursor ? (
            <div className="mt-6 flex justify-center">
              <Button
                variant="secondary"
                pending={loading}
                onClick={() => {
                  startTransition(async () => {
                    const q = params.get("q");
                    const result = await listMediaAction(storeId, {
                      ...(q ? { q } : {}),
                      before: cursor,
                    });
                    if (result.ok) {
                      setItems((current) => [...current, ...result.data.items]);
                      setCursor(result.data.nextCursor);
                    }
                  });
                }}
              >
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      </Card>
      {selected ? (
        <MediaDetails
          key={selected.id}
          storeId={storeId}
          media={selected}
          canManage={canManage}
          onClose={() => {
            setSelected(null);
          }}
          onChanged={() => {
            setSelected(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function MediaDetails({
  storeId,
  media,
  canManage,
  onClose,
  onChanged,
}: {
  storeId: string;
  media: MediaView;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [alt, setAlt] = useState(media.altText ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string | undefined }>) => {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.message ?? "That didn't work.");
      else onChanged();
    });
  };
  const largest = media.renditions.at(-1);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={media.filename}
      size="lg"
    >
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_16rem]">
        <img
          src={largest?.url ?? media.thumbnailUrl ?? ""}
          alt={media.altText ?? ""}
          className="max-h-[55vh] w-full rounded-card bg-subtle object-contain"
        />
        <div className="space-y-4">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <dl className="space-y-2 text-body-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">Size</dt>
              <dd className="text-ink tabular-nums">
                {media.width} × {media.height}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">Stored</dt>
              <dd className="text-ink tabular-nums">{size(media.storedBytes)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">Used by</dt>
              <dd className="text-ink">
                {media.productCount > 0 ? (
                  `${String(media.productCount)} ${media.productCount === 1 ? "product" : "products"}`
                ) : (
                  <Badge size="sm" variant="outline">
                    Unused
                  </Badge>
                )}
              </dd>
            </div>
          </dl>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => updateMediaAltAction(storeId, media.id, alt));
            }}
          >
            <Field label="Alt text" description="Describes the image for people who can't see it.">
              <Input
                value={alt}
                maxLength={512}
                disabled={!canManage}
                onChange={(event) => {
                  setAlt(event.currentTarget.value);
                }}
              />
            </Field>
            {canManage ? (
              <Button
                type="submit"
                size="sm"
                pending={pending}
                disabled={alt === (media.altText ?? "")}
              >
                Save alt text
              </Button>
            ) : null}
          </form>
        </div>
      </div>
      <DialogFooter>
        {canManage ? (
          <Button
            variant="danger-outline"
            className="mr-auto"
            pending={pending}
            onClick={() => {
              if (
                window.confirm(`Delete ${media.filename}? It can't be restored from the dashboard.`)
              ) {
                run(() => deleteMediaAction(storeId, media.id));
              }
            }}
          >
            Delete image
          </Button>
        ) : null}
        <DialogClose asChild>
          <Button variant="secondary">Close</Button>
        </DialogClose>
      </DialogFooter>
    </Dialog>
  );
}
