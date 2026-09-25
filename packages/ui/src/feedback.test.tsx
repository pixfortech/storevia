import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Progress, Tooltip, TooltipProvider } from "./feedback";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Toast, Toaster, ToastProvider, useToast } from "./toast";
import { Spinner } from "./spinner";

describe("Spinner", () => {
  it("is decorative by default and inherits the text colour", () => {
    const html = renderToStaticMarkup(<Spinner />);
    expect(html).toMatch(
      /^<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"[^>]*aria-hidden="true"/,
    );
    expect(html).toContain("size-4");
  });

  it("stops turning under reduced motion and pulses instead (SMIL, not CSS)", () => {
    const html = renderToStaticMarkup(<Spinner size="lg" />);
    // One rotation, inside a group that reduced motion hides.
    expect(html.match(/<animateTransform/g)).toHaveLength(1);
    expect(html).toMatch(/<g class="motion-reduce:hidden">.*<animateTransform[^>]*dur="0.75s"/);
    // Reduced motion: a ring whose opacity breathes, with no transform.
    expect(html).toMatch(
      /<circle [^>]*class="hidden motion-reduce:inline"><animate attributeName="opacity"/,
    );
    expect(html).not.toMatch(/motion-reduce:inline"><animateTransform/);
  });

  it("announces a label as a status", () => {
    const html = renderToStaticMarkup(<Spinner label="Loading orders" />);
    expect(html).toMatch(/^<span role="status"/);
    expect(html).toContain('<span class="sr-only">Loading orders</span>');
  });
});

describe("Progress", () => {
  it("exposes a determinate value", () => {
    const html = renderToStaticMarkup(<Progress label="Uploading" value={40} showValue />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain(
      'aria-valuemin="0" aria-valuemax="100" aria-valuenow="40" aria-valuetext="40%"',
    );
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
    expect(html).toContain("width:40%");
    expect(html).toContain(">40%</span>");
  });

  it("clamps out-of-range values and supports a custom max and spoken text", () => {
    expect(renderToStaticMarkup(<Progress aria-label="x" value={150} />)).toContain(
      'aria-valuenow="100"',
    );
    expect(renderToStaticMarkup(<Progress aria-label="x" value={-5} />)).toContain(
      'aria-valuenow="0"',
    );
    const files = renderToStaticMarkup(
      <Progress aria-label="Files" value={3} max={5} valueText="3 of 5 files" />,
    );
    expect(files).toContain('aria-valuemax="5" aria-valuenow="3" aria-valuetext="3 of 5 files"');
    expect(files).toContain("width:60%");
  });

  it("stays visible in forced colours: outlined track, Highlight bar", () => {
    for (const html of [
      renderToStaticMarkup(<Progress aria-label="Upload" value={40} />),
      renderToStaticMarkup(<Progress aria-label="Export" />),
    ]) {
      expect(html).toContain("forced-colors:outline-1");
      expect(html).toContain("forced-colors:bg-[Highlight] forced-colors:forced-color-adjust-none");
    }
  });

  it("omits the value when indeterminate", () => {
    const html = renderToStaticMarkup(<Progress aria-label="Preparing export" />);
    expect(html).toContain('aria-label="Preparing export"');
    expect(html).not.toContain("aria-valuenow");
    expect(html).toContain('aria-busy="true"');
  });
});

describe("Tooltip and Popover", () => {
  it("render only their triggers on the server", () => {
    const tooltip = renderToStaticMarkup(
      <TooltipProvider>
        <Tooltip content="Settings">
          <button type="button">S</button>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(tooltip).toContain('data-state="closed"');
    expect(tooltip).not.toContain('role="tooltip"');
    // Standalone tooltips bring their own provider.
    expect(() =>
      renderToStaticMarkup(
        <Tooltip content="Alone">
          <button type="button">A</button>
        </Tooltip>,
      ),
    ).not.toThrow();
    const popover = renderToStaticMarkup(
      <Popover>
        <PopoverTrigger>Share</PopoverTrigger>
        <PopoverContent>Panel</PopoverContent>
      </Popover>,
    );
    expect(popover).toContain('aria-haspopup="dialog" aria-expanded="false"');
    expect(popover).not.toContain("Panel");
  });
});

describe("Toasts", () => {
  it("useToast needs a ToastProvider", () => {
    function Orphan() {
      useToast();
      return null;
    }
    expect(() => renderToStaticMarkup(<Orphan />)).toThrow(/ToastProvider/);
  });

  it("renders the viewport region inside a provider", () => {
    const html = renderToStaticMarkup(
      <ToastProvider label="Notifications">
        <Toaster />
      </ToastProvider>,
    );
    expect(html).toContain('role="region"');
    expect(html).toContain("z-(--z-toast)");
    expect(html).toContain("env(safe-area-inset-bottom)");
  });

  it("draws a toned toast with title, description and action", () => {
    const html = renderToStaticMarkup(
      <ToastProvider>
        <Toast
          open
          tone="danger"
          title="Couldn’t publish"
          description="Try again."
          action={{ label: "Retry", onClick: () => undefined }}
        />
        <Toaster />
      </ToastProvider>,
    );
    // Radix portals open toasts into the viewport on the client; on the server
    // nothing leaks into the page markup.
    expect(html).not.toContain("Couldn’t publish");
  });
});
