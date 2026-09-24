import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LOGO_SLANT } from "./icons";
import {
  BUSINESS_SCENE_TYPES,
  BusinessScene,
  ILLUSTRATION_NAMES,
  Illustration,
} from "./illustrations";

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

/** Diagonals that are not at the ribbon slant (tiny joins ignored). */
function offSlant(html: string) {
  return pathData(html)
    .flatMap(lineSegments)
    .filter(([x1, y1, x2, y2]) => {
      const [dx, dy] = [x2 - x1, y2 - y1];
      if (Math.hypot(dx, dy) < 0.3 || Math.abs(dx) < 0.02 || Math.abs(dy) < 0.02) return false;
      return Math.abs(Math.abs(dy / dx) - LOGO_SLANT) > 0.012;
    });
}

/** Checks the art's paint: one stroke weight, and accent colour only via the variables. */
function expectHouseStyle(html: string, name: string) {
  expect(html, name).toMatch(/stroke-\(--illo-accent\)/);
  expect(html, name).not.toMatch(/(?:stroke|fill)-(?:brand|accent)-\d/);
  expect(html.match(/stroke-width=/g), name).toHaveLength(1);
  expect(html, name).not.toMatch(/NaN|undefined/);
}

describe("Illustration", () => {
  it("renders every empty-state and status illustration as decorative art", () => {
    expect(ILLUSTRATION_NAMES).toEqual(
      expect.arrayContaining([
        "empty-orders",
        "empty-products",
        "empty-content",
        "empty-analytics",
        "empty-team",
        "empty-domains",
        "empty-search",
        "empty-inbox",
        "empty-activity",
        "setup-complete",
        "locked-feature",
        "error",
        "not-found",
      ]),
    );
    for (const name of ILLUSTRATION_NAMES) {
      const html = renderToStaticMarkup(<Illustration name={name} />);
      expect(html, name).toContain(`data-illustration="${name}"`);
      expect(html, name).toContain('aria-hidden="true"');
      expect(html, name).toContain('width="120" height="120"');
      expectHouseStyle(html, name);
    }
  });

  it("builds its subjects on the ribbon slant (checkmarks aside)", () => {
    for (const name of ILLUSTRATION_NAMES) {
      const off = offSlant(renderToStaticMarkup(<Illustration name={name} />));
      // setup-complete's three ticks are the only non-ribbon diagonals.
      expect(off, name).toHaveLength(name === "setup-complete" ? 6 : 0);
    }
  });

  it("maps its palette to system colours in forced-colours mode", () => {
    for (const html of [
      renderToStaticMarkup(<Illustration name="error" />),
      renderToStaticMarkup(<BusinessScene type="portfolio" />),
    ]) {
      expect(html).toContain("forced-colors:[&amp;_.stroke-navy-900]:stroke-[CanvasText]");
      expect(html).toContain("forced-colors:[&amp;_.fill-white]:fill-[Canvas]");
    }
  });

  it("sizes, labels and recolours on request", () => {
    const html = renderToStaticMarkup(
      <Illustration name="setup-complete" size="sm" accent="violet" label="Setup complete" />,
    );
    expect(html).toContain('width="96" height="96"');
    expect(html).toContain('role="img" aria-label="Setup complete"');
    expect(html).toContain("<title>Setup complete</title>");
    expect(html).toContain("[--illo-accent:var(--color-accent-500)]");
    // The older prop name still names the art.
    const older = { title: "Error" };
    expect(renderToStaticMarkup(<Illustration name="error" {...older} />)).toContain(
      'aria-label="Error"',
    );
  });
});

describe("BusinessScene", () => {
  it("renders every business type, by artwork key and by BusinessType value", () => {
    expect(BUSINESS_SCENE_TYPES).toEqual(
      expect.arrayContaining([
        "online-store",
        "business-website",
        "publication",
        "portfolio",
        "retail-outlet",
      ]),
    );
    for (const type of BUSINESS_SCENE_TYPES) {
      const html = renderToStaticMarkup(<BusinessScene type={type} />);
      expect(html, type).toContain(`data-scene="${type}"`);
      expect(html, type).toContain('aria-hidden="true"');
      expectHouseStyle(html, type);
      expect(offSlant(html), type).toEqual([]);
    }
    const byDomain = {
      ECOMMERCE: "online-store",
      BUSINESS: "business-website",
      PUBLISHING: "publication",
      PORTFOLIO: "portfolio",
    } as const;
    for (const [type, key] of Object.entries(byDomain)) {
      expect(
        renderToStaticMarkup(<BusinessScene type={type as keyof typeof byDomain} />),
      ).toContain(`data-scene="${key}"`);
    }
  });

  it("can be labelled", () => {
    for (const props of [{ label: "A portfolio" }, { title: "A portfolio" }]) {
      const html = renderToStaticMarkup(<BusinessScene type="portfolio" {...props} />);
      expect(html).toContain('role="img" aria-label="A portfolio"');
    }
  });
});
