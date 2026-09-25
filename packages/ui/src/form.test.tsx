import { Globe } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dateRangeBounds } from "./control-helpers";
import { Field, Input, SearchInput, Select, Textarea } from "./form";
import { Combobox } from "./combobox";
import { DateRangePicker } from "./date-range-picker";

const attr = (html: string, name: string) =>
  [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, "g"))].map((m) => m[1]);

describe("Field", () => {
  it("wires label, description and error through the render prop", () => {
    const html = renderToStaticMarkup(
      <Field
        label="Email"
        description="We never share it."
        error="Enter an email address."
        id="email"
      >
        {({ id, describedBy, invalid }) => (
          <input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
        )}
      </Field>,
    );
    expect(html).toContain('<label id="email-label" for="email"');
    expect(html).toContain('<p id="email-description"');
    expect(html).toContain('<p id="email-error"');
    expect(html).toContain(
      '<input id="email" aria-describedby="email-description email-error" aria-invalid="true"/>',
    );
    // The error carries an icon, and the icon is decorative.
    expect(html).toMatch(/id="email-error"[^>]*><svg[^>]*aria-hidden="true"/);
  });

  it("keeps the older `hint` prop and omits ids that don't exist", () => {
    const html = renderToStaticMarkup(
      <Field label="Name" hint="As on your ID" id="n">
        {({ describedBy, invalid }) => <span data-d={describedBy} data-i={String(invalid)} />}
      </Field>,
    );
    expect(html).toContain('<span data-d="n-description" data-i="false"></span>');
    const bare = renderToStaticMarkup(
      <Field label="Name" id="n">
        {({ describedBy }) => <span data-d={describedBy ?? "none"} />}
      </Field>,
    );
    expect(bare).toContain('data-d="none"');
  });

  it("wires a control passed as a child through context", () => {
    const html = renderToStaticMarkup(
      <Field label="Store name" description="Shown on invoices." error="Too short." required>
        <Input name="name" />
      </Field>,
    );
    const [labelFor] = attr(html, "for");
    const [inputId] = attr(html, "id").filter(
      (id) => !id?.endsWith("-label") && !id?.endsWith("-description") && !id?.endsWith("-error"),
    );
    expect(labelFor).toBeTruthy();
    expect(inputId).toBe(labelFor);
    expect(html).toContain(
      `aria-describedby="${String(labelFor)}-description ${String(labelFor)}-error"`,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(/<input[^>]*required=""/);
    // The asterisk is visual only; the control is marked required.
    expect(html).toContain('<span aria-hidden="true" class="ml-0.5 text-danger-600">*</span>');
  });

  it("lets explicit props win over the context", () => {
    const html = renderToStaticMarkup(
      <Field label="Code" error="Wrong" id="code">
        <Textarea id="custom" aria-describedby="elsewhere" />
      </Field>,
    );
    expect(html).toContain('id="custom"');
    expect(html).toContain('aria-describedby="elsewhere"');
    expect(html).toContain('aria-invalid="true"');
  });

  it("marks optional fields and can hide the label visually", () => {
    const optional = renderToStaticMarkup(
      <Field label="Company" optional>
        <Select />
      </Field>,
    );
    expect(optional).toContain(">Optional</span>");
    const hidden = renderToStaticMarkup(
      <Field label="Search" hideLabel>
        <Input />
      </Field>,
    );
    expect(hidden).toMatch(/class="[^"]*sr-only[^"]*"><label/);
    // Help and error follow the control, keeping rows of fields aligned.
    const order = renderToStaticMarkup(
      <Field label="Name" description="Help" error="Error">
        <Input />
      </Field>,
    );
    expect(order.indexOf("<input")).toBeLessThan(order.indexOf(">Help</p>"));
    expect(order.indexOf(">Help</p>")).toBeLessThan(order.indexOf("Error</span>"));
  });
});

describe("Input, Select, SearchInput", () => {
  it("renders a bare input unless adorned, keeping className on the control", () => {
    const html = renderToStaticMarkup(<Input className="sm:w-64" placeholder="Search" />);
    expect(html).toMatch(/^<input class="[^"]*sm:w-64/);
    expect(html).toContain("h-10");
    expect(renderToStaticMarkup(<Input size="lg" />)).toContain("h-12");
  });

  it("still accepts the native numeric size attribute (spread from InputHTMLAttributes)", () => {
    const native: InputHTMLAttributes<HTMLInputElement> = { size: 12, placeholder: "Code" };
    const html = renderToStaticMarkup(<Input {...native} />);
    expect(html).toContain('size="12"');
    expect(html).toContain("h-10");
    expect(renderToStaticMarkup(<Select size={4} />)).toContain('size="4"');
  });

  it("frames adorned inputs: icon, addon, className on the frame", () => {
    const html = renderToStaticMarkup(
      <Input
        leadingIcon={Globe}
        addon=".storevia.site"
        className="max-w-sm"
        aria-label="Subdomain"
      />,
    );
    expect(html).toMatch(/^<div class="[^"]*focus-within:border-brand-500[^"]*max-w-sm/);
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toContain(".storevia.site</span>");
    expect(html).toMatch(/<input class="[^"]*flex-1[^"]*" aria-label="Subdomain"/);
  });

  it("gives text fields a 3:1 boundary that darkens on hover", () => {
    for (const html of [
      renderToStaticMarkup(<Input />),
      renderToStaticMarkup(<Textarea />),
      renderToStaticMarkup(<Select />),
      renderToStaticMarkup(<Input leadingIcon={Globe} aria-label="Site" />),
    ]) {
      expect(html).toContain("border-line-control");
      expect(html).toContain("hover:border-neutral-500");
      expect(html).not.toMatch(/(\s|")border-line-strong(\s|")/);
    }
  });

  it("shows an empty-value option as the Select's placeholder, in faint ink", () => {
    const html = renderToStaticMarkup(
      <Select defaultValue="">
        <option value="" disabled>
          Choose an industry
        </option>
        <option>Food and drink</option>
      </Select>,
    );
    expect(html).toContain("[&amp;:has(option[value=&#x27;&#x27;]:checked)]:text-ink-faint");
    // The options themselves stay in ink.
    expect(html).toContain("[&amp;_option]:text-ink");
    expect(html).toContain('<option value="" disabled="" selected="">Choose an industry</option>');
  });

  it("draws the Select chevron as a background so className sizes one element", () => {
    const html = renderToStaticMarkup(
      <Select className="h-9 w-44">
        <option>One</option>
      </Select>,
    );
    expect(html).toMatch(/^<select class="[^"]*appearance-none[^"]*h-9 w-44/);
    expect(html).toContain("background-image:url(");
  });

  it("shows the shortcut hint while empty and a clear button with a value", () => {
    const empty = renderToStaticMarkup(<SearchInput aria-label="Search" shortcut="⌘K" />);
    expect(empty).toContain('type="search"');
    // The shared <Kbd> keycap, hidden on phones.
    expect(empty).toMatch(/<kbd class="[^"]*hidden sm:inline-flex[^"]*">⌘K<\/kbd>/);
    expect(empty).toContain("shadow-[inset_0_-1px_0_var(--color-line)]");
    expect(empty).not.toContain("Clear search");
    const filled = renderToStaticMarkup(
      <SearchInput aria-label="Search" shortcut="⌘K" value="apron" onChange={() => undefined} />,
    );
    expect(filled).toContain('aria-label="Clear search"');
    expect(filled).not.toContain("⌘K");
  });
});

describe("Combobox", () => {
  const options = [
    { value: "usd", label: "US dollar" },
    { value: "eur", label: "Euro" },
    { value: "brl", label: "Brazilian real", disabled: true },
  ];

  it("renders the ARIA 1.2 combobox pattern, closed", () => {
    const html = renderToStaticMarkup(
      <Combobox
        options={options}
        defaultValue="eur"
        aria-label="Currency"
        name="currency"
        id="cur"
      />,
    );
    expect(html).toContain(
      'id="cur" type="text" role="combobox" aria-expanded="false" aria-controls="cur-listbox" aria-autocomplete="list"',
    );
    expect(html).not.toContain("aria-activedescendant");
    expect(html).toContain('value="Euro"');
    // The options open in a portal; while closed an empty, hidden listbox
    // keeps aria-controls pointing at something real.
    expect(html).toContain('<ul id="cur-listbox" role="listbox" aria-label="Currency" hidden="">');
    expect(html.match(/id="cur-listbox"/g)).toHaveLength(1);
    expect(html).not.toContain('role="option"');
    expect(html).toContain('<input type="hidden" name="currency" value="eur"/>');
  });

  it("takes its id, description and label from a Field", () => {
    const html = renderToStaticMarkup(
      <Field label="Currency" description="Used at checkout." error="Choose one." id="f">
        <Combobox options={options} />
      </Field>,
    );
    expect(html).toContain('id="f" type="text" role="combobox"');
    expect(html).toContain('aria-describedby="f-description f-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="listbox" aria-labelledby="f-label"');
  });
});

describe("dateRangeBounds", () => {
  const today = new Date(2026, 8, 24, 15, 30); // 24 Sep 2026, local time

  it("covers the preset's days inclusively, ending today", () => {
    expect(dateRangeBounds({ preset: "7d" }, today)).toEqual({
      from: "2026-09-18",
      to: "2026-09-24",
    });
    expect(dateRangeBounds({ preset: "30d" }, today)).toEqual({
      from: "2026-08-26",
      to: "2026-09-24",
    });
    expect(dateRangeBounds({ preset: "90d" }, today)).toEqual({
      from: "2026-06-27",
      to: "2026-09-24",
    });
    expect(dateRangeBounds({ preset: "12m" }, today)).toEqual({
      from: "2025-09-25",
      to: "2026-09-24",
    });
  });

  it("crosses month and year ends and leap days", () => {
    expect(dateRangeBounds({ preset: "7d" }, new Date(2026, 0, 3))).toEqual({
      from: "2025-12-28",
      to: "2026-01-03",
    });
    expect(dateRangeBounds({ preset: "12m" }, new Date(2028, 1, 29))).toEqual({
      from: "2027-03-01",
      to: "2028-02-29",
    });
  });

  it("passes a custom range through", () => {
    expect(
      dateRangeBounds({ preset: "custom", from: "2026-01-01", to: "2026-01-31" }, today),
    ).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
    });
  });
});

describe("DateRangePicker", () => {
  it("offers presets as a radio group and hides the date inputs until Custom", () => {
    const html = renderToStaticMarkup(<DateRangePicker />);
    expect(html).toContain('role="group" aria-label="Date range"');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Last 30 days"');
    expect(html).toMatch(
      /aria-checked="true"[^>]*aria-label="Last 30 days"|aria-label="Last 30 days"[^>]*aria-checked="true"/,
    );
    expect(html).not.toContain('type="date"');
  });

  it("shows two labelled native date inputs for a custom range", () => {
    const html = renderToStaticMarkup(
      <DateRangePicker value={{ preset: "custom", from: "2026-09-01", to: "2026-09-10" }} />,
    );
    expect(html.match(/type="date"/g)).toHaveLength(2);
    expect(html).toContain('value="2026-09-01"');
    expect(html).toContain('max="2026-09-10"');
    expect(html).toContain('min="2026-09-01"');
    expect(html).toContain(">From</label>");
    expect(html).toContain(">To</label>");
  });

  it("gives its inputs their own ids inside a Field", () => {
    const html = renderToStaticMarkup(
      <Field label="Period" id="period">
        <DateRangePicker value={{ preset: "custom", from: "2026-09-01", to: "2026-09-10" }} />
      </Field>,
    );
    expect(html.match(/id="period"/g)).toBeNull();
  });
});
