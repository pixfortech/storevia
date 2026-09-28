"use client";

import {
  THEME_DEMO_VIEWPORTS,
  type ThemeDemoPage,
  type ThemeDemoViewport,
} from "@storevia/site-engine/demo";
import { SegmentedControl } from "@storevia/ui/segmented-control";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { useState } from "react";
import { DEMO_PAGES } from "@/lib/theme-demo";
import { ThemeDemoFrame } from "./theme-demo";

// The full theme demo (08-themes.md §10.7): the demo home and product pages
// at a real desktop, tablet or phone layout width, in any of the theme's
// styles. The choices are kept in the address (?page=, ?viewport=,
// ?style=) so a demo can be reloaded or shared as it is.

/** Layout heights per viewport: a typical screen of each. */
const VIEWPORT_HEIGHT: Record<ThemeDemoViewport, number> = {
  desktop: 800,
  tablet: 1024,
  mobile: 844,
};

const VIEWPORTS = [
  { value: "desktop", label: "Desktop", icon: Monitor },
  { value: "tablet", label: "Tablet", icon: Tablet },
  { value: "mobile", label: "Mobile", icon: Smartphone },
] as const;

export function ThemeDemoViewer({
  themeKey,
  themeName,
  presets,
  initial,
}: {
  themeKey: string;
  themeName: string;
  presets: readonly { key: string; name: string }[];
  initial: { page: ThemeDemoPage; viewport: ThemeDemoViewport; preset: string };
}) {
  const [page, setPage] = useState(initial.page);
  const [viewport, setViewport] = useState(initial.viewport);
  const [preset, setPreset] = useState(initial.preset);

  const remember = (key: "page" | "viewport" | "style", value: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set(key, value);
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="grid gap-1.5">
          <span id="demo-page-label" className="text-label font-medium text-ink">
            Page
          </span>
          <SegmentedControl
            aria-labelledby="demo-page-label"
            value={page}
            onValueChange={(value) => {
              const next = value === "product" ? "product" : "home";
              setPage(next);
              remember("page", next);
            }}
            options={[
              { value: "home", label: DEMO_PAGES.home.label },
              { value: "product", label: DEMO_PAGES.product.label },
            ]}
          />
        </div>
        <div className="grid gap-1.5">
          <span id="demo-viewport-label" className="text-label font-medium text-ink">
            Viewport
          </span>
          <SegmentedControl
            aria-labelledby="demo-viewport-label"
            value={viewport}
            onValueChange={(value) => {
              const next = VIEWPORTS.find((v) => v.value === value)?.value ?? "desktop";
              setViewport(next);
              remember("viewport", next);
            }}
            options={VIEWPORTS.map((v) => ({ value: v.value, label: v.label, icon: v.icon }))}
          />
        </div>
        {presets.length > 1 ? (
          <div className="grid gap-1.5">
            <span id="demo-style-label" className="text-label font-medium text-ink">
              Style
            </span>
            <SegmentedControl
              aria-labelledby="demo-style-label"
              value={preset}
              onValueChange={(value) => {
                setPreset(value);
                remember("style", value);
              }}
              options={presets.map((p) => ({ value: p.key, label: p.name }))}
            />
          </div>
        ) : null}
      </div>
      <p className="text-caption text-ink-muted" aria-live="polite">
        {DEMO_PAGES[page].label} at {String(THEME_DEMO_VIEWPORTS[viewport])} pixels wide, scaled to
        fit when needed. Demo content by Storevia: your own pages and products are never shown here.
      </p>
      <div className="rounded-card bg-subtle p-3 sm:p-4">
        <ThemeDemoFrame
          themeKey={themeKey}
          page={page}
          presetKey={preset}
          viewport={viewport}
          height={VIEWPORT_HEIGHT[viewport]}
          title={`${themeName} demo store, ${DEMO_PAGES[page].label.toLowerCase()}`}
        />
      </div>
    </div>
  );
}
