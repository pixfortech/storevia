"use client";

import {
  DEFAULT_THEME_DEFINITION,
  FONT_STACKS,
  contrastRatio,
  resolveTheme,
  themeDefinition,
  type ThemeSettings,
} from "@storevia/site-engine/theme";
import { Button } from "@storevia/ui/button";
import { cn } from "@storevia/ui/cn";
import { Field, Input, Select } from "@storevia/ui/form";
import { Alert, Badge, Card } from "@storevia/ui/surfaces";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { publishThemeAction, saveThemeDraftAction } from "@/app/(app)/s/[storeId]/website/actions";
import { UnsavedChangesGuard } from "@/components/catalogue/unsaved-guard";
import { StatusNotice, type Notice } from "./notice";

// The theme customiser (ADR-0030 §7): one installed theme's preset, four
// colours with live contrast checks, fonts from an allow-list of system
// typefaces, and a few named options. The theme's own schema validates here
// and on the server; nothing here produces CSS the theme engine didn't
// compute. Publishing a theme that isn't live switches the store to it.

const COLOURS = [
  ["background", "Background"],
  ["text", "Text"],
  ["primary", "Brand colour (buttons)"],
  ["accent", "Accent (links and focus)"],
] as const;

export function ThemeEditor({
  storeId,
  themeKey,
  live,
  initial,
  revision: initialRevision,
  hasUnpublishedChanges,
  canEdit,
  canPublish,
}: {
  storeId: string;
  /** The installed theme being customised. */
  themeKey: string;
  /** Whether it is the store's live theme. */
  live: boolean;
  initial: ThemeSettings;
  revision: number;
  hasUnpublishedChanges: boolean;
  canEdit: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const theme = themeDefinition(themeKey) ?? DEFAULT_THEME_DEFINITION;
  const [notice, setNotice] = useState<Notice | null>(null);
  const [settings, setSettings] = useState<ThemeSettings>(initial);
  const [revision, setRevision] = useState(initialRevision);
  const [dirty, setDirty] = useState(false);
  const [unpublished, setUnpublished] = useState(hasUnpublishedChanges);
  const [pending, setPending] = useState<"save" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useMemo(() => theme.settingsSchema.safeParse(settings), [theme, settings]);
  const issues = check.success
    ? {}
    : Object.fromEntries(check.error.issues.map((i) => [i.path.join("."), i.message]));
  const tokens = useMemo(() => resolveTheme(settings), [settings]);

  const update = (next: ThemeSettings) => {
    setSettings(next);
    setDirty(true);
    setError(null);
  };
  const colour = (key: keyof ThemeSettings["colors"], value: string) => {
    update({ ...settings, colors: { ...settings.colors, [key]: value.toLowerCase() } });
  };

  /** Saves the draft; the new revision, or null when it didn't save. */
  async function save(): Promise<number | null> {
    setPending("save");
    const result = await saveThemeDraftAction(storeId, { themeKey, revision, settings });
    setPending(null);
    if (!result.ok) {
      setError(result.message ?? "The theme couldn't be saved.");
      return null;
    }
    setRevision(result.data.revision);
    setUnpublished(result.data.hasUnpublishedChanges);
    setDirty(false);
    return result.data.revision;
  }

  async function publish() {
    const current = dirty ? await save() : revision;
    if (current === null) return;
    setPending("publish");
    const result = await publishThemeAction(storeId, { themeKey, revision: current });
    setPending(null);
    if (result.ok) {
      setUnpublished(false);
      setNotice({ tone: "success", title: result.message ?? "Published." });
      // A switch changes the library above (which theme is live).
      if (!live) router.refresh();
    } else setError(result.message ?? "The theme couldn't be published.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <UnsavedChangesGuard dirty={dirty} />
      <div className="grid content-start gap-6">
        <StatusNotice
          notice={notice}
          onDismiss={() => {
            setNotice(null);
          }}
        />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Card className="grid gap-4 p-5">
          <h2 className="text-body font-semibold text-ink">Style</h2>
          <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Preset">
            {theme.presets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                role="radio"
                aria-checked={settings.preset === preset.key}
                disabled={!canEdit}
                className={cn(
                  "grid gap-1 rounded-control border p-3 text-left focus-visible:outline-2 focus-visible:outline-focus",
                  settings.preset === preset.key
                    ? "border-brand-500 bg-brand-25"
                    : "border-line hover:bg-subtle",
                )}
                onClick={() => {
                  update(preset.settings);
                }}
              >
                <span className="font-medium text-ink">{preset.name}</span>
                <span className="text-caption text-ink-muted">{preset.description}</span>
              </button>
            ))}
          </div>
          <p className="text-caption text-ink-muted">
            Choosing a style resets the settings below to that style's own.
          </p>
        </Card>

        <Card className="grid gap-4 p-5">
          <h2 className="text-body font-semibold text-ink">Colours</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {COLOURS.map(([key, label]) => (
              <Field key={key} label={label} error={issues[`colors.${key}`]}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label={`${label} picker`}
                    value={
                      /^#[0-9a-f]{6}$/i.test(settings.colors[key])
                        ? settings.colors[key]
                        : "#000000"
                    }
                    disabled={!canEdit}
                    onChange={(e) => {
                      colour(key, e.target.value);
                    }}
                    className="h-10 w-12 cursor-pointer rounded-control border border-line-control bg-surface"
                  />
                  <Input
                    value={settings.colors[key]}
                    maxLength={7}
                    disabled={!canEdit}
                    onChange={(e) => {
                      colour(key, e.target.value);
                    }}
                  />
                </div>
              </Field>
            ))}
          </div>
          <p className="text-caption text-ink-muted">
            Text on background:{" "}
            {contrastRatio(settings.colors.text, settings.colors.background).toFixed(1)}:1 (needs
            4.5:1). Text on buttons is chosen automatically for contrast.
          </p>
        </Card>

        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="text-body font-semibold text-ink sm:col-span-2">Type and layout</h2>
          {(
            [
              [
                "headingFont",
                "Heading font",
                Object.entries(FONT_STACKS).map(([v, f]) => [v, f.label]),
              ],
              ["bodyFont", "Body font", Object.entries(FONT_STACKS).map(([v, f]) => [v, f.label])],
              [
                "buttonStyle",
                "Buttons",
                [
                  ["solid", "Solid"],
                  ["outline", "Outline"],
                  ["pill", "Rounded pill"],
                ],
              ],
              [
                "radius",
                "Corners",
                [
                  ["none", "Square"],
                  ["small", "Slightly rounded"],
                  ["medium", "Rounded"],
                  ["large", "Very rounded"],
                ],
              ],
              [
                "contentWidth",
                "Content width",
                [
                  ["narrow", "Narrow"],
                  ["standard", "Standard"],
                  ["wide", "Wide"],
                ],
              ],
              [
                "sectionSpacing",
                "Space between sections",
                [
                  ["compact", "Compact"],
                  ["standard", "Standard"],
                  ["spacious", "Spacious"],
                ],
              ],
            ] as const
          ).map(([key, label, choices]) => (
            <Field key={key} label={label} error={issues[key]}>
              <Select
                value={settings[key]}
                disabled={!canEdit}
                onChange={(e) => {
                  update({ ...settings, [key]: e.target.value });
                }}
              >
                {choices.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
        </Card>
      </div>

      <div className="grid content-start gap-4 lg:sticky lg:top-4">
        <Card className="grid gap-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-body font-semibold text-ink">Preview</h2>
            {!live ? (
              <Badge tone="neutral">Not live</Badge>
            ) : unpublished || dirty ? (
              <Badge tone="warning">Not published</Badge>
            ) : (
              <Badge tone="success">Live</Badge>
            )}
          </div>
          <div
            className="grid gap-3 overflow-hidden rounded-control border border-line p-5"
            style={{
              background: tokens["color.background"],
              color: tokens["color.text"],
              fontFamily: tokens["font.body"],
            }}
            aria-hidden="true"
          >
            <p
              style={{
                fontFamily: tokens["font.heading"],
                fontSize: "1.5rem",
                fontWeight: 600,
                margin: 0,
              }}
            >
              Your headline
            </p>
            <p style={{ color: tokens["color.muted"], margin: 0 }}>
              Body text reads like this, with{" "}
              <span
                style={{ textDecoration: "underline", textDecorationColor: tokens["color.accent"] }}
              >
                a link
              </span>
              .
            </p>
            <span
              style={{
                justifySelf: "start",
                padding: "0.6rem 1.2rem",
                borderRadius: tokens["radius.button"],
                background: tokens["button.background"],
                color: tokens["button.text"],
                border: `2px solid ${tokens["button.border"] ?? "transparent"}`,
                fontWeight: 600,
              }}
            >
              Shop now
            </span>
            <div
              style={{
                background: tokens["color.surface"],
                borderRadius: tokens["radius.md"],
                padding: "0.75rem",
              }}
            >
              A subtle section
            </div>
          </div>
        </Card>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!canEdit || !dirty || !check.success}
            pending={pending === "save"}
            onClick={() => void save()}
          >
            Save draft
          </Button>
          {canPublish ? (
            <Button
              disabled={!canEdit || !check.success || (live && !dirty && !unpublished)}
              pending={pending === "publish"}
              onClick={() => void publish()}
            >
              {live ? "Publish theme" : `Publish and switch to ${theme.name}`}
            </Button>
          ) : null}
        </div>
        <p className="text-caption text-ink-muted">
          {live
            ? "Drafts show in the store preview. Visitors see the theme once it's published."
            : `Visitors don't see ${theme.name} until you publish it. Choose "Preview ${theme.name}" above to see it in the store preview first.`}
        </p>
      </div>
    </div>
  );
}
