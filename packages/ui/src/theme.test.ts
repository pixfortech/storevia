// Contrast of the semantic text/background pairs the components use
// (WCAG 2.2 AA: 4.5:1 for normal text). Reads the real token values.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(import.meta.dirname, "theme.css"), "utf8");

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(css);
  if (!match?.[1]) throw new Error(`missing token ${name}`);
  // Formatting may wrap a var() reference over several lines.
  const value = match[1].replace(/\s+/g, "");
  const ref = /^var\(--color-([a-z0-9-]+)\)$/.exec(value);
  return ref?.[1] ? token(ref[1]) : value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(token(a)), luminance(token(b))].sort((p, q) => q - p) as [
    number,
    number,
  ];
  return (x + 0.05) / (y + 0.05);
}

const PAIRS: readonly [string, string][] = [
  ["ink", "canvas"],
  ["ink-muted", "canvas"],
  ["ink-muted", "surface-sunken"],
  ["ink-faint", "surface"],
  ["ink-faint", "surface-sunken"],
  ["ink-faint", "muted"],
  ["brand-600", "surface"],
  ["neutral-0", "brand-600"],
  ["brand-700", "brand-50"],
  ["accent-700", "accent-50"],
  ["neutral-0", "navy-900"],
  ["neutral-0", "danger-600"],
  ["danger-700", "danger-50"],
  ["warning-700", "warning-50"],
  ["success-700", "success-50"],
  ["info-700", "info-50"],
  ["navy-900", "warning-500"],
];

// Boundaries that identify a control, and the data series a chart relies on
// (WCAG 2.2 AA 1.4.11: 3:1 non-text). The history greys (chart-muted,
// chart-history) are deliberately faint: history is always dashed or grey,
// named in the legend and backed by a table.
const NON_TEXT_PAIRS: readonly [string, string][] = [
  ["line-control", "canvas"],
  ["line-control", "surface-sunken"],
  ["line-control", "muted"],
  ["chart-1", "canvas"],
  ["chart-2", "canvas"],
  ["chart-3", "canvas"],
];

describe("design tokens", () => {
  it.each(PAIRS)("%s on %s meets AA for normal text", (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)("%s on %s meets AA for non-text contrast", (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });
});
