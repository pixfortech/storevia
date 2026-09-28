"use client";

import {
  COMMERCE_BLOCK_CSS,
  STOREVIA_REGISTRY,
  documentRenderData,
  type CommerceRenderContext,
} from "@storevia/commerce/blocks";
import { BASE_CSS, RenderDocument, compileDocumentCss } from "@storevia/editor/render";
import { SiteChrome, SiteMenu } from "@storevia/site-engine/chrome";
import {
  THEME_DEMO,
  THEME_DEMO_VIEWPORTS,
  themeDemo,
  type ThemeDemoPage,
  type ThemeDemoViewport,
} from "@storevia/site-engine/demo";
import { DEFAULT_THEME_DEFINITION, themeDefinition } from "@storevia/site-engine/theme";
import { cn } from "@storevia/ui/cn";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DEMO_COMPOSITION_CSS,
  DEMO_DOCUMENT_DATA,
  DEMO_PAGES,
  DEMO_PRODUCT,
} from "@/lib/theme-demo";

// Theme demos (08-themes.md §10.7): Storevia's demo store rendered by the
// real renderer: the theme package's chrome (SiteChrome), the storefront's
// block registry, the theme's preset tokens and scoped stylesheet. It is
// drawn inside a same-origin srcdoc iframe (like the builder canvas), so
// the theme's document-level CSS (body, headings, :root tokens) can never
// reach the dashboard, the dashboard's CSS never reaches the demo, and media
// queries follow the frame's layout width (desktop, tablet, phone). The
// frame is scaled to fit. Nothing in it navigates or submits.

/** The cart form can't be used in a demo: it shows as an inert button. */
function DemoAddToCart() {
  return (
    <p className="sv-add-to-cart">
      <button className="sv-button" type="button">
        Add to cart
      </button>
    </p>
  );
}

function DemoActions() {
  return (
    <div className="sv-header-links">
      <a href="/search">{THEME_DEMO.actions.search}</a>
      <a href="/cart">{THEME_DEMO.actions.cart}</a>
    </div>
  );
}

/** One demo page as the theme renders it: its stylesheet, chrome and blocks. */
export function ThemeDemoDocument({
  themeKey,
  page,
  presetKey,
}: {
  themeKey: string;
  page: ThemeDemoPage;
  presetKey?: string | undefined;
}) {
  const theme = themeDefinition(themeKey) ?? DEFAULT_THEME_DEFINITION;
  const definition = DEMO_PAGES[page];
  const demo = themeDemo(
    theme,
    `${BASE_CSS}${COMMERCE_BLOCK_CSS}${DEMO_COMPOSITION_CSS}`,
    presetKey,
  );
  const pageCss = compileDocumentCss(definition.document, STOREVIA_REGISTRY);
  const ctx: CommerceRenderContext = {
    pageKind: definition.kind,
    site: { name: THEME_DEMO.brand, locale: THEME_DEMO.locale },
    data: documentRenderData(DEMO_DOCUMENT_DATA, {
      product: page === "product" ? DEMO_PRODUCT : null,
    }),
    slots: { AddToCart: DemoAddToCart },
    selectedVariantId: null,
    pageHref: () => "#",
    variantHref: () => "#",
  };
  return (
    <>
      <style>{demo.css}</style>
      <div
        className="sv-demo"
        data-sv-demo={page}
        data-sv-preset={demo.preset.key}
        {...demo.attributes}
      >
        <SiteChrome
          name={THEME_DEMO.brand}
          theme={theme}
          announcement={THEME_DEMO.announcement}
          nav={<SiteMenu label="Main" links={THEME_DEMO.menu} currentPath={definition.path} />}
          footerNav={<SiteMenu label="Footer" links={THEME_DEMO.footerMenu} />}
          actions={<DemoActions />}
        >
          <main id="main">
            {pageCss ? <style>{pageCss}</style> : null}
            <RenderDocument document={definition.document} registry={STOREVIA_REGISTRY} ctx={ctx} />
          </main>
        </SiteChrome>
      </div>
    </>
  );
}

const BORDER = 1;

const FRAME_DOCUMENT = `<!doctype html><html lang="${THEME_DEMO.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>`;

/**
 * A demo page in an isolated frame at a viewport's layout width, scaled
 * down to the space it has. `decorative` frames (the library's miniatures)
 * are inert: not focusable, not clickable and hidden from assistive
 * technology, so the card's own text and buttons describe the theme.
 */
export function ThemeDemoFrame({
  themeKey,
  page = "home",
  presetKey,
  viewport = "desktop",
  height,
  title,
  decorative = false,
  className,
}: {
  themeKey: string;
  page?: ThemeDemoPage;
  presetKey?: string | undefined;
  viewport?: ThemeDemoViewport;
  /** The frame's layout height in CSS pixels (before scaling). */
  height: number;
  title: string;
  decorative?: boolean;
  className?: string;
}) {
  const width = THEME_DEMO_VIEWPORTS[viewport];
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [room, setRoom] = useState(0);
  const [body, setBody] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setRoom(entry.contentRect.width);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  // After a full page load the frame can finish loading before React
  // hydrates (the load event is then missed): pick its document up here.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (doc?.readyState === "complete" && doc.head.childElementCount > 0) setBody(doc.body);
  }, []);

  // Links, buttons and forms in a demo never navigate or submit.
  useEffect(() => {
    const doc = body?.ownerDocument;
    if (!doc) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest("a, button, form, summary, input")) event.preventDefault();
    };
    const onSubmit = (event: Event) => {
      event.preventDefault();
    };
    doc.addEventListener("click", onClick);
    doc.addEventListener("submit", onSubmit);
    return () => {
      doc.removeEventListener("click", onClick);
      doc.removeEventListener("submit", onSubmit);
    };
  }, [body]);

  // The frame's 1 px border sits outside the scaled page.
  const scale = room > BORDER * 2 ? Math.min(1, (room - BORDER * 2) / width) : 0;
  return (
    <div
      ref={box}
      className={cn("w-full min-w-0", className)}
      data-viewport={viewport}
      data-viewport-width={width}
      {...(decorative ? { inert: true } : {})}
    >
      <div
        className={cn(
          "relative mx-auto overflow-hidden rounded-control border border-line bg-surface",
          decorative && "pointer-events-none",
        )}
        style={
          scale > 0
            ? { width: width * scale + BORDER * 2, height: height * scale + BORDER * 2 }
            : { width: "100%", aspectRatio: `${String(width)} / ${String(height)}` }
        }
      >
        <iframe
          ref={frame}
          title={title}
          srcDoc={FRAME_DOCUMENT}
          tabIndex={decorative ? -1 : undefined}
          onLoad={() => {
            setBody(frame.current?.contentDocument?.body ?? null);
          }}
          className="absolute top-0 left-0 origin-top-left border-0 bg-white"
          style={{
            width,
            height,
            transform: `scale(${String(scale)})`,
            visibility: scale > 0 ? "visible" : "hidden",
          }}
        />
      </div>
      {body
        ? createPortal(
            <ThemeDemoDocument themeKey={themeKey} page={page} presetKey={presetKey} />,
            body,
          )
        : null}
    </div>
  );
}
