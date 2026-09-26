// Dependency direction (ADR-0029): the Site Engine never reaches commerce,
// the editor (which imports commerce), billing, plans, merchant services,
// auth, the UI kit or an app, not even transitively through another
// package. ESLint checks direct imports; this walks every module the Site
// Engine can load, following workspace package exports, and fails on the
// first forbidden one. It also keeps public cookies host-only.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../..");
const ENGINE = resolve(import.meta.dirname);

/** Workspace packages the Site Engine may depend on (directly or not). */
const ALLOWED_WORKSPACE = new Set([
  "@storevia/site-engine",
  "@storevia/domains",
  "@storevia/database",
  "@storevia/media",
  "@storevia/observability",
  "@storevia/security",
  "@storevia/types",
  "@storevia/validation",
]);
/** Within @storevia/media, only the public URL module and what it needs. */
const MEDIA_ALLOWED = /^packages\/media\/src\/(urls|config|keys|storage|s3|local|sigv4)\.ts$/;
const FORBIDDEN_EXTERNAL = /^(@tiptap\/|prosemirror|recharts|chart\.js|@storevia\/)/;

interface Workspace {
  readonly dir: string;
  readonly exports: Record<string, string>;
}

function workspaces(): Map<string, Workspace> {
  const map = new Map<string, Workspace>();
  for (const group of ["packages", "apps"]) {
    for (const name of readdirSync(join(ROOT, group))) {
      const manifest = join(ROOT, group, name, "package.json");
      if (!existsSync(manifest)) continue;
      const pkg = JSON.parse(readFileSync(manifest, "utf8")) as {
        name: string;
        exports?: Record<string, string>;
      };
      map.set(pkg.name, { dir: join(ROOT, group, name), exports: pkg.exports ?? {} });
    }
  }
  return map;
}

const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

function specifiers(file: string): string[] {
  const source = stripComments(readFileSync(file, "utf8"));
  const found = new Set<string>();
  for (const re of [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ]) {
    for (const match of source.matchAll(re)) if (match[1]) found.add(match[1]);
  }
  return [...found];
}

function resolveFile(base: string): string | null {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
    base.replace(/\.js$/, ".ts"),
    base.replace(/\.js$/, ".tsx"),
  ];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const rel = (path: string) => relative(ROOT, path).split(sep).join("/");

function walk(entries: readonly string[]) {
  const packages = workspaces();
  const visited = new Set<string>();
  const externals = new Set<string>();
  const workspaceReached = new Set<string>();
  const problems: string[] = [];
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    for (const spec of specifiers(file)) {
      let target: string | null;
      if (spec.startsWith(".")) {
        target = resolveFile(resolve(dirname(file), spec));
        if (!target) problems.push(`${rel(file)}: can't resolve ${spec}`);
      } else {
        const parts = spec.split("/");
        const name = spec.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? spec);
        const workspace = packages.get(name);
        if (!workspace) {
          externals.add(name);
          continue;
        }
        workspaceReached.add(name);
        const rest = spec.slice(name.length);
        const exported = workspace.exports[rest ? `.${rest}` : "."];
        if (!exported) {
          problems.push(`${rel(file)}: ${spec} is not an export of ${name}`);
          continue;
        }
        target = resolveFile(resolve(workspace.dir, exported));
      }
      if (target) queue.push(target);
    }
  }
  return { visited, externals, workspaceReached, problems };
}

describe("Site Engine dependency boundary", () => {
  const graph = walk(sourceFiles(ENGINE));

  it("resolves every import it follows", () => {
    expect(graph.problems).toEqual([]);
  });

  it("reaches only generic workspace packages", () => {
    const outside = [...graph.workspaceReached].filter((name) => !ALLOWED_WORKSPACE.has(name));
    expect(outside).toEqual([]);
    const forbiddenFiles = [...graph.visited]
      .map(rel)
      .filter(
        (path) =>
          path.startsWith("apps/") ||
          /^packages\/(commerce|editor|billing|entitlements|tenancy|auth|payments|ui|email|jobs)\//.test(
            path,
          ) ||
          (path.startsWith("packages/media/") && !MEDIA_ALLOWED.test(path)),
      );
    expect(forbiddenFiles).toEqual([]);
  });

  it("loads no editor, chart or admin libraries", () => {
    expect([...graph.externals].filter((name) => FORBIDDEN_EXTERNAL.test(name))).toEqual([]);
  });

  it("really does walk the graph (the database and resolver are reached)", () => {
    const paths = [...graph.visited].map(rel);
    expect(paths).toContain("packages/domains/src/resolver.ts");
    expect(paths).toContain("packages/media/src/urls.ts");
    expect(paths).toContain("packages/database/src/storefront.ts");
  });
});

describe("public cookies stay host-only", () => {
  it("no public code sets a cookie Domain", () => {
    const dirs = [
      "packages/site-engine/src",
      "apps/storefront/src",
      "packages/commerce/src/storefront",
      "packages/domains/src",
    ];
    const offenders = dirs.flatMap((dir) =>
      sourceFiles(join(ROOT, dir)).flatMap((file) => {
        const source = stripComments(readFileSync(file, "utf8"));
        return /\bdomain\s*:|Domain=/.test(source) ? [rel(file)] : [];
      }),
    );
    expect(offenders).toEqual([]);
  });
});
