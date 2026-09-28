// Product tag policy (09-commerce.md "Tags"). Tags are the merchant's own
// labels for finding and grouping products in the dashboard: plain text,
// never HTML (React escapes them wherever they appear), never storefront
// navigation. The commerce services apply this on every write, so it is the
// authoritative rule; the editor uses the same functions to preview chips.
// The database enforces the resulting shape (CHECK catalogue_tags_valid).
//
// Policy:
// - Unicode is NFC-normalised; control characters become spaces and
//   invisible formatting characters (zero-width spaces, bidi overrides, BOM)
//   are removed; whitespace is trimmed and collapsed to single spaces.
// - A comma always separates tags, so a tag never contains one.
// - Duplicates are dropped ignoring case; the first spelling is kept
//   ("Summer, summer" → "Summer"). Case is otherwise preserved.
// - At most PRODUCT_TAG_LIMIT tags of at most PRODUCT_TAG_MAX_LENGTH
//   characters each; longer or more is an error for the "tags" field, never
//   a silent cut.

export const PRODUCT_TAG_LIMIT = 50;
export const PRODUCT_TAG_MAX_LENGTH = 40;

// C0/C1 controls (tabs, newlines, DEL and so on) read as spaces between words.
const CONTROL = /\p{Cc}+/gu;
// Invisible formatting that can disguise one tag as another. The zero-width
// joiner (U+200D) stays: emoji sequences need it.
const INVISIBLE =
  /[\u00AD\u180E\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/gu;

/** One tag cleaned up; "" when nothing is left. */
export function cleanTag(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(CONTROL, " ")
    .replace(INVISIBLE, "")
    .replace(/\s+/gu, " ")
    .trim();
}

/** The case-insensitive identity of a tag (for de-duplication and matching). */
export function tagKey(tag: string): string {
  return tag.toLocaleLowerCase("en");
}

/** Length in characters as the database counts them (code points). */
export function tagLength(tag: string): number {
  return Array.from(tag).length;
}

/** Splits free text or a list into raw tags: every comma separates. */
export function splitTags(value: string | readonly string[]): string[] {
  return (typeof value === "string" ? [value] : value).flatMap((part) => part.split(","));
}

export interface TagNormalisation {
  readonly tags: string[];
  /** The first problem found, worded for the "tags" field; null when valid. */
  readonly problem: string | null;
}

/** Applies the policy above to a list or comma-separated text. */
export function normaliseTags(value: string | readonly string[]): TagNormalisation {
  const tags: string[] = [];
  const seen = new Set<string>();
  let problem: string | null = null;
  for (const raw of splitTags(value)) {
    const tag = cleanTag(raw);
    if (!tag) continue;
    const key = tagKey(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    if (tagLength(tag) > PRODUCT_TAG_MAX_LENGTH) {
      problem ??= `Tags can be at most ${String(PRODUCT_TAG_MAX_LENGTH)} characters. Shorten “${Array.from(tag).slice(0, 20).join("")}…”.`;
    }
    tags.push(tag);
  }
  if (tags.length > PRODUCT_TAG_LIMIT) {
    problem ??= `Use at most ${String(PRODUCT_TAG_LIMIT)} tags.`;
  }
  return { tags, problem };
}
