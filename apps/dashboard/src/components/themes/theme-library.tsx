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
} from "@/app/(app)/s/[storeId]/themes/actions";
import { StatusNotice, type Notice } from "@/components/site/notice";
import {
  themeBadges,
  themeCardActions,
  themeCardNote,
  themeLayoutFacts,
  type ThemeCardAction,
} from "@/lib/theme-card";
import { ThemeDemoFrame } from "./theme-demo";

// The theme library (08-themes.md §10.7): Storevia's first-party themes,
// each with a miniature of its demo store drawn by the real renderer, its
// state and five actions in a fixed order. Install one (nothing public
// changes), customise its draft, show it in the store preview, and make it
// live (the store switches; the previous theme stays installed with its
// settings). Every state is written out (never colour alone), every action
// is a labelled button or link, and results are announced politely.

type Run = NonNullable<ThemeCardAction["run"]>;

/** Layout height of a card's miniature: the demo's announcement, header, hero and product row. */
const MINIATURE_HEIGHT = 900;

export function ThemeLibrary({
  storeId,
  themes,
  themesHref,
  previewHref,
  canEdit,
  canPublish,
}: {
  storeId: string;
  themes: readonly ThemeLibraryEntry[];
  /** The Themes area's path (demo and customiser live under it). */
  themesHref: string;
  /** Opens the signed store preview. */
  previewHref: string;
  canEdit: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState<{ key: string; run: Run } | null>(null);
  const liveName = themes.find((t) => t.live)?.name ?? "your live theme";

  async function run(entry: ThemeLibraryEntry, action: Run) {
    setPending({ key: entry.key, run: action });
    setNotice(null);
    const result =
      action === "install"
        ? await installThemeAction(storeId, { themeKey: entry.key })
        : action === "preview"
          ? await previewThemeAction(storeId, { themeKey: entry.key })
          : await publishThemeAction(storeId, {
              themeKey: entry.key,
              revision: entry.revision ?? 0,
            });
    setPending(null);
    const success = {
      install: `${entry.name} installed. Customise it and preview it on your store; visitors keep seeing ${liveName} until you make it live.`,
      preview: entry.live
        ? `Your store preview shows ${entry.name} again.`
        : `Your store preview now shows ${entry.name}. Visitors still see ${liveName}. Choose "Preview on my store" to open it.`,
      publish: entry.live
        ? `${entry.name} published. Your site shows the changes now.`
        : `${entry.name} is now your live theme. ${liveName} stays installed with its settings.`,
    }[action];
    setNotice(
      result.ok
        ? { tone: "success", title: success }
        : { tone: "danger", title: result.message ?? "That didn't work. Please try again." },
    );
    if (result.ok) router.refresh();
  }

  function actionControl(entry: ThemeLibraryEntry, action: ThemeCardAction) {
    // One accessible name, "Install, Boutique" (a visually hidden suffix
    // would be read with a stray space in some browsers).
    const name = `${action.label}, ${entry.name}`;
    const label = action.label;
    const className = buttonClasses(action.variant, "md", "w-full");
    switch (action.kind) {
      case "link":
        return (
          <Link
            href={
              action.key === "demo"
                ? `${themesHref}/demo/${encodeURIComponent(entry.key)}`
                : entry.live
                  ? `${themesHref}/customise`
                  : `${themesHref}/customise?theme=${encodeURIComponent(entry.key)}`
            }
            className={className}
            aria-label={name}
          >
            {label}
          </Link>
        );
      case "external":
        return (
          <a
            href={previewHref}
            target="_blank"
            rel="noopener"
            className={className}
            aria-label={`${name} (opens in a new tab)`}
          >
            {label}
            <ExternalLink className="size-4" aria-hidden="true" />
          </a>
        );
      case "button":
        return (
          <Button
            variant={action.variant}
            fullWidth
            aria-label={name}
            disabled={pending !== null}
            pending={pending?.key === entry.key && pending.run === action.run}
            onClick={() => {
              if (action.run) void run(entry, action.run);
            }}
          >
            {label}
          </Button>
        );
      case "disabled":
        return (
          <Button variant={action.variant} fullWidth disabled aria-label={name}>
            {label}
          </Button>
        );
    }
  }

  return (
    <section aria-labelledby="theme-library-heading" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="theme-library-heading" className="text-body font-semibold text-ink">
          Theme library
        </h2>
        <p className="text-body-sm text-ink-muted">
          Each theme is shown with the same demo store, so you can compare them. Your pages,
          products, links and domains stay exactly as they are when you switch.
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
          const permissions = { canEdit, canPublish };
          const note = themeCardNote(entry, permissions);
          return (
            <li key={entry.key} className="min-w-0">
              <Card
                className={cn(
                  "@container flex h-full flex-col gap-4 p-4 sm:p-5",
                  entry.live && "border-brand-500",
                )}
                aria-labelledby={headingId}
                role="group"
                data-theme-card={entry.key}
              >
                <ThemeDemoFrame
                  themeKey={entry.key}
                  height={MINIATURE_HEIGHT}
                  title={`${entry.name} demo store, home page`}
                  decorative
                />
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 id={headingId} className="text-body font-semibold text-ink">
                      {entry.name}
                    </h3>
                    <span className="text-caption text-ink-muted">
                      Version {String(entry.version)}
                    </span>
                  </div>
                  <ul className="flex flex-wrap gap-2" aria-label="Status">
                    {themeBadges(entry).map((badge) => (
                      <li key={badge.label}>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-body-sm text-ink-muted">{entry.description}</p>
                <dl className="grid gap-1 text-caption text-ink-muted">
                  <div className="flex flex-wrap gap-1">
                    <dt className="font-medium text-ink">Layout:</dt>
                    <dd>{themeLayoutFacts(entry.chrome).join(", ")}.</dd>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <dt className="font-medium text-ink">Styles:</dt>
                    <dd>{entry.presetNames.join(", ")}.</dd>
                  </div>
                </dl>
                {entry.incompatibility ? (
                  <Alert tone="warning">{entry.incompatibility}</Alert>
                ) : null}
                {/* The note sits above the actions, so the action rows of both cards line up. */}
                <div className="mt-auto grid gap-2">
                  {note ? <p className="text-caption text-ink-muted">{note}</p> : null}
                  <ul
                    className="grid gap-2 @sm:grid-cols-2 @sm:[&>li:last-child]:col-span-2"
                    aria-label={`${entry.name} actions`}
                  >
                    {themeCardActions(entry, permissions).map((action) => (
                      <li key={action.key} className="flex min-w-0" data-action={action.key}>
                        {actionControl(entry, action)}
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
