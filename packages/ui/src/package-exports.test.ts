import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Apps import each module from its own entry point ("@storevia/ui/form"), never
// from a barrel: a barrel that re-exports client modules makes Next.js ship
// every one of them on every page that imports it
// (docs/architecture/12-design-system.md §3).

const root = join(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  exports: Record<string, string>;
};

// Modules other modules build on; not entry points.
const INTERNAL = new Set([
  "chart-card",
  "chart-context",
  "chart-core",
  "chart-parts",
  "chart-plots",
  "command-parts",
  "data-scroll",
  "form-core",
  "motion-client",
  "motion-core",
  "overlays-focus",
  "overlays-shared",
]);

const modules = readdirSync(join(root, "src"))
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => f.replace(/\.tsx?$/, ""));

describe("package entry points", () => {
  it("has no root barrel", () => {
    expect(Object.keys(pkg.exports)).not.toContain(".");
    expect(modules).not.toContain("index");
  });

  it("points every entry at a file that exists", () => {
    for (const target of Object.values(pkg.exports)) {
      expect(existsSync(join(root, target)), target).toBe(true);
    }
  });

  it("exports every public module under its own name, and no internal one", () => {
    const entries = Object.keys(pkg.exports)
      .filter((key) => key !== "./theme.css")
      .map((key) => key.slice(2));
    const expected = modules.filter((m) => !INTERNAL.has(m));
    expect([...entries].sort()).toEqual([...expected].sort());
    for (const key of entries) expect(pkg.exports[`./${key}`]).toMatch(`./src/${key}.ts`);
  });
});
