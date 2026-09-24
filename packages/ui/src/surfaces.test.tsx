import { Store } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Alert,
  Avatar,
  AvatarGroup,
  avatarInitials,
  avatarTint,
  Badge,
  Card,
  cardClasses,
  CardHeader,
  Divider,
  EmptyState,
  ExampleDataBadge,
  PageHeader,
  Skeleton,
  StatusDot,
  type BadgeTone,
} from "./surfaces";

describe("Card", () => {
  it("is a hairline card by default and keeps callers' attributes", () => {
    const html = renderToStaticMarkup(
      <Card data-testid="plan-card" className="max-w-3xl">
        x
      </Card>,
    );
    expect(html).toContain('data-testid="plan-card"');
    expect(html).toContain("border-line");
    expect(html).toContain("rounded-card");
    expect(html).toContain("max-w-3xl");
    expect(html).not.toContain("shadow-card");
  });

  it("maps variants to their treatment", () => {
    expect(cardClasses("raised")).toContain("shadow-card");
    expect(cardClasses("sunken")).toContain("bg-subtle");
    expect(cardClasses("dashed")).toContain("border-dashed");
  });

  it("lifts interactive cards with HoverLift's contract, not a lift of its own", () => {
    const interactive = cardClasses("interactive");
    // motion.css: 2 px + raised shadow over 200 ms, hover-capable pointers,
    // no movement under reduced motion.
    expect(interactive).toContain("sv-motion-lift");
    expect(interactive).toContain("hover:border-line-strong");
    expect(interactive).toContain("focus-visible:outline-focus");
    expect(interactive).not.toMatch(/translate-y|duration-/);
  });

  it("renders the header's title as a heading with description and actions", () => {
    const html = renderToStaticMarkup(
      <CardHeader
        title="Usage"
        description="Over a limit, nothing is removed."
        actions={<b>A</b>}
      />,
    );
    expect(html).toMatch(/<h2[^>]*>Usage<\/h2>/);
    expect(html).toContain("Over a limit, nothing is removed.");
    expect(html).toContain("<b>A</b>");
    expect(html).toContain("border-b");
  });
});

describe("PageHeader", () => {
  it("renders one h1 with eyebrow, breadcrumb slot and actions", () => {
    const html = renderToStaticMarkup(
      <PageHeader
        eyebrow="Settings"
        title="Members"
        breadcrumb={<nav aria-label="Breadcrumb">crumbs</nav>}
        actions={<button type="button">Invite</button>}
      />,
    );
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("text-h3");
    expect(html).toContain("md:text-h2");
    expect(html.indexOf("crumbs")).toBeLessThan(html.indexOf("Members"));
    expect(html).toContain("Invite");
  });

  it("can render its title at another level, keeping the look", () => {
    const html = renderToStaticMarkup(<PageHeader as="h3" title="Members" />);
    expect(html).not.toContain("<h1");
    expect(html).toMatch(/<h3 class="[^"]*md:text-h2[^"]*">Members<\/h3>/);
  });
});

describe("ExampleDataBadge", () => {
  it("is the one neutral dot badge that always reads 'Example data'", () => {
    const html = renderToStaticMarkup(<ExampleDataBadge />);
    expect(html).toContain(">Example data</span>");
    expect(html).toContain("data-example-data");
    expect(html).toContain("bg-neutral-400"); // the dot
    expect(html).toContain("ring-line-strong");
    expect(html).toContain("h-5"); // sm by default
    expect(html).not.toMatch(/accent|warning/);
    expect(renderToStaticMarkup(<ExampleDataBadge size="md" />)).toContain("h-6");
  });
});

describe("Badge", () => {
  const tones: Record<BadgeTone, [string, string]> = {
    neutral: ["bg-neutral-50", "text-neutral-700"],
    brand: ["bg-brand-50", "text-brand-700"],
    accent: ["bg-accent-50", "text-accent-700"],
    success: ["bg-success-50", "text-success-700"],
    warning: ["bg-warning-50", "text-warning-700"],
    danger: ["bg-danger-50", "text-danger-700"],
    info: ["bg-info-50", "text-info-700"],
  };

  it.each(Object.entries(tones))("soft %s uses the 50 fill and 700 text", (tone, [bg, text]) => {
    const html = renderToStaticMarkup(<Badge tone={tone as BadgeTone}>Label</Badge>);
    expect(html).toContain(bg);
    expect(html).toContain(text);
    expect(html).toContain("rounded-pill");
    expect(html).toContain("text-caption");
  });

  it("defaults to a neutral soft badge and passes attributes through", () => {
    const html = renderToStaticMarkup(
      <Badge data-testid="plan-status" className="ml-2">
        Active
      </Badge>,
    );
    expect(html).toContain('data-testid="plan-status"');
    expect(html).toContain("ml-2");
    expect(html).toContain("bg-neutral-50");
  });

  it("outline and dot variants drop the fill; dot adds a coloured dot", () => {
    const outline = renderToStaticMarkup(
      <Badge tone="success" variant="outline">
        Paid
      </Badge>,
    );
    expect(outline).not.toContain("bg-success-50");
    expect(outline).toContain("text-success-700");
    const dot = renderToStaticMarkup(
      <Badge tone="danger" variant="dot">
        Failed
      </Badge>,
    );
    expect(dot).toContain("bg-danger-500");
    expect(dot).toContain('aria-hidden="true"');
    expect(dot).toContain("Failed");
  });

  it("has two sizes", () => {
    expect(renderToStaticMarkup(<Badge size="sm">S</Badge>)).toContain("h-5");
    expect(renderToStaticMarkup(<Badge>M</Badge>)).toContain("h-6");
  });
});

describe("StatusDot", () => {
  it("is decorative without a label and an image with one", () => {
    expect(renderToStaticMarkup(<StatusDot tone="success" />)).toContain('aria-hidden="true"');
    const live = renderToStaticMarkup(<StatusDot tone="success" pulse label="Live" />);
    expect(live).toContain('role="img"');
    expect(live).toContain('aria-label="Live"');
    expect(live).toContain("animate-ping");
    expect(live).toContain("motion-reduce:hidden");
  });

  it("keeps dots visible in forced-colours mode (drawn in the text colour)", () => {
    const forced = "forced-color-adjust-none forced-colors:bg-[CanvasText]";
    expect(renderToStaticMarkup(<StatusDot tone="danger" />)).toContain(forced);
    expect(
      renderToStaticMarkup(
        <Badge variant="dot" tone="success">
          Paid
        </Badge>,
      ),
    ).toContain(forced);
    // The decorative halo goes rather than flashing in system colours.
    expect(renderToStaticMarkup(<StatusDot pulse />)).toContain("forced-colors:hidden");
  });
});

describe("Alert", () => {
  it("announces danger assertively and the rest politely, always with an icon", () => {
    const danger = renderToStaticMarkup(<Alert tone="danger" title="Payment failed" />);
    expect(danger).toContain('role="alert"');
    expect(danger).toContain("<svg");
    const info = renderToStaticMarkup(<Alert>Heads up</Alert>);
    expect(info).toContain('role="status"');
    expect(info).toContain("Heads up");
  });

  it("renders actions and a labelled dismiss button when asked", () => {
    const html = renderToStaticMarkup(
      <Alert
        tone="warning"
        title="Nearly full"
        actions={<a href="/billing">Upgrade</a>}
        onDismiss={() => undefined}
      />,
    );
    expect(html).toContain('href="/billing"');
    expect(html).toContain('aria-label="Dismiss"');
  });

  it("can drop the icon", () => {
    expect(renderToStaticMarkup(<Alert icon={false}>Plain</Alert>)).not.toContain("<svg");
  });
});

describe("EmptyState", () => {
  it("prefers the illustration slot and renders both actions", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        illustration={<i>art</i>}
        icon={<Store />}
        title="No products yet"
        description="Add your first product."
        action={<a href="/new">Add product</a>}
        secondaryAction={<a href="/import">Import</a>}
      />,
    );
    expect(html).toContain("<i>art</i>");
    expect(html).not.toContain("lucide-store");
    expect(html).toMatch(/<h2[^>]*>No products yet<\/h2>/);
    expect(html).toContain("Add product");
    expect(html).toContain("Import");
  });

  it("compact uses less padding and a smaller title", () => {
    const html = renderToStaticMarkup(<EmptyState compact title="Nothing" />);
    expect(html).toContain("py-10");
    expect(html).toContain("text-body");
  });
});

describe("Skeleton", () => {
  it("is decorative, shimmers, and rests under reduced motion", () => {
    const html = renderToStaticMarkup(<Skeleton className="h-4 w-20" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("animate-shimmer");
    expect(html).toContain("motion-reduce:animate-none");
  });

  it("draws text lines with a shorter last line, and circles", () => {
    const html = renderToStaticMarkup(<Skeleton shape="text" lines={3} />);
    expect(html.match(/rounded-xs/g)).toHaveLength(3);
    expect(html).toContain("w-3/5");
    expect(renderToStaticMarkup(<Skeleton shape="circle" />)).toContain("rounded-full");
  });
});

describe("Avatar", () => {
  it("derives initials from the first and last words", () => {
    expect(avatarInitials("Amara Okafor")).toBe("AO");
    expect(avatarInitials("Mary Jane Watson")).toBe("MW");
    expect(avatarInitials("acme")).toBe("A");
    expect(avatarInitials("  élodie   durand ")).toBe("ÉD");
    expect(avatarInitials("(Studio) North")).toBe("SN");
    expect(avatarInitials("")).toBe("?");
  });

  it("picks the same tint for the same name, from the brand/accent/navy tints", () => {
    expect(avatarTint("Amara Okafor")).toBe(avatarTint("Amara Okafor"));
    expect(avatarTint("Amara Okafor")).toBe(avatarTint("  amara okafor"));
    const names = [
      "Amara Okafor",
      "Jonas Weber",
      "Priya Raman",
      "Tom Ellis",
      "Sofia Marin",
      "Kenji Sato",
      "Lena Novak",
      "Omar Haddad",
    ];
    const tints = new Set(names.map(avatarTint));
    expect(tints.size).toBeGreaterThan(1);
    for (const tint of tints)
      expect(tint).toMatch(/^bg-(brand|accent|navy)-(50|100) text-(brand|accent|navy)-(700|800)$/);
  });

  it("is decorative by default, keeps a caller's radius, and layers the image over initials", () => {
    const html = renderToStaticMarkup(
      <Avatar name="Acme Studio" className="rounded-control" src="/logo.png" />,
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("rounded-control");
    expect(html).not.toContain("rounded-full");
    expect(html).toContain(">AS<img");
    expect(html).toContain('alt=""');
    const named = renderToStaticMarkup(<Avatar name="Acme" label="Acme" />);
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="Acme"');
  });

  it("groups avatars with a +N count", () => {
    const html = renderToStaticMarkup(
      <AvatarGroup
        label="Team"
        max={2}
        people={[{ name: "A B" }, { name: "C D" }, { name: "E F" }, { name: "G H" }]}
      />,
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Team"');
    expect(html).toContain('aria-label="and 2 more"');
    expect(html).toContain("+2");
    expect(html.match(/ring-surface/g)).toHaveLength(3);
  });
});

describe("Divider", () => {
  it("is a separator with an orientation, or decorative", () => {
    expect(renderToStaticMarkup(<Divider />)).toContain('role="separator"');
    expect(renderToStaticMarkup(<Divider orientation="vertical" />)).toContain(
      'aria-orientation="vertical"',
    );
    expect(renderToStaticMarkup(<Divider decorative />)).toContain('role="none"');
    expect(renderToStaticMarkup(<Divider label="or" />)).toContain(">or<");
  });
});
