import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DataList,
  DescriptionList,
  KpiCard,
  Meter,
  Metric,
  metricDeltaText,
  metricDeltaTone,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
  UsageMeter,
  usageMeterState,
} from "./data";
import { scrollState } from "./data-scroll";

const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("usageMeterState", () => {
  it("is ok below 80%, warning from 80%, full at the limit and over past it", () => {
    expect(usageMeterState(3, 10)).toEqual({ status: "ok", percent: 30 });
    expect(usageMeterState(8, 10)).toEqual({ status: "warning", percent: 80 });
    expect(usageMeterState(10, 10)).toEqual({ status: "full", percent: 100 });
    expect(usageMeterState(12, 10)).toEqual({ status: "over", percent: 100 });
    expect(usageMeterState(5, null)).toEqual({ status: "unlimited", percent: null });
  });

  it("honours a custom threshold and zero limits", () => {
    expect(usageMeterState(7, 10, 0.7).status).toBe("warning");
    expect(usageMeterState(0, 0).status).toBe("full");
    expect(usageMeterState(1, 0).status).toBe("over");
  });
});

describe("UsageMeter", () => {
  it("shows the figure and a meter, with no status line when fine", () => {
    const html = renderToStaticMarkup(<UsageMeter label="Stores" used={1} limit={3} />);
    expect(text(html)).toContain("1 of 3");
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuemax="3"');
    expect(html).toContain('aria-valuetext="1 of 3"');
    expect(html).toContain('data-status="ok"');
    expect(html).toContain("bg-brand-600");
  });

  it("warns in words and with an icon from 80%", () => {
    const html = renderToStaticMarkup(
      <UsageMeter label="Storage" used={4.2} limit={5} unit="GB" />,
    );
    expect(text(html)).toContain("4.2 of 5 GB");
    expect(text(html)).toContain("84% used");
    expect(html).toContain("text-warning-700");
    expect(html).toContain("bg-warning-500");
    expect(html).toContain("lucide-triangle-alert");
  });

  it("says when it is at the limit", () => {
    expect(text(renderToStaticMarkup(<UsageMeter label="Seats" used={5} limit={5} />))).toContain(
      "At limit",
    );
  });

  it("states how far over the limit, in danger colours with an icon", () => {
    const html = renderToStaticMarkup(<UsageMeter label="Seats" used={7} limit={5} unit="seats" />);
    expect(text(html)).toContain("7 of 5 seats");
    expect(text(html)).toContain("Over limit by 2 seats");
    expect(html).toContain("text-danger-700");
    expect(html).toContain("lucide-circle-alert");
    expect(html).toContain('aria-valuetext="7 of 5 seats. Over limit by 2 seats"');
  });

  it("has an unlimited state without a meter role", () => {
    const html = renderToStaticMarkup(<UsageMeter label="Pages" used={1200} limit="unlimited" />);
    expect(text(html)).toContain("1,200 used");
    expect(text(html)).toContain("Unlimited");
    expect(html).not.toContain('role="meter"');
    expect(html).toContain("border-dashed");
  });

  it("stays visible in forced-colours mode: outlined track, system-highlight fill", () => {
    const html = renderToStaticMarkup(<UsageMeter label="Stores" used={1} limit={3} />);
    expect(html).toContain("forced-colors:border forced-colors:border-[CanvasText]");
    expect(html).toContain("forced-color-adjust-none forced-colors:bg-[Highlight]");
  });
});

describe("Meter (existing API)", () => {
  it("keeps the 'N of M' text and the meter role", () => {
    const html = renderToStaticMarkup(<Meter label="Stores" value={1} max={1} />);
    expect(text(html)).toContain("1 of 1");
    expect(html).toContain('role="meter"');
  });

  it("marks over-limit use with words, not only colour", () => {
    const html = renderToStaticMarkup(<Meter label="Stores" value={2} max={1} tone="danger" />);
    expect(text(html)).toContain("2 of 1");
    expect(text(html)).toContain("over limit");
    expect(html).toContain("bg-danger-600");
  });

  it("keeps a custom value label and unlimited", () => {
    const html = renderToStaticMarkup(
      <Meter label="Stores" value={4} max={null} valueLabel={<span>4 of Unlimited</span>} />,
    );
    expect(text(html)).toContain("4 of Unlimited");
    expect(html).not.toContain("aria-valuemax");
  });
});

describe("metric deltas", () => {
  it("judges direction, flipping it when lower is better", () => {
    expect(metricDeltaTone(12.4)).toBe("positive");
    expect(metricDeltaTone(-3)).toBe("negative");
    expect(metricDeltaTone(0)).toBe("neutral");
    expect(metricDeltaTone(-3, true)).toBe("positive");
    expect(metricDeltaTone(2, true)).toBe("negative");
  });

  it("formats visible and spoken text", () => {
    expect(metricDeltaText({ value: 12.4 })).toEqual({ visible: "+12.4%", spoken: "Up 12.4%" });
    expect(metricDeltaText({ value: -3.1 })).toEqual({ visible: "−3.1%", spoken: "Down 3.1%" });
    expect(metricDeltaText({ value: -2, label: "−2 pts" })).toEqual({
      visible: "−2 pts",
      spoken: "Down 2 pts",
    });
    expect(metricDeltaText({ value: 0 }).spoken).toBe("No change");
  });
});

describe("Metric", () => {
  it("shows an up arrow in success colours with a full spoken sentence", () => {
    const html = renderToStaticMarkup(
      <Metric
        label="Orders"
        value="1,284"
        delta={{ value: 12.4 }}
        comparison="vs previous 30 days"
      />,
    );
    expect(html).toContain("lucide-arrow-up-right");
    expect(html).toContain("text-success-700");
    expect(html).toContain("+12.4%");
    expect(html).toContain("Up 12.4% vs previous 30 days, an improvement");
    expect(html).toContain("text-metric");
  });

  it("treats a fall as good news when lower is better", () => {
    const html = renderToStaticMarkup(
      <Metric
        label="Refund rate"
        value="1.2%"
        delta={{ value: -0.4, label: "−0.4 pts" }}
        lowerIsBetter
      />,
    );
    expect(html).toContain("lucide-arrow-down-right");
    expect(html).toContain("text-success-700");
    expect(html).toContain("Down 0.4 pts, an improvement");
  });

  it("marks a rise as a decline when lower is better, and flat as neutral", () => {
    const worse = renderToStaticMarkup(
      <Metric label="Load time" value="1.9 s" delta={{ value: 8 }} lowerIsBetter />,
    );
    expect(worse).toContain("text-danger-700");
    expect(worse).toContain("a decline");
    const flat = renderToStaticMarkup(<Metric label="X" value="1" delta={{ value: 0 }} />);
    expect(flat).toContain("lucide-minus");
    expect(flat).toContain("No change");
  });

  it("renders the sparkline slot and the large size", () => {
    const html = renderToStaticMarkup(
      <Metric label="Revenue" value="£1" size="lg" sparkline={<svg data-spark="" />} />,
    );
    expect(html).toContain("data-spark");
    expect(html).toContain("text-metric-lg");
  });

  it("hides the sparkline from assistive tech when the delta already states the change", () => {
    const spark = <div role="img" aria-label="Revenue: up 54%" data-spark="" />;
    const withDelta = renderToStaticMarkup(
      <Metric label="Revenue" value="£1" delta={{ value: 12.4 }} sparkline={spark} />,
    );
    expect(withDelta).toMatch(/<div aria-hidden="true" class="[^"]*"><div role="img"/);
    // Without a delta the line is the only trend there is, so it stays exposed.
    const alone = renderToStaticMarkup(<Metric label="Revenue" value="£1" sparkline={spark} />);
    expect(alone).not.toContain('aria-hidden="true" class="mb-1');
  });

  it("reserves the inline sparkline's height so figures share a baseline", () => {
    const bare = renderToStaticMarkup(<Metric label="Refunds" value="1.2%" />);
    const withLine = renderToStaticMarkup(
      <Metric label="Orders" value="318" sparkline={<svg data-spark="" />} />,
    );
    for (const html of [bare, withLine]) expect(html).toContain("min-h-9");
    expect(renderToStaticMarkup(<Metric size="lg" label="Sales" value="£1" />)).toContain(
      "min-h-12",
    );
  });

  it("marks example figures with the shared badge", () => {
    const html = renderToStaticMarkup(<Metric example label="Average order" value="£39.20" />);
    expect(html).toContain("data-example-data");
    expect(text(html)).toContain("Example data");
  });
});

describe("KpiCard", () => {
  it("labels example data with the neutral ExampleDataBadge, never violet", () => {
    const html = renderToStaticMarkup(<KpiCard label="Revenue" value="£12,480" example />);
    expect(text(html)).toContain("Example data");
    expect(html).toContain("data-example-data");
    expect(html).not.toContain("accent");
    expect(html).toContain('data-status="live"');
  });

  it("stacks the sparkline under the change in a fixed 32 px slot", () => {
    const html = renderToStaticMarkup(
      <KpiCard
        label="Orders"
        value="318"
        delta={{ value: 4.3 }}
        comparison="vs previous 30 days"
        sparkline={<svg data-spark="" />}
      />,
    );
    const slot = html.indexOf('class="mt-4 h-8"');
    expect(slot).toBeGreaterThan(html.indexOf("Up 4.3%"));
    expect(html.indexOf("data-spark")).toBeGreaterThan(slot);
    expect(html).not.toContain("min-h-9"); // no inline slot beside the figure
    expect(html).toContain("p-4 sm:p-5");
  });

  it("shows an honest frame and no figure when not collecting", () => {
    const html = renderToStaticMarkup(
      <KpiCard label="Visitors" value="9,999" status="not-collecting" />,
    );
    expect(text(html)).toContain("Not collecting yet");
    expect(text(html)).not.toContain("9,999");
    expect(html).toContain("border-dashed");
  });

  it("becomes a link card with href", () => {
    const html = renderToStaticMarkup(<KpiCard label="Orders" value="12" href="/orders" />);
    expect(html).toMatch(/^<a href="\/orders"/);
    expect(html).toContain("sv-motion-lift");
  });

  it("renders its link with linkAs (e.g. next/link)", () => {
    function RouterLink(props: { href: string; className?: string; children?: ReactNode }) {
      return <a data-router="" {...props} />;
    }
    const html = renderToStaticMarkup(
      <KpiCard label="Orders" value="12" href="/orders" linkAs={RouterLink} />,
    );
    expect(html).toMatch(/^<a data-router="" href="\/orders"/);
  });
});

describe("Table", () => {
  it("scrolls in its own container and forwards density", () => {
    const html = renderToStaticMarkup(
      <Table dense stickyHeader maxHeight="20rem" containerClassName="rounded-card">
        <TableBody>
          <TableRow>
            <TableCell>a</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(html).toMatch(
      /^<div class="relative min-w-0"><div class="[^"]*overflow-auto[^"]*rounded-card" style="max-height:20rem">/,
    );
    expect(html).toContain("data-dense");
    expect(html).toContain("data-sticky");
  });

  it("is not a tab stop until it measures an overflow (on the client)", () => {
    const html = renderToStaticMarkup(
      <Table>
        <TableCaption>Members</TableCaption>
        <TableBody />
      </Table>,
    );
    expect(html).not.toContain("tabindex");
    expect(html).not.toContain('role="region"');
    // Every edge shadow starts hidden: left, right, top and bottom.
    expect(html.match(/opacity-0/g)).toHaveLength(4);
    // A sticky header lifts off the rows instead of showing a top shadow.
    const sticky = renderToStaticMarkup(
      <Table stickyHeader>
        <TableBody />
      </Table>,
    );
    expect(sticky.match(/opacity-0/g)).toHaveLength(3);
  });

  it("keeps a visible caption's text in view while the table scrolls sideways", () => {
    const html = renderToStaticMarkup(
      <table>
        <TableCaption visible>Recent activity</TableCaption>
      </table>,
    );
    expect(html).toContain('<span class="sticky left-5 inline-block">Recent activity</span>');
    expect(
      renderToStaticMarkup(
        <table>
          <TableCaption>Hidden</TableCaption>
        </table>,
      ),
    ).toContain('class="sr-only">Hidden</caption>');
  });

  it("sets aria-sort only on the sorted column and renders sort controls", () => {
    const html = renderToStaticMarkup(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead sort="ascending" onSort={() => undefined}>
              Name
            </TableHead>
            <TableHead sort="none" sortHref="?sort=role">
              Role
            </TableHead>
            <TableHead numeric sort="descending" onSort={() => undefined}>
              Stores
            </TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );
    expect(html.match(/aria-sort=/g)).toHaveLength(2);
    expect(html).toContain('aria-sort="ascending"');
    expect(html).toContain('aria-sort="descending"');
    expect(html).toContain('href="?sort=role"');
    expect(html.match(/<button type="button"/g)).toHaveLength(2);
    expect(html).toContain("lucide-chevron-up");
    expect(html).toContain("lucide-chevrons-up-down");
    expect(html).toMatch(/aria-sort="descending" class="[^"]*text-right/);
  });

  it("renders sort links with linkAs (e.g. next/link)", () => {
    function RouterLink(props: { href: string; className?: string; children?: ReactNode }) {
      return <a data-router="" {...props} />;
    }
    const html = renderToStaticMarkup(
      <table>
        <thead>
          <tr>
            <TableHead sort="none" sortHref="?sort=name" linkAs={RouterLink}>
              Name
            </TableHead>
          </tr>
        </thead>
      </table>,
    );
    expect(html).toContain('<a data-router="" href="?sort=name"');
  });

  it("right-aligns numeric cells with tabular figures and spans empty rows", () => {
    expect(renderToStaticMarkup(<TableCell numeric>3</TableCell>)).toContain("tabular-nums");
    const empty = renderToStaticMarkup(
      <table>
        <tbody>
          <TableEmpty colSpan={4}>No invitations</TableEmpty>
        </tbody>
      </table>,
    );
    expect(empty).toContain('colSpan="4"');
    expect(empty).toContain("No invitations");
  });
});

describe("DataList (existing API)", () => {
  const rows = [
    { id: "1", name: "Acme" },
    { id: "2", name: "Globex" },
  ];
  const columns = [
    { key: "name", header: "Name", cell: (r: (typeof rows)[number]) => r.name, primary: true },
  ];

  it("uses a fixed or per-row test id, with -mobile on phone cards", () => {
    const fixed = renderToStaticMarkup(
      <DataList rows={rows} columns={columns} rowKey={(r) => r.id} rowTestId="org-row" />,
    );
    expect(fixed.match(/data-testid="org-row"/g)).toHaveLength(2);
    expect(fixed.match(/data-testid="org-row-mobile"/g)).toHaveLength(2);
    const perRow = renderToStaticMarkup(
      <DataList
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        rowTestId={(r) => `row-${r.id}`}
      />,
    );
    expect(perRow).toContain('data-testid="row-2"');
    expect(perRow).toContain('data-testid="row-2-mobile"');
  });

  it("renders the empty node when there are no rows", () => {
    const html = renderToStaticMarkup(
      <DataList rows={[]} columns={columns} rowKey={(r) => r.id} empty={<p>None</p>} />,
    );
    expect(html).toBe("<p>None</p>");
  });
});

describe("DescriptionList", () => {
  it("renders term/detail pairs in both layouts", () => {
    const items = [
      { term: "Plan", detail: "Business" },
      { term: "Renews", detail: "1 October" },
    ];
    const horizontal = renderToStaticMarkup(<DescriptionList items={items} />);
    expect(horizontal).toContain("<dl");
    expect(horizontal.match(/<dt/g)).toHaveLength(2);
    expect(horizontal).toContain("@container");
    expect(horizontal).toContain("@xs:grid-cols-");
    const stacked = renderToStaticMarkup(
      <DescriptionList items={items} layout="stacked" columns={2} />,
    );
    expect(stacked).toContain("sm:grid-cols-2");
  });
});

describe("scrollState (the table scroll area)", () => {
  const box = (
    scrollLeft: number,
    scrollWidth: number,
    { clientWidth = 300, scrollTop = 0, scrollHeight = 200 } = {},
  ) => ({ scrollLeft, scrollWidth, clientWidth, scrollTop, scrollHeight, clientHeight: 200 });
  const none = { overflow: false, before: false, after: false, above: false, below: false };

  it("does nothing while the table fits", () => {
    expect(scrollState(box(0, 300))).toEqual(none);
    // A 1 px rounding difference is not an overflow.
    expect(scrollState(box(0, 301)).overflow).toBe(false);
  });

  it("marks the side edges that have more content beyond them", () => {
    const wide = { ...none, overflow: true };
    expect(scrollState(box(0, 464))).toEqual({ ...wide, after: true });
    expect(scrollState(box(80, 464))).toEqual({ ...wide, before: true, after: true });
    expect(scrollState(box(164, 464))).toEqual({ ...wide, before: true });
  });

  it("marks rows above and below in a maxHeight table", () => {
    const tall = { ...none, overflow: true };
    expect(scrollState(box(0, 300, { scrollHeight: 500 }))).toEqual({ ...tall, below: true });
    expect(scrollState(box(0, 300, { scrollHeight: 500, scrollTop: 120 }))).toEqual({
      ...tall,
      above: true,
      below: true,
    });
    expect(scrollState(box(0, 300, { scrollHeight: 500, scrollTop: 300 }))).toEqual({
      ...tall,
      above: true,
    });
  });
});
