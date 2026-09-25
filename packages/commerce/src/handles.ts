// URL handles for products and collections (ADR-0027 §4). Pure and
// client-safe: the editor previews the generated handle with the same code
// the server uses.

export const HANDLE_MAX_LENGTH = 100;
export const HANDLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Handles the storefront (M4) needs for its own routes, or that would read as
 * Storevia pages. Refused for products and collections alike.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "account",
  "admin",
  "all",
  "api",
  "cart",
  "checkout",
  "collections",
  "edit",
  "login",
  "logout",
  "new",
  "orders",
  "pages",
  "password",
  "products",
  "search",
  "sitemap",
  "storevia",
]);

/**
 * A handle from free text: Latin diacritics folded, anything else outside
 * a-z/0-9 becomes a single hyphen. May return "" (e.g. a title in a script
 * with no Latin letters); callers fall back to a generic handle.
 */
export function slugify(text: string): string {
  const folded = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/æ/gi, "ae")
    .replace(/ø/gi, "o")
    .replace(/œ/gi, "oe")
    .replace(/&/g, " and ")
    .toLowerCase();
  const hyphenated = folded.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (hyphenated.length <= HANDLE_MAX_LENGTH) return hyphenated;
  // Cut at a word boundary where possible, leaving room for a "-NN" suffix.
  const cut = hyphenated.slice(0, HANDLE_MAX_LENGTH - 4);
  const boundary = cut.lastIndexOf("-");
  return (boundary > 40 ? cut.slice(0, boundary) : cut).replace(/-+$/, "");
}

export type HandleProblem = "empty" | "format" | "too_long" | "reserved";

/** Why an explicit handle is unacceptable, or null when it is fine. */
export function handleProblem(handle: string): HandleProblem | null {
  if (handle.length === 0) return "empty";
  if (handle.length > HANDLE_MAX_LENGTH) return "too_long";
  if (!HANDLE_RE.test(handle)) return "format";
  if (RESERVED_HANDLES.has(handle)) return "reserved";
  return null;
}

export const HANDLE_MESSAGES: Record<HandleProblem, string> = {
  empty: "Enter a URL handle.",
  format: "Use lower-case letters, numbers and single hyphens.",
  too_long: `Use at most ${String(HANDLE_MAX_LENGTH)} characters.`,
  reserved: "That handle is reserved. Choose another.",
};

/**
 * The generated handle for a title, avoiding `taken` handles by appending
 * -2, -3, … (the base is shortened if the suffix would overflow).
 */
export function uniqueHandle(
  title: string,
  taken: ReadonlySet<string>,
  fallback = "product",
): string {
  let base = slugify(title);
  if (base === "" || RESERVED_HANDLES.has(base)) base = base === "" ? fallback : `${base}-1`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${String(n)}`;
    const stem = base.slice(0, HANDLE_MAX_LENGTH - suffix.length).replace(/-+$/, "");
    const candidate = `${stem}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
