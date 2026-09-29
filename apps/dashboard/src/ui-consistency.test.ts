import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// UI consistency regression checks (post-M7). Deliberately few and coarse:
// they catch the patterns that drifted before (hand-rolled buttons, page
// titles outside PageHeader, full-width buttons on desktop) without
// policing class names. Each exception is listed with its reason; a new
// file needing one should earn it the same way.

const SRC = import.meta.dirname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith(".tsx") && !name.includes(".test.") ? [path] : [];
  });
}

const FILES = sources(SRC).map((path) => ({
  path: relative(SRC, path).split(sep).join("/"),
  text: readFileSync(path, "utf8"),
}));

/** Files whose raw <button> elements are composite controls, not buttons in the design-system sense. */
const RAW_BUTTON_ALLOWED: Readonly<Record<string, string>> = {
  "components/shell/mobile-nav.tsx": "bottom tab bar slots",
  "components/shell/sidebar.tsx": "rail toggle",
  "components/shell/command.tsx": "search field trigger",
  "components/themes/theme-editor.tsx": "colour swatch picker",
  "components/themes/theme-demo.tsx": "storefront markup inside the demo frame (sv-button)",
  "components/site/canvas.tsx": "storefront markup inside the builder canvas (sv-button)",
  "components/site/builder.tsx": "block palette tiles and outline rows",
  "components/site/pickers.tsx": "media and link picker tiles",
  "components/areas/standalone.tsx": "form submit styled by buttonClasses",
  "components/catalogue/editor/media-card.tsx": "media tiles and the upload drop zone",
  "components/catalogue/editor/category-picker.tsx": "tree rows and inline text actions",
  "components/catalogue/history-filter.tsx": "inline text action",
  "components/catalogue/media-library.tsx": "media grid tiles",
  "app/(app)/o/[orgId]/members/member-forms.tsx": "inline text action in a list",
};

/** Pages that draw their own single h1 (full-screen flows without the app shell header). */
const OWN_H1_ALLOWED = new Set([
  "app/(app)/onboarding/page.tsx",
  "app/(app)/account/security/page.tsx",
  "app/(app)/account/profile/page.tsx",
  "app/invitations/[token]/page.tsx",
]);

/** Single-column, phone-width flows where a full-width primary action is the pattern. */
const FULL_WIDTH_ALLOWED = [
  "app/(auth)/",
  "app/invitations/",
  "app/(app)/onboarding/",
  // Equal-width cells of the theme card's action grid, not page-wide buttons.
  "components/themes/theme-library.tsx",
  "app/(app)/s/[storeId]/themes/page.tsx",
];

describe("UI consistency", () => {
  it("buttons come from the design system: raw <button> only in known composite controls", () => {
    const offenders = FILES.filter(
      (f) => /<button[\s>]/.test(f.text) && !(f.path in RAW_BUTTON_ALLOWED),
    ).map((f) => f.path);
    expect(offenders, "use Button / IconButton from @storevia/ui/button").toEqual([]);
  });

  it("links never hand-roll a primary button (use buttonClasses)", () => {
    const offenders = FILES.filter((f) =>
      /<(a|Link)\b[^>]*className="[^"]*\bbg-brand-600\b[^"]*"/.test(f.text),
    ).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("app pages title themselves through PageHeader (one h1 per page)", () => {
    const offenders = FILES.filter(
      (f) =>
        f.path.startsWith("app/") &&
        f.path.endsWith("/page.tsx") &&
        /<h1[\s>]/.test(f.text) &&
        !OWN_H1_ALLOWED.has(f.path),
    ).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("no full-width buttons on desktop: w-full on a button needs a phone-only prefix", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      if (FULL_WIDTH_ALLOWED.some((p) => f.path.startsWith(p))) continue;
      const tags = f.text.match(/<(Button|SubmitButton)\b[^>]*>/g) ?? [];
      for (const tag of tags) {
        const unprefixed = /className="[^"]*(?<![\w:-])w-full\b/.test(tag);
        const reset = /\b(sm|md|lg):w-auto\b/.test(tag);
        if ((unprefixed && !reset) || /\bfullWidth\b(?!=\{false\})/.test(tag)) {
          offenders.push(`${f.path}: ${tag.slice(0, 80)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the exceptions still exist (a stale entry hides nothing)", () => {
    for (const path of Object.keys(RAW_BUTTON_ALLOWED)) {
      const file = FILES.find((f) => f.path === path);
      expect(file, path).toBeDefined();
      expect(/<button[\s>]/.test(file?.text ?? ""), path).toBe(true);
    }
  });
});
