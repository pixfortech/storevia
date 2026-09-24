import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { paginationRange, type PaginationRangeItem } from "./control-helpers";
import { Breadcrumb, Pagination, Tabs, TabsContent, TabsList, TabsTrigger } from "./navigation";

const E = "ellipsis" as const;

describe("paginationRange", () => {
  it("lists every page when they all fit", () => {
    expect(paginationRange(1, 1)).toEqual([1]);
    expect(paginationRange(3, 5)).toEqual([1, 2, 3, 4, 5]);
    // 2 boundaries + 2 siblings + current + 2 ellipsis slots = 7.
    expect(paginationRange(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("returns nothing for zero or invalid totals", () => {
    expect(paginationRange(1, 0)).toEqual([]);
    expect(paginationRange(1, -4)).toEqual([]);
    expect(paginationRange(1, Number.NaN)).toEqual([]);
    expect(paginationRange(1, Number.POSITIVE_INFINITY)).toEqual([]);
  });

  it("puts one ellipsis on the far side near either end", () => {
    expect(paginationRange(1, 10)).toEqual([1, 2, 3, 4, 5, E, 10]);
    expect(paginationRange(4, 10)).toEqual([1, 2, 3, 4, 5, E, 10]);
    expect(paginationRange(10, 10)).toEqual([1, E, 6, 7, 8, 9, 10]);
    expect(paginationRange(7, 10)).toEqual([1, E, 6, 7, 8, 9, 10]);
  });

  it("puts ellipses on both sides in the middle", () => {
    expect(paginationRange(5, 10)).toEqual([1, E, 4, 5, 6, E, 10]);
    expect(paginationRange(6, 10)).toEqual([1, E, 5, 6, 7, E, 10]);
    expect(paginationRange(50, 100)).toEqual([1, E, 49, 50, 51, E, 100]);
  });

  it("clamps and floors the current page", () => {
    expect(paginationRange(0, 10)).toEqual(paginationRange(1, 10));
    expect(paginationRange(-3, 10)).toEqual(paginationRange(1, 10));
    expect(paginationRange(99, 10)).toEqual(paginationRange(10, 10));
    expect(paginationRange(5.7, 10)).toEqual(paginationRange(5, 10));
    expect(paginationRange(Number.NaN, 10)).toEqual(paginationRange(1, 10));
  });

  it("honours siblings and boundaries", () => {
    expect(paginationRange(10, 20, 0)).toEqual([1, E, 10, E, 20]);
    expect(paginationRange(10, 20, 2)).toEqual([1, E, 8, 9, 10, 11, 12, E, 20]);
    expect(paginationRange(10, 20, 1, 2)).toEqual([1, 2, E, 9, 10, 11, E, 19, 20]);
    // Boundaries below 1 are raised to 1: the first and last page always show.
    expect(paginationRange(10, 20, 1, 0)).toEqual([1, E, 9, 10, 11, E, 20]);
  });

  it("keeps its invariants for every page of many totals", () => {
    const gaps = (items: PaginationRangeItem[]) => items.filter((item) => item === E).length;
    for (const siblings of [0, 1, 2]) {
      for (let total = 1; total <= 40; total += 1) {
        const slots = Math.min(total, 2 * siblings + 5);
        for (let page = 1; page <= total; page += 1) {
          const items = paginationRange(page, total, siblings);
          const numbers = items.filter((item): item is number => item !== E);
          // Constant length, so the controls never jump while paging.
          expect(items).toHaveLength(slots);
          expect(numbers).toContain(1);
          expect(numbers).toContain(total);
          expect(numbers).toContain(page);
          // Ascending, no duplicates, at most two ellipses, never adjacent.
          expect(numbers).toEqual([...new Set(numbers)].sort((a, b) => a - b));
          expect(gaps(items)).toBeLessThanOrEqual(2);
          items.forEach((item, index) => {
            if (item !== E) return;
            expect(items[index + 1]).not.toBe(E);
            // An ellipsis always stands for two or more pages.
            const before = items[index - 1] as number;
            const after = items[index + 1] as number;
            expect(after - before - 1).toBeGreaterThanOrEqual(2);
          });
          // Siblings of the current page are always shown.
          for (let s = 1; s <= siblings; s += 1) {
            if (page - s >= 1) expect(numbers).toContain(page - s);
            if (page + s <= total) expect(numbers).toContain(page + s);
          }
        }
      }
    }
  });
});

describe("Pagination", () => {
  it("marks the current page and builds links from a template", () => {
    const html = renderToStaticMarkup(
      <Pagination page={5} totalPages={10} hrefTemplate="/orders?page={page}" />,
    );
    expect(html).toMatch(/^<nav aria-label="Pagination"/);
    expect(html).toContain('<a href="/orders?page=5" aria-label="Page 5" aria-current="page"');
    expect(html).toContain('href="/orders?page=4" rel="prev" aria-label="Previous page"');
    expect(html).toContain('href="/orders?page=6" rel="next" aria-label="Next page"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    // Two ellipses, hidden from assistive tech.
    expect(html.match(/<li aria-hidden="true"/g)).toHaveLength(2);
    // The phone summary.
    expect(html).toContain("Page <span");
  });

  it("disables previous on the first page and next on the last, as named links", () => {
    const first = renderToStaticMarkup(
      <Pagination page={1} totalPages={3} hrefTemplate="?p={page}" />,
    );
    // No href, so not a live link, but still a named, disabled link.
    expect(first).toMatch(
      /<a role="link" aria-disabled="true" aria-label="Previous page" class="[^"]*">/,
    );
    expect(first).toContain('href="?p=2" rel="next"');
    expect(first).not.toContain("<span aria-disabled");
    const last = renderToStaticMarkup(
      <Pagination page={3} totalPages={3} hrefTemplate="?p={page}" />,
    );
    expect(last).toMatch(/<a role="link" aria-disabled="true" aria-label="Next page" class=/);
  });

  it("keeps a disabled end as the same focusable button, marked aria-disabled", () => {
    const html = renderToStaticMarkup(
      <Pagination page={1} totalPages={12} onPageChange={() => undefined} />,
    );
    // Not the disabled attribute: that would drop keyboard focus at the end.
    expect(html).toContain(
      '<button type="button" aria-label="Previous page" aria-disabled="true" class=',
    );
    expect(html).not.toMatch(/aria-label="Previous page"[^>]*disabled=""/);
    expect(html).toContain('<button type="button" aria-label="Next page" class=');
    // Forced colours outline the current page; touch gets 44 px targets.
    expect(html).toMatch(/aria-current="page" class="[^"]*forced-colors:outline-1/);
    expect(html).toContain("pointer-coarse:min-w-11");
  });

  it("renders buttons for client-side paging and hides numbers when compact", () => {
    const html = renderToStaticMarkup(
      <Pagination page={2} totalPages={4} onPageChange={() => undefined} compact />,
    );
    expect(html).toContain('<button type="button" aria-label="Previous page"');
    expect(html).not.toContain('aria-label="Page 2"');
    expect(html).toContain('Page <span class="font-medium text-ink">2</span> of 4');
  });
});

describe("Breadcrumb", () => {
  const items = [
    { label: "Northwind", href: "/" },
    { label: "Online store", href: "/store" },
    { label: "Products", href: "/store/products" },
    { label: "Linen apron" },
  ];

  it("is a labelled nav whose last item is the current page", () => {
    const html = renderToStaticMarkup(<Breadcrumb items={items} />);
    expect(html).toMatch(/^<nav aria-label="Breadcrumb"/);
    expect(html).toContain(
      '<span aria-current="page" class="truncate font-medium text-ink">Linen apron</span>',
    );
    expect(html.match(/aria-current/g)).toHaveLength(1);
    expect(html).toContain('href="/store/products"');
    // Separators are decorative.
    expect(html.match(/<svg[^>]*aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("folds everything above the parent on phones, behind a leading button", () => {
    const html = renderToStaticMarkup(<Breadcrumb items={items} />);
    expect(html).toMatch(
      /<ol [^>]*><li class="[^"]*sm:hidden"><button type="button" aria-label="Show all breadcrumb levels"/,
    );
    // The root and "Online store" are hidden below sm; the parent is not.
    expect(html).toMatch(/<li class="[^"]*hidden sm:flex"><a href="\/"/);
    expect(html).toMatch(/<li class="[^"]*hidden sm:flex"><a href="\/store"/);
    expect(html).not.toMatch(/<li class="[^"]*hidden sm:flex"><a href="\/store\/products"/);
  });

  it("folds a three-level trail too, and never squeezes the current page first", () => {
    const html = renderToStaticMarkup(<Breadcrumb items={items.slice(1)} />);
    expect(html).toContain("Show all breadcrumb levels");
    expect(html).toMatch(/<li class="[^"]*hidden sm:flex"><a href="\/store"/);
    // The current page doesn't shrink; its cap leaves room for the visible
    // ancestors' separators ("…" + parent on phones, both ancestors above).
    expect(html).toMatch(
      /<li class="[^"]*shrink-0[^"]*max-w-\[calc\(100%-var\(--breadcrumb-reserve\)\)\]/,
    );
    expect(html).toContain("--breadcrumb-reserve:4.75rem");
    expect(html).toContain("--breadcrumb-reserve-sm:3.25rem");
  });

  it("doesn't fold two-level trails or when collapse is off", () => {
    expect(renderToStaticMarkup(<Breadcrumb items={items.slice(2)} />)).not.toContain(
      "Show all breadcrumb levels",
    );
    expect(renderToStaticMarkup(<Breadcrumb items={items} collapse={false} />)).not.toContain(
      "Show all breadcrumb levels",
    );
  });

  it("uses a custom link component", () => {
    function Link({
      href,
      className,
      children,
    }: {
      href: string;
      className?: string;
      children: React.ReactNode;
    }) {
      return (
        <a data-router="" href={href} className={className}>
          {children}
        </a>
      );
    }
    const html = renderToStaticMarkup(<Breadcrumb items={items} linkAs={Link} />);
    expect(html).toContain('<a data-router="" href="/"');
  });
});

describe("Tabs", () => {
  it("renders tabs with Radix roles and the chosen look", () => {
    const html = renderToStaticMarkup(
      <Tabs defaultValue="a" variant="pill">
        <TabsList aria-label="Views">
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
        <TabsContent value="b">Panel B</TabsContent>
      </Tabs>,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Views"');
    expect(html).toMatch(/role="tab" aria-selected="true"[^>]*data-state="active"/);
    // Like SegmentedControl: a 3:1 track, and the active tab outlined (also in forced colours).
    expect(html).toContain("border-line-control bg-muted p-[3px]");
    expect(html).toContain("forced-colors:data-[state=active]:outline-1");
    expect(html).toContain("Panel A");
    expect(html).not.toContain("Panel B");
  });

  it("defaults to line tabs with a brand indicator", () => {
    const html = renderToStaticMarkup(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    // A border, not a fill, so forced-colours mode still draws the indicator.
    expect(html).toContain("after:border-t-2 after:border-brand-600");
    expect(html).not.toContain("after:bg-brand-600");
    expect(html).toContain("data-[state=active]:after:scale-x-100");
  });

  it("doesn't point a disabled tab at a panel that doesn't exist", () => {
    const html = renderToStaticMarkup(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="api" disabled>
            API
          </TabsTrigger>
        </TabsList>
        <TabsContent value="a">Panel A</TabsContent>
      </Tabs>,
    );
    expect(html.match(/aria-controls=/g)).toHaveLength(1);
    expect(html).toMatch(/role="tab" aria-selected="false"[^>]*disabled=""/);
  });
});
