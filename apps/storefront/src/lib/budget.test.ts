// Performance budget guard (06-storefront.md §10, M4-09). Everything the
// storefront renders is a server component: the only client module is the
// error boundary Next.js requires. Store pages therefore ship the framework
// runtime and no application JavaScript; a new "use client" module (here or
// in the editor's renderers) must be a deliberate, reviewed change.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = [
  resolve(import.meta.dirname, ".."),
  resolve(import.meta.dirname, "../../../../packages/editor/src"),
];
const ALLOWED = new Set(["app/sv/[storeId]/error.tsx"]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("storefront client JavaScript", () => {
  it("has no client components beyond the required error boundary", () => {
    const client = ROOTS.flatMap((root) =>
      files(root)
        .filter((path) => /^\s*["']use client["']/.test(readFileSync(path, "utf8")))
        .map((path) => relative(root, path)),
    );
    expect(client.filter((path) => !ALLOWED.has(path))).toEqual([]);
  });
});
