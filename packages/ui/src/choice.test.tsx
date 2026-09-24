import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Checkbox, ChoiceCards, RadioGroup, RadioItem, SegmentedControl, Switch } from "./choice";

describe("ChoiceCards", () => {
  it("keeps the existing API: native radios in a fieldset with a legend", () => {
    const html = renderToStaticMarkup(
      <ChoiceCards
        name="type"
        legend="What are you building?"
        defaultValue="b"
        options={[
          { value: "a", title: "Store" },
          { value: "b", title: "Website", description: "Pages and forms." },
        ]}
        error="Choose one."
      />,
    );
    expect(html).toMatch(/^<fieldset aria-describedby="[^"]+" aria-invalid="true"/);
    expect(html).toContain("What are you building?</legend>");
    expect(html.match(/<input type="radio"[^>]*name="type"/g)).toHaveLength(2);
    expect(html).toMatch(/checked="" value="b"/);
    expect(html).toContain("has-checked:border-brand-500");
    expect(html).toContain("Choose one.");
  });
});

describe("Checkbox", () => {
  it("wires its label and description", () => {
    const html = renderToStaticMarkup(
      <Checkbox id="c" label="Weekly summary" description="Every Monday." defaultChecked />,
    );
    expect(html).toContain('role="checkbox" aria-checked="true"');
    expect(html).toContain('id="c"');
    expect(html).toContain('aria-describedby="c-description"');
    expect(html).toContain('<label for="c"');
    expect(html).toContain('<span id="c-description"');
  });

  it("draws its box at 3:1 (line-control), darker on hover", () => {
    const html = renderToStaticMarkup(<Checkbox aria-label="Select" />);
    expect(html).toContain("border border-line-control");
    expect(html).toContain("hover:border-neutral-500");
  });

  it("shows indeterminate as mixed", () => {
    const html = renderToStaticMarkup(<Checkbox aria-label="Select all" checked="indeterminate" />);
    expect(html).toContain('aria-checked="mixed"');
    expect(html).toContain('data-state="indeterminate"');
  });
});

describe("RadioGroup", () => {
  it("renders radios with labels", () => {
    const html = renderToStaticMarkup(
      <RadioGroup defaultValue="b" aria-label="Speed">
        <RadioItem id="a" value="a" label="Standard" />
        <RadioItem id="b" value="b" label="Express" description="1–2 days" />
      </RadioGroup>,
    );
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Speed"');
    expect(html).toMatch(
      /role="radio" aria-checked="true"[^>]*id="b"|id="b"[^>]*aria-checked="true"/,
    );
    expect(html).toContain('<label for="a"');
    expect(html).toContain('aria-describedby="b-description"');
    expect(html).toContain("border border-line-control");
    // The checked dot is a transparent border over a white fill, so forced
    // colours (which drop fills) still paint it.
    expect(html).toContain("size-1.5 rounded-full border-3 border-transparent bg-white");
  });
});

describe("Switch", () => {
  it("is a switch with a 36 × 20 track and a wired label", () => {
    const html = renderToStaticMarkup(<Switch id="s" label="Online store" defaultChecked />);
    expect(html).toContain('role="switch" aria-checked="true"');
    expect(html).toContain("h-5 w-9");
    expect(html).toContain('<label for="s"');
  });

  it("has a 3:1 off track and an outlined, Highlight-filled look in forced colours", () => {
    const html = renderToStaticMarkup(<Switch aria-label="Online store" />);
    expect(html).toContain("bg-line-control");
    expect(html).toContain("hover:bg-neutral-500");
    expect(html).toContain("forced-colors:forced-color-adjust-none");
    expect(html).toContain("forced-colors:border-[CanvasText]");
    expect(html).toContain("forced-colors:data-[state=checked]:bg-[Highlight]");
    expect(html).toContain("forced-colors:bg-[CanvasText]"); // the thumb
  });

  it("can put the label first for settings rows", () => {
    const html = renderToStaticMarkup(<Switch id="s" label="Online store" labelPosition="start" />);
    expect(html.indexOf("<label")).toBeLessThan(html.indexOf('role="switch"'));
  });
});

describe("SegmentedControl", () => {
  const options = [
    { value: "day", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
  ];

  it("has radio semantics and places the pill under the selected segment", () => {
    const html = renderToStaticMarkup(
      <SegmentedControl aria-label="Period" options={options} defaultValue="month" />,
    );
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Period"');
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(html).toMatch(/aria-checked="true"[^>]*>Month</);
    expect(html).toContain("width:calc((100% - 6px) / 3)");
    expect(html).toMatch(
      /<span aria-hidden="true" class="absolute inset-y-\[3px\][^"]*" style="[^"]*transform:translateX\(200%\)/,
    );
  });

  it("borders the track and the selected pill at 3:1 (the pill's border survives forced colours)", () => {
    const html = renderToStaticMarkup(
      <SegmentedControl aria-label="Period" options={options} defaultValue="day" />,
    );
    expect(html).toMatch(/role="radiogroup"[^>]*class="[^"]*border border-line-control/);
    expect(html).toMatch(
      /<span aria-hidden="true" class="[^"]*border border-line-control bg-surface/,
    );
  });

  it("gives every segment a 44 px touch target", () => {
    const md = renderToStaticMarkup(<SegmentedControl aria-label="Period" options={options} />);
    expect(md).toContain("pointer-coarse:min-w-11");
    expect(md).toContain("pointer-coarse:after:-inset-y-1.5"); // 32 + 12
    const sm = renderToStaticMarkup(
      <SegmentedControl aria-label="Period" options={options} size="sm" />,
    );
    expect(sm).toContain("pointer-coarse:after:-inset-y-2.5"); // 24 + 20
  });

  it("hides the pill when nothing is selected", () => {
    const html = renderToStaticMarkup(<SegmentedControl aria-label="Period" options={options} />);
    expect(html).not.toContain('<span aria-hidden="true" class="absolute');
  });
});
