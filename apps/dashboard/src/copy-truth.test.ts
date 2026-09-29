import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Product copy tells the truth (DB-5): no internal milestone numbers, no
// "Soon" dead ends, no dates for things that aren't built. Scans the
// dashboard's and the staff console's source, comments removed, so only
// strings and markup a person could read are checked. Statuses themselves
// come from @storevia/entitlements/availability and STORE_AREAS (tested in
// lib/areas and lib/dashboard).

const APPS = join(import.meta.dirname, "..", "..");
const ROOTS = [join(APPS, "dashboard", "src"), join(APPS, "platform-admin", "src")];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

/** Source without comments: block comments, JSX comments and line comments (not "https://"). */
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\"'`])\/\/.*$/gm, "$1");
}

const FILES = ROOTS.flatMap((root) =>
  sources(root).map((path) => ({
    path: relative(APPS, path).split(sep).join("/"),
    text: withoutComments(readFileSync(path, "utf8")),
  })),
);

const offending = (pattern: RegExp) =>
  FILES.filter((file) => pattern.test(file.text)).map((file) => file.path);

describe("product copy", () => {
  it("scans the apps' sources", () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(withoutComments('a // Milestone 6\nb /* Milestone 7 */ "https://x"')).toBe(
      'a \nb  "https://x"',
    );
  });

  it("never names an internal milestone", () => {
    expect(offending(/\bMilestones? \d/)).toEqual([]);
  });

  it("mentions automatic discounts only as something that isn't available", () => {
    let mentions = 0;
    for (const file of FILES) {
      for (const [sentence] of file.text.matchAll(/[^.]*\bautomatic discounts?\b[^.]*\./gi)) {
        mentions += 1;
        expect(sentence, file.path).toMatch(/(aren|isn)(&apos;|')t available|not available/);
      }
    }
    expect(mentions).toBeGreaterThan(0);
  });

  it("never promises a release or labels an area Soon", () => {
    expect(offending(/later release|coming in |On the roadmap|What's coming/i)).toEqual([]);
    expect(offending(/["'>]\s*Soon\s*["'<]/)).toEqual([]);
  });
});
