"use client";

import type { MediaView } from "@storevia/media";
import { Button, IconButton } from "@storevia/ui/button";
import { Checkbox } from "@storevia/ui/choice";
import { cn } from "@storevia/ui/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@storevia/ui/dropdown-menu";
import { Field, Input } from "@storevia/ui/form";
import { Icon } from "@storevia/ui/icons";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";
import { Alert, Badge, Card, CardHeader } from "@storevia/ui/surfaces";
import {
  ArrowLeft,
  ArrowRight,
  ImageOff,
  ImagePlus,
  Images,
  MoreHorizontal,
  Star,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  attachMediaAction,
  detachMediaAction,
  reorderMediaAction,
  setMediaAltAction,
} from "@/app/(app)/s/[storeId]/products/actions";
import { listMediaAction } from "@/app/(app)/s/[storeId]/media/actions";
import { ACCEPT, uploadImage } from "../upload";
import type { EditorImage } from "./types";
import { useNoteVersion } from "./version";

// A product's images: upload (drop or pick), reuse from the library,
// reorder, choose the primary image (the first), edit alt text for this
// product, and remove (the image stays in the library).

interface Pending {
  readonly key: string;
  readonly name: string;
  progress: number;
}

export function MediaCard({
  storeId,
  productId,
  productTitle,
  media,
  canEdit,
  canUpload,
}: {
  storeId: string;
  productId: string;
  productTitle: string;
  media: readonly EditorImage[];
  canEdit: boolean;
  canUpload: boolean;
}) {
  const router = useRouter();
  const noteVersion = useNoteVersion();
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Pending[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const ids = media.map((m) => m.mediaId);

  const upload = (files: FileList | File[]) => {
    const list = [...files].slice(0, 20);
    if (list.length === 0) return;
    setErrors([]);
    const queued = list.map((file, i) => ({
      key: `${String(Date.now())}-${String(i)}`,
      name: file.name,
      progress: 0,
    }));
    setUploads((current) => [...current, ...queued]);
    void (async () => {
      const done: string[] = [];
      const failed: string[] = [];
      for (const [i, file] of list.entries()) {
        const key = queued[i]?.key ?? "";
        const outcome = await uploadImage(storeId, file, (fraction) => {
          setUploads((current) =>
            current.map((u) => (u.key === key ? { ...u, progress: fraction } : u)),
          );
        });
        if (outcome.ok) done.push(outcome.media.id);
        else failed.push(outcome.message);
        setUploads((current) => current.filter((u) => u.key !== key));
      }
      if (done.length > 0) {
        const attached = await attachMediaAction(storeId, productId, done);
        if (!attached.ok)
          failed.push(attached.message ?? "The images couldn't be added to this product.");
      }
      setErrors(failed);
      router.refresh();
    })();
  };

  const run = (
    fn: () => Promise<{ ok: boolean; message?: string | undefined; data?: { updatedAt: string } }>,
  ) => {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setErrors([result.message ?? "That didn't work."]);
      else {
        setErrors([]);
        if (result.data) noteVersion(result.data.updatedAt);
      }
      router.refresh();
    });
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length) return;
    const next = [...ids];
    const [item] = next.splice(from, 1);
    if (item === undefined) return;
    next.splice(to, 0, item);
    run(() => reorderMediaAction(storeId, productId, next));
  };

  const editable = canEdit;
  return (
    <Card
      onDragOver={(event) => {
        if (!editable || !canUpload) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => {
        setDragging(false);
      }}
      onDrop={(event) => {
        if (!editable || !canUpload) return;
        event.preventDefault();
        setDragging(false);
        upload(event.dataTransfer.files);
      }}
      className={cn(dragging && "ring-2 ring-brand-400")}
    >
      <CardHeader
        divider={false}
        title="Media"
        description="The first image is the primary one."
        actions={
          editable ? (
            <span className="flex gap-2">
              <LibraryPicker
                storeId={storeId}
                exclude={ids}
                onPick={(picked) => {
                  run(() => attachMediaAction(storeId, productId, picked));
                }}
              />
              {canUpload ? (
                <Button
                  size="sm"
                  variant="secondary"
                  leadingIcon={Upload}
                  onClick={() => input.current?.click()}
                >
                  Upload
                </Button>
              ) : null}
            </span>
          ) : undefined
        }
      />
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
      <div
        className="px-5 pt-4 pb-5 sm:px-6 sm:pb-6"
        aria-busy={busy || uploads.length > 0 || undefined}
      >
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
        {media.length === 0 && uploads.length === 0 ? (
          <button
            type="button"
            disabled={!editable || !canUpload}
            onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-subtle px-6 py-10 text-center transition-colors enabled:hover:border-brand-400 enabled:hover:bg-brand-25 disabled:cursor-default"
          >
            <Icon icon={ImagePlus} size="lg" className="text-ink-faint" />
            <span className="text-body-sm font-medium text-ink">
              {editable && canUpload ? "Add images" : "No images yet"}
            </span>
            {editable && canUpload ? (
              <span className="text-caption text-ink-faint">
                Drop JPEG, PNG, WebP, GIF or AVIF files here, up to 20 MB each.
              </span>
            ) : null}
          </button>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {media.map((image, index) => (
              <li
                key={image.mediaId}
                className={cn(
                  "group relative overflow-hidden rounded-card border border-line bg-subtle",
                  index === 0 && "sm:col-span-2 sm:row-span-2",
                )}
              >
                {image.src ? (
                  <img
                    src={image.src}
                    srcSet={image.srcSet}
                    sizes={index === 0 ? "(min-width: 640px) 320px, 50vw" : "160px"}
                    alt={image.altText ?? ""}
                    loading="lazy"
                    decoding="async"
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div
                    role="img"
                    aria-label={`${image.filename}: preview unavailable`}
                    className="flex aspect-square w-full flex-col items-center justify-center gap-2 p-3 text-center text-caption text-ink-muted"
                  >
                    <Icon icon={ImageOff} size="lg" />
                    Preview unavailable
                  </div>
                )}
                {index === 0 ? (
                  <Badge size="sm" className="absolute top-2 left-2" icon={Star}>
                    Primary
                  </Badge>
                ) : null}
                {!image.altText ? (
                  <Badge size="sm" tone="warning" className="absolute bottom-2 left-2">
                    No alt text
                  </Badge>
                ) : null}
                {editable ? (
                  <div className="absolute top-2 right-2">
                    <ImageMenu
                      image={image}
                      index={index}
                      count={media.length}
                      productTitle={productTitle}
                      onMove={move}
                      onAlt={(alt) => {
                        run(() => setMediaAltAction(storeId, productId, image.mediaId, alt));
                      }}
                      onRemove={() => {
                        run(() => detachMediaAction(storeId, productId, image.mediaId));
                      }}
                    />
                  </div>
                ) : null}
              </li>
            ))}
            {uploads.map((u) => (
              <li
                key={u.key}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong bg-subtle p-3 text-center"
              >
                <span className="w-full truncate text-caption text-ink-muted">{u.name}</span>
                <progress
                  value={u.progress}
                  max={1}
                  aria-label={`Uploading ${u.name}`}
                  className="h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-brand-600"
                />
                <span className="text-caption text-ink-faint">
                  {u.progress < 1 ? "Uploading…" : "Processing…"}
                </span>
              </li>
            ))}
            {editable && canUpload ? (
              <li>
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-line-strong text-caption text-ink-muted transition-colors hover:border-brand-400 hover:bg-brand-25 hover:text-brand-700"
                >
                  <Icon icon={ImagePlus} size="md" />
                  Add
                </button>
              </li>
            ) : null}
          </ul>
        )}
        {editable && canUpload ? (
          <p className="mt-3 text-caption text-ink-faint">
            JPEG, PNG, WebP, GIF or AVIF up to 20 MB. Location and camera data is removed and sizes
            for every screen are made automatically.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function ImageMenu({
  image,
  index,
  count,
  productTitle,
  onMove,
  onAlt,
  onRemove,
}: {
  image: EditorImage;
  index: number;
  count: number;
  productTitle: string;
  onMove: (from: number, to: number) => void;
  onAlt: (alt: string) => void;
  onRemove: () => void;
}) {
  const [altOpen, setAltOpen] = useState(false);
  const [alt, setAlt] = useState(image.altText ?? "");
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            size="sm"
            variant="secondary"
            icon={MoreHorizontal}
            aria-label={`Options for image ${String(index + 1)}${image.altText ? ` (${image.altText})` : ""}`}
            className="shadow-sm"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {index > 0 ? (
            <DropdownMenuItem
              icon={Star}
              onSelect={() => {
                onMove(index, 0);
              }}
            >
              Make primary
            </DropdownMenuItem>
          ) : null}
          {index > 0 ? (
            <DropdownMenuItem
              icon={ArrowLeft}
              onSelect={() => {
                onMove(index, index - 1);
              }}
            >
              Move earlier
            </DropdownMenuItem>
          ) : null}
          {index < count - 1 ? (
            <DropdownMenuItem
              icon={ArrowRight}
              onSelect={() => {
                onMove(index, index + 1);
              }}
            >
              Move later
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            icon={Type}
            onSelect={() => {
              setAlt(image.altText ?? "");
              setAltOpen(true);
            }}
          >
            Edit alt text
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={Trash2} onSelect={onRemove}>
            Remove from product
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={altOpen}
        onOpenChange={setAltOpen}
        title="Alt text"
        description="Describe the image for people who can't see it. Shown with this product only."
        size="sm"
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            onAlt(alt);
            setAltOpen(false);
          }}
        >
          {image.src ? (
            <img
              src={image.src}
              alt=""
              className="max-h-48 w-full rounded-control object-contain"
            />
          ) : null}
          <Field label="Alt text" description={`For example: "${productTitle} in blue, folded".`}>
            <Input
              value={alt}
              maxLength={512}
              onChange={(event) => {
                setAlt(event.currentTarget.value);
              }}
              autoFocus
            />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}

/** Pick images already in the store's library (reuse without re-uploading). */
function LibraryPicker({
  storeId,
  exclude,
  onPick,
}: {
  storeId: string;
  exclude: readonly string[];
  onPick: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<readonly MediaView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, startTransition] = useTransition();

  const load = (before?: string) => {
    startTransition(async () => {
      const result = await listMediaAction(storeId, before ? { before } : {});
      if (!result.ok) {
        setError(result.message ?? "The library couldn't be loaded.");
        return;
      }
      setItems((current) => [...(before ? (current ?? []) : []), ...result.data.items]);
      setCursor(result.data.nextCursor);
    });
  };

  const available = (items ?? []).filter((m) => !exclude.includes(m.id));
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setPicked(new Set());
          load();
        }
      }}
      size="lg"
      title="Choose from library"
      description="Images you've uploaded to this store."
      trigger={
        <Button size="sm" variant="ghost" leadingIcon={Images}>
          Library
        </Button>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {items === null ? (
          <p className="py-8 text-center text-body-sm text-ink-muted">Loading…</p>
        ) : available.length === 0 ? (
          <p className="py-8 text-center text-body-sm text-ink-muted">
            No other images in the library yet. Upload some from here or the Media page.
          </p>
        ) : (
          <ul className="grid max-h-[55vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
            {available.map((m) => {
              const on = picked.has(m.id);
              return (
                <li
                  key={m.id}
                  className={cn(
                    "relative rounded-card border bg-subtle",
                    on ? "border-brand-500 ring-2 ring-brand-200" : "border-line",
                  )}
                >
                  <label className="block cursor-pointer">
                    {m.thumbnailUrl ? (
                      <img
                        src={m.thumbnailUrl}
                        alt={m.altText ?? ""}
                        loading="lazy"
                        className="aspect-square w-full rounded-card object-cover"
                      />
                    ) : null}
                    <span className="absolute top-2 left-2 rounded-xs bg-surface/90 p-0.5">
                      <Checkbox
                        aria-label={`Choose ${m.filename}`}
                        checked={on}
                        onCheckedChange={(value) => {
                          setPicked((current) => {
                            const next = new Set(current);
                            if (value === true) next.add(m.id);
                            else next.delete(m.id);
                            return next;
                          });
                        }}
                      />
                    </span>
                    <span className="block truncate px-2 py-1 text-caption text-ink-muted">
                      {m.filename}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {cursor ? (
          <Button
            variant="ghost"
            size="sm"
            pending={loading}
            onClick={() => {
              load(cursor);
            }}
          >
            Load more
          </Button>
        ) : null}
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary">Cancel</Button>
        </DialogClose>
        <Button
          disabled={picked.size === 0}
          onClick={() => {
            onPick([...picked]);
            setOpen(false);
          }}
        >
          Add {picked.size > 0 ? String(picked.size) : ""} {picked.size === 1 ? "image" : "images"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
