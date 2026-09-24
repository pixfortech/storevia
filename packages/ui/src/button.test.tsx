import { ArrowRight, Plus, Settings } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, ButtonGroup, buttonClasses, IconButton } from "./button";

describe("buttonClasses", () => {
  it("keeps the existing variants and sizes working", () => {
    for (const variant of [
      "primary",
      "secondary",
      "ghost",
      "danger",
      "danger-outline",
      "inverse",
    ] as const) {
      expect(buttonClasses(variant)).toContain("rounded-control");
    }
    expect(buttonClasses("primary")).toContain("bg-brand-600");
    expect(buttonClasses("primary")).toContain("hover:bg-brand-700");
    expect(buttonClasses("primary")).toContain("active:bg-brand-800");
    expect(buttonClasses("secondary")).toContain("border-line-strong");
    expect(buttonClasses("ghost")).toContain("hover:bg-muted");
    expect(buttonClasses("primary", "sm")).toContain("h-8");
    expect(buttonClasses()).toContain("h-10");
    expect(buttonClasses("primary", "lg")).toContain("h-12");
    expect(buttonClasses("primary", "md")).toContain("focus-visible:outline-focus");
  });

  it("keeps a (transparent) border on every variant, so forced colours outline it", () => {
    for (const variant of ["primary", "ghost", "danger"] as const) {
      expect(buttonClasses(variant)).toMatch(/(^|\s)border border-transparent(\s|$)/);
    }
    expect(buttonClasses("secondary")).toContain("border-line-strong");
    expect(buttonClasses("secondary")).not.toContain("border-transparent");
  });

  it("lets a caller's className win", () => {
    const classes = buttonClasses("secondary", "md", "w-full mt-6 h-9");
    expect(classes).toContain("w-full");
    expect(classes).toContain("h-9");
    expect(classes).not.toMatch(/(^|\s)h-10(\s|$)/);
  });
});

describe("Button", () => {
  it("defaults to a primary md type=button", () => {
    const html = renderToStaticMarkup(<Button>Save</Button>);
    expect(html).toMatch(/^<button type="button" class="[^"]*bg-brand-600/);
    expect(html).toContain(">Save</span>");
  });

  it("while pending: disabled, busy, spinner overlaid, label kept for width and name", () => {
    const html = renderToStaticMarkup(
      <Button pending type="submit">
        Save changes
      </Button>,
    );
    expect(html).toContain('type="submit"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-pending=""');
    // The label stays in the DOM (transparent), so the button keeps its width
    // and its accessible name.
    expect(html).toMatch(/<span class="[^"]*opacity-0[^"]*">Save changes<\/span>/);
    expect(html).toMatch(/<span class="absolute inset-0 flex items-center justify-center"><svg/);
    expect(html).toContain("<animateTransform");
  });

  it("renders Lucide components or nodes as leading and trailing icons", () => {
    const html = renderToStaticMarkup(
      <Button leadingIcon={Plus} trailingIcon={<i data-x="" />}>
        New
      </Button>,
    );
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"[^>]*>.*New<i data-x=""><\/i>/);
    const withArrow = renderToStaticMarkup(
      <Button size="lg" trailingIcon={ArrowRight}>
        Go
      </Button>,
    );
    expect(withArrow).toContain("size-5"); // 20 px icon on lg
  });

  it("stretches with fullWidth", () => {
    expect(renderToStaticMarkup(<Button fullWidth>Go</Button>)).toContain("w-full");
  });

  it("keeps a real disabled state distinct from pending", () => {
    const html = renderToStaticMarkup(<Button disabled>Save</Button>);
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("aria-busy");
    expect(html).not.toContain('data-pending=""');
  });
});

describe("IconButton", () => {
  it("requires and renders an accessible name; the icon is decorative", () => {
    const html = renderToStaticMarkup(<IconButton icon={Settings} aria-label="Settings" />);
    expect(html).toMatch(/^<button type="button" class="[^"]*size-10[^"]*" aria-label="Settings"/);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    // @ts-expect-error aria-label is required: an icon alone has no name.
    renderToStaticMarkup(<IconButton icon={Settings} />);
  });

  it("reaches 44 × 44 on touch screens, sideways too unless attached in a group", () => {
    // The ::after sits inside the 1 px border: 30 + 2 × 7 = 44.
    const sm = renderToStaticMarkup(<IconButton icon={Plus} aria-label="Add" size="sm" />);
    expect(sm).toContain("pointer-coarse:after:-inset-y-[7px]");
    expect(sm).toContain("pointer-coarse:after:inset-x-[calc(var(--icon-button-hit-x,1)*-7px)]");
    expect(sm).not.toContain("pointer-coarse:after:inset-x-0");
    const md = renderToStaticMarkup(<IconButton icon={Plus} aria-label="Add" />);
    expect(md).toContain("pointer-coarse:after:-inset-y-[3px]");
    // Attached buttons don't reach sideways (they'd cover a neighbour); they widen instead.
    const group = renderToStaticMarkup(
      <ButtonGroup aria-label="Style">
        <IconButton icon={Plus} aria-label="Add" size="sm" />
      </ButtonGroup>,
    );
    expect(group).toContain("[--icon-button-hit-x:0]");
    expect(group).toContain("pointer-coarse:*:min-w-11");
  });

  it("has three sizes and three looks", () => {
    expect(renderToStaticMarkup(<IconButton icon={Plus} aria-label="Add" size="sm" />)).toContain(
      "size-8",
    );
    expect(renderToStaticMarkup(<IconButton icon={Plus} aria-label="Add" size="lg" />)).toContain(
      "size-12",
    );
    expect(
      renderToStaticMarkup(<IconButton icon={Plus} aria-label="Add" variant="primary" />),
    ).toContain("bg-brand-600");
    expect(
      renderToStaticMarkup(<IconButton icon={Plus} aria-label="Add" variant="secondary" />),
    ).toContain("border-line-strong");
  });
});

describe("ButtonGroup", () => {
  it("is a labelled group that joins its children", () => {
    const html = renderToStaticMarkup(
      <ButtonGroup aria-label="Export">
        <Button variant="secondary">Copy</Button>
        <Button variant="secondary">Share</Button>
      </ButtonGroup>,
    );
    expect(html).toMatch(
      /^<div role="group" class="[^"]*\*:not-first:-ml-px[^"]*" aria-label="Export">/,
    );
  });
});
