"use client";

import type { ThemeLibraryEntry } from "@storevia/site-admin";
import { Button, buttonClasses } from "@storevia/ui/button";
import { cn } from "@storevia/ui/cn";
import { Alert, Badge, Card } from "@storevia/ui/surfaces";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  installThemeAction,
  previewThemeAction,
  publishThemeAction,
} from "@/app/(app)/s/[storeId]/website/actions";
import { StatusNotice, type Notice } from "./notice";

// The theme library (08-themes.md §10): Storevia's first-party themes with
// this store's state. Install one (nothing public changes), customise its
// draft, choose it for the store preview, publish it (the store switches to
// it; the previous theme stays installed with its settings) and switch back.
// Every state is written out (never colour alone), every action is a
// labelled button or link, and results are announced politely.

interface Pending {
  readonly key: string;
  readonly action: "install" | "preview" | "publish";
}

export function ThemeLibrary({
  storeId,
  themes,
  customising,
  customiseHref,
  previewHref,
  canEdit,
  canPublish,
}: {
  storeId: string;
  themes: readonly ThemeLibraryEntry[];
  /** The theme open in the customiser below. */
  customising: string;
  /** The customiser's path; `?theme=` selects a theme that isn't live. */
  customiseHref: string;
  /** Opens the signed store preview. */
  previewHref: string;
  canEdit: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const liveName = themes.find((t) => t.live)?.name ?? "your live theme";

  async function run(
    entry: ThemeLibraryEntry,
    action: Pending["action"],
    call: () => Promise<{ ok: boolean; message?: string | undefined }>,
    success: string,
  ) {
    setPending({ key: entry.key, action });
    setNotice(null);
    const result = await call();
    setPending(null);
    setNotice(
      result.ok
        ? { tone: "success", title: success }
        : { tone: "danger", title: result.message ?? "That didn't work. Please try again." },
    );
    if (result.ok) router.refresh();
  }

  const busy = (key: string, action: Pending["action"]) =>
    pending?.key === key && pending.action === action;

  return (
    <section aria-labelledby="theme-library-heading" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="theme-library-heading" className="text-body font-semibold text-ink">
          Theme library
        </h2>
        <p className="text-body-sm text-ink-muted">
          Themes change how every page looks. Your pages, products, links and domains stay exactly
          as they are when you switch.
        </p>
      </div>
      <StatusNotice
        notice={notice}
        onDismiss={() => {
          setNotice(null);
        }}
      />
      <ul className="grid gap-4 md:grid-cols-2" aria-label="Themes">
        {themes.map((entry) => {
          const headingId = `theme-${entry.key}-name`;
          const selected = entry.installed && entry.key === customising;
          return (
            <li key={entry.key}>
              <Card
                className={cn(
                  "grid h-full content-start gap-3 p-5",
                  entry.live && "border-brand-500",
                )}
                aria-labelledby={headingId}
                role="group"
              >
                <ThemeSketch entry={entry} />
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id={headingId} className="text-body font-semibold text-ink">
                    {entry.name}
                  </h3>
                  <span className="text-caption text-ink-muted">
                    Version {String(entry.version)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {entry.live ? (
                    <Badge tone="success">Current theme (live)</Badge>
                  ) : entry.installed ? (
                    <Badge tone="neutral">Installed, not live</Badge>
                  ) : (
                    <Badge tone="neutral">Not installed</Badge>
                  )}
                  {entry.installed && entry.previewing && !entry.live ? (
                    <Badge tone="info">Shown in your store preview</Badge>
                  ) : null}
                  {entry.installed && entry.hasUnpublishedChanges && entry.live ? (
                    <Badge tone="warning">Unpublished changes</Badge>
                  ) : null}
                  {selected ? <Badge tone="neutral">Open below</Badge> : null}
                </div>
                <p className="text-body-sm text-ink-muted">{entry.description}</p>
                <p className="text-caption text-ink-muted">
                  Styles: {entry.presetNames.join(", ")}
                </p>
                {entry.incompatibility ? (
                  <Alert tone="warning">{entry.incompatibility}</Alert>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {!entry.installed ? (
                    <Button
                      disabled={!canEdit || entry.incompatibility !== null || pending !== null}
                      pending={busy(entry.key, "install")}
                      onClick={() =>
                        void run(
                          entry,
                          "install",
                          () => installThemeAction(storeId, { themeKey: entry.key }),
                          `${entry.name} installed. Customise and preview it; visitors keep seeing ${liveName} until you publish it.`,
                        )
                      }
                    >
                      Install {entry.name}
                    </Button>
                  ) : (
                    <>
                      <Link
                        href={
                          entry.live
                            ? customiseHref
                            : `${customiseHref}?theme=${encodeURIComponent(entry.key)}`
                        }
                        aria-current={selected ? "page" : undefined}
                        className={buttonClasses("secondary", "md")}
                      >
                        Customise {entry.name}
                      </Link>
                      {entry.previewing ? (
                        <a
                          href={previewHref}
                          target="_blank"
                          rel="noopener"
                          className={buttonClasses("secondary", "md")}
                        >
                          Open preview
                          <ExternalLink className="size-4" aria-hidden="true" />
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      ) : (
                        <Button
                          variant="secondary"
                          disabled={!canEdit || entry.incompatibility !== null || pending !== null}
                          pending={busy(entry.key, "preview")}
                          onClick={() =>
                            void run(
                              entry,
                              "preview",
                              () => previewThemeAction(storeId, { themeKey: entry.key }),
                              entry.live
                                ? `Your store preview shows ${entry.name} again.`
                                : `Your store preview now shows ${entry.name}. Visitors still see ${liveName}.`,
                            )
                          }
                        >
                          Preview {entry.name}
                        </Button>
                      )}
                      {!entry.live && canPublish ? (
                        <Button
                          disabled={
                            !canEdit ||
                            entry.incompatibility !== null ||
                            entry.revision === null ||
                            pending !== null
                          }
                          pending={busy(entry.key, "publish")}
                          onClick={() =>
                            void run(
                              entry,
                              "publish",
                              () =>
                                publishThemeAction(storeId, {
                                  themeKey: entry.key,
                                  revision: entry.revision ?? 0,
                                }),
                              `${entry.name} is now your live theme. ${liveName} stays installed with its settings.`,
                            )
                          }
                        >
                          {entry.wasLive ? `Switch back to ${entry.name}` : `Publish ${entry.name}`}
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A small, decorative sketch of the theme's header layout and product cards. */
function ThemeSketch({ entry }: { entry: ThemeLibraryEntry }) {
  const centred = entry.chrome.header === "centred";
  const portrait = entry.chrome.productCard === "portrait";
  return (
    <div aria-hidden="true" className="grid gap-2 rounded-control border border-line bg-subtle p-3">
      <div
        className={cn("flex items-center gap-2", centred ? "justify-center" : "justify-between")}
      >
        <span className="h-2 w-16 rounded-full bg-ink/70" />
        {centred ? null : <span className="h-1.5 w-20 rounded-full bg-ink/30" />}
      </div>
      {centred ? (
        <div className="flex justify-center gap-2">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1 w-6 rounded-full bg-ink/30" />
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "block bg-ink/10",
              portrait ? "aspect-[3/4] rounded-none" : "aspect-square rounded-sm",
            )}
          />
        ))}
      </div>
    </div>
  );
}
