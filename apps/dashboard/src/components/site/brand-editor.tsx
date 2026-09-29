"use client";

import { Button } from "@storevia/ui/button";
import { Card } from "@storevia/ui/surfaces";
import { ImagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { setBrandImageAction } from "@/app/(app)/s/[storeId]/website/actions";
import { MediaPickerDialog } from "./pickers";
import { StatusNotice, type Notice } from "./notice";

// The store's logo and favicon (final pass, Phase 2A). Images come from the
// media library through the builder's picker (which also uploads through
// the one media pipeline); the server checks every id is a READY image of
// this store. Saving is live at once, so there is no separate save button.

export interface BrandImagePreview {
  readonly id: string;
  readonly filename: string;
  /** A rendition for the preview (640 px wide, or the image's own size). */
  readonly src: string;
  /** The smallest rendition: what browsers load as the favicon. */
  readonly iconSrc: string;
  readonly width: number | null;
  readonly height: number | null;
}

type Slot = "logo" | "favicon";

const NAMES: Record<Slot, { title: string; noun: string }> = {
  logo: { title: "Logo", noun: "logo" },
  favicon: { title: "Favicon", noun: "favicon" },
};

export function BrandEditor({
  storeId,
  storeName,
  logo,
  favicon,
  canEdit,
  canUpload,
}: {
  storeId: string;
  storeName: string;
  logo: BrandImagePreview | null;
  favicon: BrandImagePreview | null;
  canEdit: boolean;
  canUpload: boolean;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [picking, setPicking] = useState<Slot | null>(null);
  const [pending, setPending] = useState<`${Slot}:${"set" | "remove"}` | null>(null);

  async function save(slot: Slot, mediaId: string | null) {
    setPending(`${slot}:${mediaId === null ? "remove" : "set"}`);
    setNotice(null);
    const result = await setBrandImageAction(storeId, { slot, mediaId });
    setPending(null);
    if (result.ok) {
      setNotice({ tone: "success", title: result.message ?? "Saved." });
      router.refresh();
    } else {
      setNotice({
        tone: "danger",
        title: result.message ?? `The ${NAMES[slot].noun} couldn't be saved.`,
      });
    }
  }

  const actions = (slot: Slot, current: BrandImagePreview | null) =>
    canEdit ? (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          {...(current ? {} : { leadingIcon: ImagePlus })}
          pending={pending === `${slot}:set`}
          onClick={() => {
            setPicking(slot);
          }}
        >
          {current ? `Replace ${NAMES[slot].noun}` : `Choose ${NAMES[slot].noun}`}
        </Button>
        {current ? (
          <Button
            variant="ghost"
            size="sm"
            pending={pending === `${slot}:remove`}
            onClick={() => {
              void save(slot, null);
            }}
          >
            Remove {NAMES[slot].noun}
          </Button>
        ) : null}
      </div>
    ) : (
      <p className="text-body-sm text-ink-muted">This store can't be changed right now.</p>
    );

  return (
    <div className="grid gap-6">
      <StatusNotice
        notice={notice}
        onDismiss={() => {
          setNotice(null);
        }}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          slot="logo"
          description={
            <>
              Shown at the left or centre of your header, depending on your theme, at most 40 px
              tall and never stretched. A wide image with a transparent background works best.
              Without a logo, your header shows your store's name as text.
            </>
          }
          current={logo}
          actions={actions("logo", logo)}
        >
          <div className="grid gap-2">
            <p className="text-caption text-ink-muted">How your header shows it</p>
            <div
              className="flex min-h-16 items-center gap-4 rounded-control border border-line bg-surface px-4"
              aria-label="Header preview"
              role="img"
            >
              {logo ? (
                <img
                  src={logo.src}
                  alt=""
                  className="h-auto max-h-10 w-auto max-w-48 object-contain"
                />
              ) : (
                <span className="truncate text-lg font-semibold text-ink">{storeName}</span>
              )}
            </div>
          </div>
        </Section>
        <Section
          slot="favicon"
          description={
            <>
              The small icon in browser tabs and bookmarks. Use a square image (or one close to
              square); browsers load its smallest size. Without a favicon, browsers show their
              default icon.
            </>
          }
          current={favicon}
          actions={actions("favicon", favicon)}
        >
          <div className="grid gap-2">
            <p className="text-caption text-ink-muted">How a browser tab shows it</p>
            <div
              className="flex max-w-72 items-center gap-2 rounded-t-control border border-b-0 border-line bg-surface px-3 py-2"
              aria-label="Browser tab preview"
              role="img"
            >
              {favicon ? (
                <img src={favicon.iconSrc} alt="" className="size-4 shrink-0 object-contain" />
              ) : (
                <span
                  className="size-4 shrink-0 rounded-full border border-line-strong bg-subtle"
                  aria-hidden="true"
                />
              )}
              <span className="truncate text-body-sm text-ink">{storeName}</span>
            </div>
          </div>
        </Section>
      </div>
      <MediaPickerDialog
        storeId={storeId}
        canUpload={canUpload}
        open={picking !== null}
        onOpenChange={(open) => {
          if (!open) setPicking(null);
        }}
        onPick={(image) => {
          if (picking) void save(picking, image.id);
        }}
      />
    </div>
  );
}

function Section({
  slot,
  description,
  current,
  actions,
  children,
}: {
  slot: Slot;
  description: ReactNode;
  current: BrandImagePreview | null;
  actions: ReactNode;
  children: ReactNode;
}) {
  const title = NAMES[slot].title;
  return (
    <Card className="grid content-start gap-4 p-5" role="region" aria-label={title}>
      <div className="grid gap-1">
        <h2 className="text-body font-semibold text-ink">{title}</h2>
        <p className="text-body-sm text-ink-muted">{description}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-subtle">
          {current ? (
            <img src={current.src} alt="" className="max-h-full max-w-full object-contain" />
          ) : (
            <ImagePlus className="size-5 text-ink-muted" aria-hidden="true" />
          )}
        </div>
        <p className="min-w-0 text-body-sm text-ink">
          {current ? (
            <>
              <span className="sr-only">Current {NAMES[slot].noun}: </span>
              <span className="block truncate">{current.filename}</span>
              {current.width && current.height ? (
                <span className="block text-caption text-ink-muted">
                  {current.width} × {current.height} px
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-ink-muted">No {NAMES[slot].noun} yet.</span>
          )}
        </p>
      </div>
      {children}
      {actions}
    </Card>
  );
}
