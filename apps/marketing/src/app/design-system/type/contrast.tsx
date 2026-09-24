"use client";

// Contrast of the tested token pairs, computed in the browser from the live
// CSS variables so the table can't drift from theme.css. The same pairs are
// enforced by packages/ui/src/theme.test.ts.
import { Badge } from "@storevia/ui";
import { useEffect, useState } from "react";

export interface ContrastPair {
  readonly fg: string;
  readonly bg: string;
  readonly min: number;
  readonly use: string;
}

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return null;
  const full = match[1].length === 3 ? match[1].replace(/./g, (c) => c + c) : match[1];
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(full.slice(i, i + 2), 16))) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg: string, bg: string): number | null {
  const a = luminance(fg);
  const b = luminance(bg);
  if (a === null || b === null) return null;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function ContrastTable({ pairs }: { pairs: readonly ContrastPair[] }) {
  // null until measured: the server has no computed styles, so the first
  // render (server and hydration) shows placeholders, then the real values.
  const [ratios, setRatios] = useState<readonly (number | null)[] | null>(null);

  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string) => style.getPropertyValue(`--color-${name}`);
    setRatios(pairs.map((pair) => ratio(read(pair.fg), read(pair.bg))));
  }, [pairs]);

  return (
    <div className="overflow-x-auto rounded-panel border border-line">
      <table className="w-full text-left text-table sm:min-w-[34rem]">
        <thead className="bg-surface-sunken text-caption text-ink-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              Pair
            </th>
            <th scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">
              Used for
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Ratio
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              Needs
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {pairs.map((pair, index) => {
            const value = ratios?.[index] ?? null;
            const passes = value !== null && value >= pair.min;
            return (
              <tr key={`${pair.fg}-${pair.bg}`}>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-line text-label"
                      style={{
                        background: `var(--color-${pair.bg})`,
                        color: `var(--color-${pair.fg})`,
                      }}
                    >
                      Aa
                    </span>
                    <span className="font-mono text-caption text-ink">
                      {pair.fg} on {pair.bg}
                    </span>
                  </span>
                </td>
                <td className="hidden px-4 py-3 text-ink-muted sm:table-cell">{pair.use}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink">
                  {value === null ? "—" : `${value.toFixed(2)}:1`}
                </td>
                <td className="px-4 py-3 text-right">
                  {ratios === null ? (
                    <Badge>{`${String(pair.min)}:1`}</Badge>
                  ) : (
                    <Badge tone={passes ? "success" : "danger"}>
                      {`${passes ? "Passes" : "Below"} ${String(pair.min)}:1`}
                    </Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
