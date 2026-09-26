// The closed style vocabulary (07-page-builder-document.md §4). There is no
// free-form CSS anywhere: every property is known, every value is a token
// reference or a literal matching a strict pattern, and the same parser both
// validates documents and produces CSS, so nothing unvalidated reaches a
// stylesheet. Pure and client-safe.
import { TOKEN_NAMES, tokenNamespace, tokenVariable } from "../theme";
import type { StyleSet, StyleValue, TokenRef } from "./types";

type Kind =
  | {
      readonly kind: "length";
      readonly tokens?: readonly string[];
      readonly negative?: boolean;
      readonly auto?: boolean;
    }
  | { readonly kind: "color" }
  | { readonly kind: "enum"; readonly values: Readonly<Record<string, string>> }
  | { readonly kind: "int"; readonly min: number; readonly max: number; readonly step?: number }
  | { readonly kind: "number"; readonly min: number; readonly max: number }
  | { readonly kind: "token"; readonly tokens: readonly string[] }
  | { readonly kind: "aspect" };

interface PropertySpec {
  readonly css: string;
  readonly value: Kind;
  /** Wraps the parsed value, e.g. `repeat(n, …)`. */
  readonly format?: (value: string) => string;
}

const SPACE = ["space"] as const;
const length = (extra: Partial<Extract<Kind, { kind: "length" }>> = {}): Kind => ({
  kind: "length",
  tokens: SPACE,
  ...extra,
});

const FLEX_POSITION = { start: "flex-start", center: "center", end: "flex-end" } as const;

export const STYLE_PROPERTIES: Readonly<Record<string, PropertySpec>> = {
  // Layout
  display: {
    css: "display",
    value: { kind: "enum", values: { block: "block", flex: "flex", grid: "grid", none: "none" } },
  },
  direction: {
    css: "flex-direction",
    value: { kind: "enum", values: { row: "row", column: "column" } },
  },
  wrap: { css: "flex-wrap", value: { kind: "enum", values: { wrap: "wrap", nowrap: "nowrap" } } },
  justify: {
    css: "justify-content",
    value: {
      kind: "enum",
      values: { ...FLEX_POSITION, between: "space-between", around: "space-around" },
    },
  },
  align: {
    css: "align-items",
    value: { kind: "enum", values: { ...FLEX_POSITION, stretch: "stretch", baseline: "baseline" } },
  },
  gap: { css: "gap", value: length() },
  columns: {
    css: "grid-template-columns",
    value: { kind: "int", min: 1, max: 12 },
    format: (n) => `repeat(${n},minmax(0,1fr))`,
  },
  columnSpan: {
    css: "grid-column",
    value: { kind: "int", min: 1, max: 12 },
    format: (n) => `span ${n}/span ${n}`,
  },
  width: { css: "width", value: length({ tokens: ["container"], auto: true }) },
  maxWidth: { css: "max-width", value: length({ tokens: ["container"], auto: true }) },
  minHeight: { css: "min-height", value: length({ tokens: [], auto: true }) },
  aspectRatio: { css: "aspect-ratio", value: { kind: "aspect" } },
  // Spacing
  paddingBlock: { css: "padding-block", value: length() },
  paddingInline: { css: "padding-inline", value: length() },
  paddingTop: { css: "padding-top", value: length() },
  paddingRight: { css: "padding-right", value: length() },
  paddingBottom: { css: "padding-bottom", value: length() },
  paddingLeft: { css: "padding-left", value: length() },
  marginBlock: { css: "margin-block", value: length({ negative: true, auto: true }) },
  marginInline: { css: "margin-inline", value: length({ negative: true, auto: true }) },
  marginTop: { css: "margin-top", value: length({ negative: true, auto: true }) },
  marginRight: { css: "margin-right", value: length({ negative: true, auto: true }) },
  marginBottom: { css: "margin-bottom", value: length({ negative: true, auto: true }) },
  marginLeft: { css: "margin-left", value: length({ negative: true, auto: true }) },
  // Typography
  fontFamily: { css: "font-family", value: { kind: "token", tokens: ["font"] } },
  fontSize: { css: "font-size", value: length({ tokens: ["fontSize"] }) },
  fontWeight: { css: "font-weight", value: { kind: "int", min: 100, max: 900, step: 100 } },
  lineHeight: { css: "line-height", value: { kind: "number", min: 0.8, max: 3 } },
  letterSpacing: { css: "letter-spacing", value: length({ tokens: [], negative: true }) },
  textAlign: {
    css: "text-align",
    value: {
      kind: "enum",
      values: { left: "left", center: "center", right: "right", justify: "justify" },
    },
  },
  textTransform: {
    css: "text-transform",
    value: {
      kind: "enum",
      values: {
        none: "none",
        uppercase: "uppercase",
        lowercase: "lowercase",
        capitalize: "capitalize",
      },
    },
  },
  color: { css: "color", value: { kind: "color" } },
  // Background
  background: { css: "background", value: { kind: "color" } },
  // Border
  borderWidth: { css: "border-width", value: length({ tokens: [] }) },
  borderStyle: {
    css: "border-style",
    value: {
      kind: "enum",
      values: { none: "none", solid: "solid", dashed: "dashed", dotted: "dotted" },
    },
  },
  borderColor: { css: "border-color", value: { kind: "color" } },
  radius: { css: "border-radius", value: length({ tokens: ["radius"] }) },
  // Effects
  shadow: { css: "box-shadow", value: { kind: "token", tokens: ["shadow"] } },
  opacity: { css: "opacity", value: { kind: "number", min: 0, max: 1 } },
};

const LENGTH_RE = /^(-?)(\d{1,4}(?:\.\d{1,3})?)(px|rem|em|%|vh|vw)$/;
const LENGTH_MAX: Readonly<Record<string, number>> = {
  px: 4000,
  rem: 250,
  em: 250,
  "%": 100,
  vh: 100,
  vw: 100,
};
const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const CHANNEL = String.raw`\d{1,3}(?:\.\d{1,3})?%?`;
const ALPHA = String.raw`(?:0|1|0?\.\d{1,3}|\d{1,3}%)`;
const FUNCTION_COLOR_RE = new RegExp(
  String.raw`^(?:rgba?|hsla?)\(\s*${CHANNEL}(?:\s*,\s*|\s+)${CHANNEL}(?:\s*,\s*|\s+)${CHANNEL}(?:\s*[,/]\s*${ALPHA})?\s*\)$`,
);
const ASPECT_RE = /^(\d{1,3})\/(\d{1,3})$/;

export function isTokenRef(value: unknown): value is TokenRef {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.keys(value).length === 1 &&
    typeof (value as { $token?: unknown }).$token === "string"
  );
}

function tokenCss(value: TokenRef, namespaces: readonly string[]): string | null {
  const token = value.$token;
  if (!TOKEN_NAMES.has(token) || !namespaces.includes(tokenNamespace(token))) return null;
  return `var(${tokenVariable(token)})`;
}

function lengthCss(value: StyleValue, spec: Extract<Kind, { kind: "length" }>): string | null {
  if (isTokenRef(value)) return tokenCss(value, spec.tokens ?? []);
  if (value === 0 || value === "0") return "0";
  if (typeof value !== "string") return null;
  if (value === "auto") return spec.auto ? "auto" : null;
  const match = LENGTH_RE.exec(value);
  if (!match) return null;
  const [, sign, amount, unit] = match;
  if (sign && !spec.negative) return null;
  if (Number(amount) > (LENGTH_MAX[unit ?? ""] ?? 0)) return null;
  return value;
}

function colorCss(value: StyleValue): string | null {
  if (isTokenRef(value)) return tokenCss(value, ["color"]);
  if (typeof value !== "string") return null;
  if (value === "transparent" || HEX_RE.test(value)) return value;
  if (FUNCTION_COLOR_RE.test(value)) return value.replace(/\s+/g, " ");
  return null;
}

/** The CSS value for one property, or null when the value isn't allowed. */
export function styleValueCss(property: string, value: StyleValue): string | null {
  const spec = Object.hasOwn(STYLE_PROPERTIES, property) ? STYLE_PROPERTIES[property] : undefined;
  if (!spec) return null;
  const kind = spec.value;
  let css: string | null;
  switch (kind.kind) {
    case "length":
      css = lengthCss(value, kind);
      break;
    case "color":
      css = colorCss(value);
      break;
    case "enum":
      css =
        typeof value === "string" && Object.hasOwn(kind.values, value)
          ? (kind.values[value] ?? null)
          : null;
      break;
    case "int":
      css =
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= kind.min &&
        value <= kind.max &&
        value % (kind.step ?? 1) === 0
          ? String(value)
          : null;
      break;
    case "number":
      css =
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= kind.min &&
        value <= kind.max
          ? String(value)
          : null;
      break;
    case "token":
      css = isTokenRef(value) ? tokenCss(value, kind.tokens) : null;
      break;
    case "aspect": {
      if (value === "auto") css = "auto";
      else {
        const match = typeof value === "string" ? ASPECT_RE.exec(value) : null;
        css = match && Number(match[1]) > 0 && Number(match[2]) > 0 ? match[0] : null;
      }
      break;
    }
  }
  return css === null ? null : spec.format ? spec.format(css) : css;
}

/** Problems with a style set, keyed by property; empty when valid. */
export function styleErrors(styles: unknown): Record<string, string> {
  if (typeof styles !== "object" || styles === null || Array.isArray(styles)) {
    return { "": "Styles must be an object." };
  }
  const errors: Record<string, string> = {};
  for (const [property, value] of Object.entries(styles)) {
    if (!Object.hasOwn(STYLE_PROPERTIES, property)) errors[property] = "Unknown style property.";
    else if (styleValueCss(property, value as StyleValue) === null)
      errors[property] = "Value not allowed.";
  }
  return errors;
}

/** `prop:value;…` for a validated style set (invalid entries are dropped). */
export function styleDeclarations(styles: StyleSet): string {
  return Object.entries(styles)
    .map(([property, value]) => {
      const css = styleValueCss(property, value);
      const spec = STYLE_PROPERTIES[property];
      return css === null || !spec ? null : `${spec.css}:${css}`;
    })
    .filter((d): d is string => d !== null)
    .join(";");
}
