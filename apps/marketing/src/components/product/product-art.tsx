// Line drawings of the sample products in the storefront and commerce
// mockups, in the illustration language: navy 1.5 strokes on a 96 grid, one
// soft brand accent per piece. Decorative only (the mockup carries the label).
import { cn } from "@storevia/ui/cn";
import type { ReactNode } from "react";
import type { ProductArtKind } from "./sample-data";

const INK = "stroke-navy-900";
const PAPER = "fill-white stroke-navy-900";
const ACCENT = "fill-brand-50 stroke-brand-500";

const ART: Record<ProductArtKind, ReactNode> = {
  mug: (
    <>
      <path d="M62 40h5a9 9 0 0 1 0 18h-5" className={INK} />
      <path d="M30 30h32v34a8 8 0 0 1-8 8H38a8 8 0 0 1-8-8z" className={PAPER} />
      <path d="M30 44l32-5.3v9L30 53z" className={ACCENT} />
      <path d="M26 78h44" className={INK} />
    </>
  ),
  vase: (
    <>
      <path
        d="M41 20h14v6c0 5 11 10 11 26 0 14-7 22-18 22s-18-8-18-22c0-16 11-21 11-26z"
        className={PAPER}
      />
      <path d="M31 50l34-5.6v8.2L31 58.2z" className={ACCENT} />
      <path d="M26 78h44" className={INK} />
    </>
  ),
  board: (
    <>
      <path
        d="M22 44h40l10-6h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4l-10-6H22a4 4 0 0 1-4-4v0a4 4 0 0 1 4-4z"
        className={PAPER}
      />
      <path
        d="M22 60h40a4 4 0 0 1 4 4v0a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4v0a4 4 0 0 1 4-4z"
        className={PAPER}
      />
      <path d="M28 64l24-4" className="stroke-brand-500" />
      <path d="M18 78h60" className={INK} />
    </>
  ),
  apron: (
    <>
      <path d="M38 18c0 8 4 12 10 12s10-4 10-12" className={INK} />
      <path d="M36 30h24l6 10-4 4v32H34V44l-4-4z" className={PAPER} />
      <path d="M40 54h16v10H40z" className={ACCENT} />
      <path d="M30 40l-8 4M66 40l8 4" className={INK} />
    </>
  ),
};

export function ProductArt({ kind, className }: { kind: ProductArtKind; className?: string }) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      strokeWidth={1.5}
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("block [&_*]:[vector-effect:non-scaling-stroke]", className)}
    >
      {ART[kind]}
    </svg>
  );
}
