import { House } from "lucide-react";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  GLYPH_NAMES,
  Glyph,
  GlyphTile,
  Icon,
  LOGO_SLANT,
  Logo,
  LogoMark,
  type IconSize,
} from "./icons";

const ids = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const refs = (html: string) => [...html.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
const pathData = (html: string) => [...html.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1] ?? "");

/** Straight segments ([x1, y1, x2, y2]) of SVG path data; curves only move the pen. */
function lineSegments(d: string): [number, number, number, number][] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const arity: Record<string, number> = { a: 7, c: 6, s: 4, q: 4, t: 2 };
  const segs: [number, number, number, number][] = [];
  let i = 0;
  let cmd = "";
  let [x, y, sx, sy] = [0, 0, 0, 0];
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i] ?? "")) cmd = tokens[i++] ?? "";
    const op = cmd.toLowerCase();
    const rel = cmd === op;
    if (op === "z") {
      segs.push([x, y, sx, sy]);
      [x, y] = [sx, sy];
      continue;
    }
    if (op === "m" || op === "l") {
      const [nx, ny] = [num(), num()];
      const [ex, ey] = rel ? [x + nx, y + ny] : [nx, ny];
      if (op === "l") segs.push([x, y, ex, ey]);
      else {
        [sx, sy] = [ex, ey];
        cmd = rel ? "l" : "L";
      }
      [x, y] = [ex, ey];
    } else if (op === "h" || op === "v") {
      const n = num();
      const [ex, ey] = op === "h" ? [rel ? x + n : n, y] : [x, rel ? y + n : n];
      segs.push([x, y, ex, ey]);
      [x, y] = [ex, ey];
    } else {
      const args = Array.from({ length: arity[op] ?? 2 }, num);
      const [ex, ey] = args.slice(-2) as [number, number];
      [x, y] = rel ? [x + ex, y + ey] : [ex, ey];
    }
  }
  return segs;
}

/** Slope class of a segment: "flat", "upright", "rise" (/), "fall" (\) or "other". */
function slope([x1, y1, x2, y2]: [number, number, number, number]) {
  const [dx, dy] = [x2 - x1, y2 - y1];
  if (Math.abs(dy) < 0.02) return "flat";
  if (Math.abs(dx) < 0.02) return "upright";
  const s = -dy / dx; // screen y points down
  if (Math.abs(Math.abs(s) - LOGO_SLANT) < 0.012) return s > 0 ? "rise" : "fall";
  return "other";
}

describe("Logo", () => {
  it("is one image named Storevia; its parts are hidden from assistive tech", () => {
    const html = renderToStaticMarkup(<Logo />);
    expect(html).toMatch(/^<span role="img" aria-label="Storevia"/);
    // Mark and wordmark are both decorative SVG inside the named lockup.
    expect(html.match(/<svg [^>]*aria-hidden="true"/g)).toHaveLength(2);
  });

  it("draws the wordmark as outlines with a real dot, never a dotless i", () => {
    const html = renderToStaticMarkup(<Logo />);
    // No live text: nothing to misspell in copy, find-in-page or forced colours.
    expect(html.replace(/<[^>]*>/g, "")).toBe("");
    expect(html).not.toContain("ı");
    expect(html).not.toMatch(/bg-\[#4A67FF\]/);
    expect(html).toContain('<circle cx="3217" cy="82" r="70" fill="#4A67FF">');
    const wordmark = (logo: string) =>
      /<svg viewBox="0 0 3842 769"[^>]*class="([^"]+)"/.exec(logo)?.[1];
    expect(wordmark(html)?.split(" ")).toEqual(
      expect.arrayContaining(["fill-current", "text-navy-900"]),
    );
    expect(wordmark(renderToStaticMarkup(<Logo variant="inverse" />))).toContain("text-white");
    // Browsers keep an SVG's own colour in forced colours: the letters switch explicitly.
    expect(wordmark(html)).toContain("forced-colors:fill-[CanvasText]");
  });

  it("gives every instance its own ids, and every paint reference resolves", () => {
    const html = renderToStaticMarkup(
      <div>
        <Logo />
        <Logo variant="inverse" />
        <LogoMark size={32} />
      </div>,
    );
    const all = ids(html);
    expect(all).toHaveLength(18); // 5 gradients + 1 mask, × 3 marks
    expect(new Set(all).size).toBe(all.length);
    const used = refs(html);
    expect(used.length).toBeGreaterThan(0);
    for (const ref of used) expect(all).toContain(ref);
  });

  it("keeps the existing props working and labels the admin tag", () => {
    expect(renderToStaticMarkup(<Logo variant="admin" />)).toContain('aria-label="Storevia Admin"');
    const tagged = renderToStaticMarkup(<Logo variant="admin" tag="Platform admin" />);
    expect(tagged).toContain('aria-label="Storevia Platform admin"');
    expect(tagged).toContain(">Platform admin</span>");
    const mono = renderToStaticMarkup(<Logo monogramOnly className="text-lg" />);
    expect(mono).toContain('aria-label="Storevia"');
    expect(mono.match(/<svg /g)).toHaveLength(1);
    // A caller's text-* class replaces the size default.
    expect(mono).toContain("text-lg");
    expect(mono).not.toContain("text-[19px]");
  });

  it("derives the wordmark size from a numeric mark height", () => {
    expect(renderToStaticMarkup(<Logo size={28} />)).toContain("font-size:20px");
  });
});

describe("LogoMark", () => {
  it("is decorative unless labelled; label and the older title both name it", () => {
    expect(renderToStaticMarkup(<LogoMark />)).toContain('aria-hidden="true"');
    for (const props of [{ label: "Storevia" }, { title: "Storevia" }]) {
      const html = renderToStaticMarkup(<LogoMark size={114} {...props} />);
      expect(html).toContain('role="img" aria-label="Storevia"');
      expect(html).toContain("<title>Storevia</title>");
      expect(html).toContain('width="100" height="114"');
    }
  });

  it("renders outside React with an idPrefix (next/og, favicon scripts)", () => {
    // Call the components as plain functions, as satori does: a hook here would throw.
    const outer = LogoMark({ idPrefix: "og", size: 64 }) as ReactElement<Record<string, unknown>>;
    const render = outer.type as (props: Record<string, unknown>) => ReactElement;
    const svg = render(outer.props);
    expect(svg.type).toBe("svg");
    const html = renderToStaticMarkup(<LogoMark idPrefix="og" />);
    expect(ids(html)).toEqual(["og-base", "og-top", "og-mid", "og-bottom", "og-mask", "og-fade"]);
    expect(html).toContain('mask="url(#og-fade)"');
  });

  it("follows the contract geometry: alternating slants, vertical cuts, open counters", () => {
    const [ribbon = ""] = pathData(renderToStaticMarkup(<LogoMark />));
    const kinds = lineSegments(ribbon).map(slope);
    expect(kinds).not.toContain("other");
    // Top and bottom bands rise, the middle band falls, both ends are cut vertically.
    expect(kinds.filter((k) => k === "rise")).toHaveLength(4);
    expect(kinds.filter((k) => k === "fall")).toHaveLength(2);
    expect(kinds.filter((k) => k === "upright")).toHaveLength(2);
    // Folds are concentric arcs; each counter keeps a visible radius.
    const radii = [...ribbon.matchAll(/A([\d.]+) /g)].map((m) => Number(m[1]));
    const outer = Math.max(...radii);
    const counter = Math.min(...radii);
    expect(counter / (outer - counter)).toBeGreaterThan(0.2);
  });
});

describe("Icon", () => {
  it("is decorative by default and named when labelled", () => {
    expect(renderToStaticMarkup(<Icon icon={House} />)).toContain('aria-hidden="true"');
    const labelled = renderToStaticMarkup(<Icon icon={House} label="Home" />);
    expect(labelled).toContain('aria-label="Home"');
    expect(labelled).toContain('role="img"');
  });

  it("maps sizes to the scale and thins the stroke at 32 px", () => {
    const at = (size: IconSize) => renderToStaticMarkup(<Icon icon={House} size={size} />);
    expect(at("sm")).toContain("size-4");
    expect(at("nav")).toContain("size-[18px]");
    expect(at(18)).toContain("size-[18px]");
    expect(at("lg")).toContain('stroke-width="1.75"');
    expect(at("xl")).toContain('stroke-width="1.5"');
    expect(at(32)).toContain("size-8");
    expect(at("xs")).toContain("size-3.5");
  });
});

describe("Glyph", () => {
  it("renders every glyph, including the older names, with one accent piece", () => {
    for (const name of GLYPH_NAMES) {
      const html = renderToStaticMarkup(<Glyph name={name} />);
      expect(html, name).toContain(`data-glyph="${name}"`);
      expect(html.match(/<path /g)?.length, name).toBe(2);
      expect(html.match(/stroke-\(--glyph-accent\)/g)?.length, name).toBe(1);
      expect(html, name).not.toMatch(/d=""|NaN|undefined/);
    }
  });

  it("draws every diagonal at the mark's slant", () => {
    for (const name of GLYPH_NAMES) {
      const html = renderToStaticMarkup(<Glyph name={name} />);
      const segments = pathData(html).flatMap(lineSegments);
      const off = segments.filter(
        (s) => Math.hypot(s[2] - s[0], s[3] - s[1]) > 0.3 && slope(s) === "other",
      );
      expect(off, name).toEqual([]);
    }
  });

  it("draws aliases with their canonical artwork", () => {
    const art = (name: Parameters<typeof Glyph>[0]["name"]) =>
      renderToStaticMarkup(<Glyph name={name} />).replace(/data-glyph="[^"]+"/, "");
    expect(art("business-website")).toBe(art("website"));
    expect(art("publication")).toBe(art("publishing"));
    expect(art("retail-outlet")).toBe(art("retail"));
    expect(art("store")).toBe(art("online-store"));
    expect(GLYPH_NAMES).toEqual(
      expect.arrayContaining([
        "website",
        "commerce",
        "publishing",
        "portfolio",
        "analytics",
        "teams",
        "domains",
        "themes",
        "integrations",
        "retail",
        "builder",
        "content",
        "online-store",
        "business-website",
        "publication",
      ]),
    );
  });

  it("switches the accent through a CSS variable; label and title name it", () => {
    expect(renderToStaticMarkup(<Glyph name="teams" accent="violet" />)).toContain(
      "[--glyph-accent:var(--color-accent-500)]",
    );
    for (const props of [{ label: "Teams" }, { title: "Teams" }]) {
      const html = renderToStaticMarkup(<Glyph name="teams" {...props} />);
      expect(html).toContain('role="img" aria-label="Teams"');
      expect(html).not.toContain("aria-hidden");
    }
  });

  it("puts tiles in the requested tone and names them on request", () => {
    expect(renderToStaticMarkup(<GlyphTile name="commerce" />)).toContain("bg-brand-50");
    expect(renderToStaticMarkup(<GlyphTile name="commerce" tone="accent" size="xl" />)).toContain(
      "bg-accent-50",
    );
    expect(renderToStaticMarkup(<GlyphTile name="commerce" tone="neutral" size="sm" />)).toContain(
      "size-9",
    );
    expect(renderToStaticMarkup(<GlyphTile name="commerce" label="Commerce" />)).toContain(
      'role="img" aria-label="Commerce"',
    );
    const older = { title: "Commerce" };
    expect(renderToStaticMarkup(<GlyphTile name="commerce" {...older} />)).toContain(
      'aria-label="Commerce"',
    );
  });
});
