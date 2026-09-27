"use client";

import {
  COMMERCE_BLOCK_CSS,
  STOREVIA_REGISTRY,
  documentRenderData,
  type CommerceRenderContext,
  type DocumentData,
} from "@storevia/commerce/blocks";
import type { PageDocument } from "@storevia/editor/document";
import { BASE_CSS, RenderDocument, compileDocumentCss } from "@storevia/editor/render";
import { SITE_BASE_CSS } from "@storevia/site-engine/base-css";
import { themeCss, type ThemeTokens } from "@storevia/site-engine/theme";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The builder's live canvas (ADR-0030 §6): the working document rendered in
// a same-origin iframe with the storefront's own registry, base styles and
// theme tokens, so media queries follow the frame's width (desktop, tablet,
// phone). Data (images, products, collections, links) comes from the same
// resolver the storefront uses, run in the merchant's transaction. Nothing
// in the canvas navigates: clicks select sections instead.

export type Device = "desktop" | "tablet" | "mobile";
/** Each device's layout width; the frame is scaled down to fit the panel. */
export const DEVICE_WIDTH: Record<Device, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 390,
};

const CANVAS_CSS = `
body{min-height:100vh}
[data-svb-section]{position:relative;outline:2px solid transparent;outline-offset:-2px;cursor:pointer;transition:outline-color .15s}
[data-svb-section]:hover{outline-color:#a5b4fc}
[data-svb-section][data-selected]{outline-color:#4f46e5}
[data-svb-section][data-hidden]{opacity:.45}
[data-svb-section]:empty{min-height:5rem;display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(135deg,#f8fafc,#f8fafc 8px,#f1f5f9 8px,#f1f5f9 16px);font:500 14px/1.4 system-ui,sans-serif;color:#475569;margin:.5rem;border:1px dashed #94a3b8;border-radius:8px}
[data-svb-section]:empty::before{content:attr(data-label)}
.svb-empty-page{padding:4rem 1rem;text-align:center;font:500 15px/1.5 system-ui,sans-serif;color:#475569}
@media (prefers-reduced-motion:reduce){[data-svb-section]{transition:none}}
`;

/** The cart form can't be used in the canvas: it shows as an inert button. */
function InertAddToCart() {
  return (
    <p className="sv-add-to-cart">
      <button className="sv-button" type="button" disabled>
        Add to cart
      </button>
    </p>
  );
}

export function Canvas({
  document,
  data,
  tokens,
  siteName,
  locale,
  device,
  selectedId,
  onSelect,
  labelFor,
}: {
  document: PageDocument;
  data: DocumentData;
  tokens: ThemeTokens;
  siteName: string;
  locale: string;
  device: Device;
  selectedId: string | null;
  onSelect: (id: string) => void;
  labelFor: (type: string) => string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setRoom({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  const width = DEVICE_WIDTH[device];
  const scale = room.width > 0 ? Math.min(1, room.width / width) : 1;
  const height = Math.max(room.height, 480) / scale;
  const [body, setBody] = useState<HTMLElement | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;

  // After a full page load the frame can finish loading before React
  // hydrates (the load event is then missed): pick its document up here.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (
      doc?.readyState === "complete" &&
      doc.body.childElementCount === 0 &&
      doc.head.childElementCount > 0
    ) {
      setBody(doc.body);
    }
  }, []);

  // The frame's document comes from srcdoc; once it has loaded, React
  // renders into it through a portal.
  useEffect(() => {
    const doc = body?.ownerDocument;
    if (!doc) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      // Links, buttons and forms in the preview never navigate or submit.
      if (target?.closest("a, button, form, summary, input")) event.preventDefault();
      const section = target?.closest("[data-svb-section]");
      const id = section?.getAttribute("data-svb-section");
      if (id) select.current(id);
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

  // Keep the selected section in view.
  useEffect(() => {
    if (!body || !selectedId) return;
    body.ownerDocument
      .querySelector(`[data-svb-section="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [body, selectedId]);

  const ctx: CommerceRenderContext = {
    pageKind: "HOME",
    site: { name: siteName, locale },
    data: documentRenderData(data),
    slots: { AddToCart: InertAddToCart },
    selectedVariantId: null,
    pageHref: () => "#",
    variantHref: () => "#",
  };
  const css = `${themeCss(tokens)}${SITE_BASE_CSS}${BASE_CSS}${COMMERCE_BLOCK_CSS}${compileDocumentCss(document, STOREVIA_REGISTRY)}${CANVAS_CSS}`;

  return (
    <div className="h-full min-h-0 bg-neutral-100 p-3">
      <div
        ref={panel}
        className="relative flex h-full min-h-[30rem] justify-center overflow-hidden"
      >
        <div style={{ width: width * scale, height: height * scale }} className="shrink-0">
          <iframe
            ref={frame}
            title="Page preview"
            srcDoc={`<!doctype html><html lang="${locale.replace(/[^A-Za-z-]/g, "")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body></body></html>`}
            onLoad={() => {
              setBody(frame.current?.contentDocument?.body ?? null);
            }}
            className="origin-top-left rounded-card border border-line bg-white shadow-sm"
            style={{ width, height, transform: `scale(${String(scale)})` }}
          />
        </div>
      </div>
      {body
        ? createPortal(
            <>
              <style>{css}</style>
              <main id="main">
                {document.root.length === 0 ? (
                  <p className="svb-empty-page">This page has no sections yet. Add one to start.</p>
                ) : null}
                <RenderDocument
                  document={document}
                  registry={STOREVIA_REGISTRY}
                  ctx={ctx}
                  wrapSection={(node, _position, content) => (
                    <div
                      data-svb-section={node.id}
                      data-label={
                        node.hidden
                          ? `${labelFor(node.type)}: hidden on your site`
                          : `${labelFor(node.type)}: add content to show this section`
                      }
                      {...(node.id === selectedId ? { "data-selected": "" } : {})}
                      {...(node.hidden ? { "data-hidden": "" } : {})}
                    >
                      {content}
                    </div>
                  )}
                />
              </main>
            </>,
            body,
          )
        : null}
    </div>
  );
}
