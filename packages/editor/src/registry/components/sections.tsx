// Section blocks (ADR-0030 §4): the Site Engine's generic, business-neutral
// building blocks. A page is a list of them. Each is self-contained (its own
// <section> landmark and container), configured only through bounded
// settings, rendered on the server with no client JavaScript, and renders
// nothing until it has content: a new block never shows invented text.
import type { ReactNode } from "react";
import { z } from "zod";
import { mediaRefSchema, plainText, richTextSchema, type LinkTarget } from "../../document/refs";
import { Image } from "../../render/parts";
import { RichText } from "../../render/rich-text";
import type { RichTextDoc } from "../../rich-text";
import { cx, defineComponent } from "../define";
import type { PropertyControl, SchemaKit, SiteRenderContext } from "../types";

// ---------------------------------------------------------------------------
// Shared presentation settings.
// ---------------------------------------------------------------------------

export const SECTION_BACKGROUNDS = ["default", "surface", "accent"] as const;
export const SECTION_SPACINGS = ["compact", "standard", "spacious"] as const;

export const sectionPresentation = {
  background: z.enum(SECTION_BACKGROUNDS),
  spacing: z.enum(SECTION_SPACINGS),
};
const PRESENTATION_DEFAULTS = { background: "default", spacing: "standard" } as const;

export const sectionPresentationControls: readonly PropertyControl[] = [
  {
    prop: "background",
    kind: "select",
    label: "Background",
    options: [
      { value: "default", label: "Page background" },
      { value: "surface", label: "Subtle" },
      { value: "accent", label: "Brand colour" },
    ],
  },
  {
    prop: "spacing",
    kind: "select",
    label: "Spacing",
    options: [
      { value: "compact", label: "Compact" },
      { value: "standard", label: "Standard" },
      { value: "spacious", label: "Spacious" },
    ],
  },
];

interface Presentation {
  readonly background: (typeof SECTION_BACKGROUNDS)[number];
  readonly spacing: (typeof SECTION_SPACINGS)[number];
}

/** The section landmark every block renders into. */
export function SectionFrame({
  type,
  className,
  props,
  headingId,
  width = "standard",
  children,
}: {
  type: string;
  className: string;
  props: Presentation;
  headingId?: string | undefined;
  width?: "narrow" | "standard" | "full";
  children: ReactNode;
}) {
  return (
    <section
      className={cx(
        "sv-block",
        `sv-block-${type}`,
        `sv-bg-${props.background}`,
        `sv-pad-${props.spacing}`,
        className,
      )}
      aria-labelledby={headingId}
    >
      {width === "full" ? (
        children
      ) : (
        <div className={cx("sv-container", width === "narrow" && "sv-container-narrow")}>
          {children}
        </div>
      )}
    </section>
  );
}

/** The section's heading: the page's h1 when the section comes first. */
function SectionHeading({
  id,
  position,
  className,
  children,
}: {
  id: string;
  position: number | null;
  className?: string;
  children: ReactNode;
}) {
  const Tag = position === 0 ? "h1" : "h2";
  return (
    <Tag id={id} className={cx("sv-block-heading", className)}>
      {children}
    </Tag>
  );
}

const headingId = (nodeId: string) => `h-${nodeId}`;

/** True when a rich-text document has any visible text. */
function hasText(doc: RichTextDoc | null): boolean {
  const walk = (node: { text?: string; content?: readonly unknown[] }): boolean =>
    (typeof node.text === "string" && node.text.trim() !== "") ||
    (node.content ?? []).some((child) => walk(child as { text?: string }));
  return doc !== null && walk(doc);
}

/** Rich text is null until it has text (an empty document normalises to null). */
const optionalRichText = richTextSchema.nullable();

// Actions: a label and a typed link; an action whose link no longer resolves
// renders as nothing.
const actionSchema = (kit: SchemaKit) =>
  z.strictObject({ label: plainText(80).min(1), link: kit.link }).nullable();

type Action = { readonly label: string; readonly link: LinkTarget } | null;

function Actions({
  primary,
  secondary,
  ctx,
}: {
  primary: Action;
  secondary?: Action;
  ctx: SiteRenderContext;
}) {
  const items = [
    { action: primary, style: "primary" },
    { action: secondary ?? null, style: "secondary" },
  ].flatMap(({ action, style }) => {
    if (!action) return [];
    const href = ctx.data.link(action.link);
    return href ? [{ href, label: action.label, style }] : [];
  });
  if (items.length === 0) return null;
  return (
    <div className="sv-actions">
      {items.map((item) => (
        <a
          key={item.style}
          className={cx("sv-button", item.style === "secondary" && "sv-button-secondary")}
          href={item.href}
        >
          {item.label}
        </a>
      ))}
    </div>
  );
}

const ALIGN_CONTROL = (prop: string): PropertyControl => ({
  prop,
  kind: "select",
  label: "Alignment",
  options: [
    { value: "left", label: "Left" },
    { value: "center", label: "Centre" },
  ],
});

const COLUMNS_CONTROL: PropertyControl = {
  prop: "columns",
  kind: "select",
  label: "Columns on large screens",
  help: "Phones always show one or two columns.",
  options: [
    { value: "2", label: "2" },
    { value: "3", label: "3" },
    { value: "4", label: "4" },
  ],
};
const columns = z.union([z.literal(2), z.literal(3), z.literal(4)]);
const columnsVariable = (props: { columns?: number }) =>
  props.columns ? { "--sv-block-columns": String(props.columns) } : {};

const ASPECTS = ["original", "square", "landscape", "portrait"] as const;
const ASPECT_CONTROL: PropertyControl = {
  prop: "aspect",
  kind: "select",
  label: "Image shape",
  options: [
    { value: "original", label: "Original" },
    { value: "square", label: "Square" },
    { value: "landscape", label: "Landscape" },
    { value: "portrait", label: "Portrait" },
  ],
};

// ---------------------------------------------------------------------------
// Blocks.
// ---------------------------------------------------------------------------

/** The hero stays compatible with M4 documents: new settings have defaults. */
export const hero = (kit: SchemaKit) =>
  defineComponent({
    type: "hero",
    label: "Hero",
    description: "A large heading with an optional image and buttons.",
    icon: "panel-top",
    category: "marketing",
    section: true,
    headingProp: "heading",
    defaultProps: {
      heading: "",
      subheading: "",
      cta: null,
      secondaryCta: null,
      image: null,
      align: "center",
      height: "standard",
    },
    propertySchema: z.strictObject({
      /** "" shows the site's name. */
      heading: plainText(200),
      subheading: plainText(500),
      cta: actionSchema(kit),
      secondaryCta: actionSchema(kit),
      image: mediaRefSchema.nullable(),
      align: z.enum(["left", "center"]),
      height: z.enum(["compact", "standard", "tall"]),
    }),
    allowedChildren: "none",
    editorControls: [
      {
        prop: "heading",
        kind: "text",
        label: "Heading",
        help: "Leave empty to show your site's name.",
      },
      { prop: "subheading", kind: "textarea", label: "Text" },
      { prop: "image", kind: "media", label: "Background image" },
      { prop: "cta", kind: "action", label: "Button" },
      { prop: "secondaryCta", kind: "action", label: "Second button" },
      ALIGN_CONTROL("align"),
      {
        prop: "height",
        kind: "select",
        label: "Height",
        options: [
          { value: "compact", label: "Compact" },
          { value: "standard", label: "Standard" },
          { value: "tall", label: "Tall" },
        ],
      },
    ],
    render: ({ props, className, ctx, node, position }) => {
      const view = props.image ? ctx.data.image(props.image) : null;
      const Tag = position === 0 || position === null ? "h1" : "h2";
      return (
        <section
          className={cx(
            "sv-hero",
            `sv-hero-${props.height}`,
            props.align === "center" && "sv-hero-center",
            view && "sv-hero-image",
            className,
          )}
          aria-labelledby={headingId(node.id)}
        >
          {view ? (
            <Image
              image={view}
              sizes="100vw"
              priority={position === 0}
              className="sv-hero-backdrop"
            />
          ) : null}
          <div className="sv-container sv-hero-body">
            <Tag id={headingId(node.id)} className="sv-hero-heading">
              {props.heading || ctx.site.name}
            </Tag>
            {props.subheading ? <p className="sv-hero-sub">{props.subheading}</p> : null}
            <Actions primary={props.cta} secondary={props.secondaryCta} ctx={ctx} />
          </div>
        </section>
      );
    },
  });

export const textSection = defineComponent({
  type: "text-section",
  label: "Text",
  description: "A heading and formatted text.",
  icon: "pilcrow",
  category: "text",
  section: true,
  headingProp: "heading",
  defaultProps: {
    heading: "",
    body: null,
    align: "left",
    width: "narrow",
    ...PRESENTATION_DEFAULTS,
  },
  propertySchema: z.strictObject({
    heading: plainText(200),
    body: optionalRichText,
    align: z.enum(["left", "center"]),
    width: z.enum(["narrow", "standard"]),
    ...sectionPresentation,
  }),
  allowedChildren: "none",
  editorControls: [
    { prop: "heading", kind: "text", label: "Heading" },
    { prop: "body", kind: "richtext", label: "Text" },
    ALIGN_CONTROL("align"),
    {
      prop: "width",
      kind: "select",
      label: "Width",
      options: [
        { value: "narrow", label: "Narrow (easier to read)" },
        { value: "standard", label: "Standard" },
      ],
    },
    ...sectionPresentationControls,
  ],
  render: ({ props, className, node, position }) => {
    const body = hasText(props.body);
    if (!props.heading && !body) return null;
    return (
      <SectionFrame
        type="text"
        className={cx(className, props.align === "center" && "sv-align-center")}
        props={props}
        headingId={props.heading ? headingId(node.id) : undefined}
        width={props.width}
      >
        {props.heading ? (
          <SectionHeading id={headingId(node.id)} position={position}>
            {props.heading}
          </SectionHeading>
        ) : null}
        {body && props.body ? <RichText doc={props.body} className="sv-prose" /> : null}
      </SectionFrame>
    );
  },
});

export const imageSection = defineComponent({
  type: "image-section",
  label: "Image",
  description: "One image, contained or full width.",
  icon: "image",
  category: "media",
  section: true,
  defaultProps: {
    image: null,
    caption: "",
    width: "standard",
    aspect: "original",
    ...PRESENTATION_DEFAULTS,
  },
  propertySchema: z.strictObject({
    image: mediaRefSchema.nullable(),
    caption: plainText(300),
    width: z.enum(["narrow", "standard", "full"]),
    aspect: z.enum(ASPECTS),
    ...sectionPresentation,
  }),
  allowedChildren: "none",
  editorControls: [
    { prop: "image", kind: "media", label: "Image" },
    { prop: "caption", kind: "text", label: "Caption" },
    {
      prop: "width",
      kind: "select",
      label: "Width",
      options: [
        { value: "narrow", label: "Narrow" },
        { value: "standard", label: "Standard" },
        { value: "full", label: "Full width" },
      ],
    },
    ASPECT_CONTROL,
    ...sectionPresentationControls,
  ],
  render: ({ props, className, ctx, position }) => {
    const view = props.image ? ctx.data.image(props.image) : null;
    if (!view) return null;
    return (
      <SectionFrame type="image" className={className} props={props} width={props.width}>
        <figure className={cx("sv-figure", `sv-aspect-${props.aspect}`)}>
          <Image
            image={view}
            sizes={props.width === "full" ? "100vw" : "(max-width:1024px) 100vw, 72rem"}
            priority={position === 0}
          />
          {props.caption ? <figcaption>{props.caption}</figcaption> : null}
        </figure>
      </SectionFrame>
    );
  },
});

export const imageText = (kit: SchemaKit) =>
  defineComponent({
    type: "image-text",
    label: "Image with text",
    description: "An image beside a heading, text and a button.",
    icon: "layout-panel-left",
    category: "media",
    section: true,
    headingProp: "heading",
    defaultProps: {
      image: null,
      heading: "",
      body: null,
      action: null,
      imagePosition: "start",
      ...PRESENTATION_DEFAULTS,
    },
    propertySchema: z.strictObject({
      image: mediaRefSchema.nullable(),
      heading: plainText(200),
      body: optionalRichText,
      action: actionSchema(kit),
      imagePosition: z.enum(["start", "end"]),
      ...sectionPresentation,
    }),
    allowedChildren: "none",
    editorControls: [
      { prop: "image", kind: "media", label: "Image" },
      { prop: "heading", kind: "text", label: "Heading" },
      { prop: "body", kind: "richtext", label: "Text" },
      { prop: "action", kind: "action", label: "Button" },
      {
        prop: "imagePosition",
        kind: "select",
        label: "Image position",
        help: "On phones the image always comes first.",
        options: [
          { value: "start", label: "Left" },
          { value: "end", label: "Right" },
        ],
      },
      ...sectionPresentationControls,
    ],
    render: ({ props, className, ctx, node, position }) => {
      const view = props.image ? ctx.data.image(props.image) : null;
      const body = hasText(props.body);
      if (!view && !props.heading && !body) return null;
      return (
        <SectionFrame
          type="image-text"
          className={className}
          props={props}
          headingId={props.heading ? headingId(node.id) : undefined}
        >
          <div className={cx("sv-split", props.imagePosition === "end" && "sv-split-reverse")}>
            {view ? (
              <div className="sv-split-media">
                <Image image={view} sizes="(max-width:768px) 100vw, 50vw" />
              </div>
            ) : null}
            <div className="sv-split-body">
              {props.heading ? (
                <SectionHeading id={headingId(node.id)} position={position}>
                  {props.heading}
                </SectionHeading>
              ) : null}
              {body && props.body ? <RichText doc={props.body} className="sv-prose" /> : null}
              <Actions primary={props.action} ctx={ctx} />
            </div>
          </div>
        </SectionFrame>
      );
    },
  });

export const GALLERY_MAX_IMAGES = 24;

export const gallery = defineComponent({
  type: "gallery",
  label: "Gallery",
  description: "A grid of images.",
  icon: "images",
  category: "media",
  section: true,
  headingProp: "heading",
  defaultProps: { heading: "", images: [], columns: 3, aspect: "square", ...PRESENTATION_DEFAULTS },
  propertySchema: z.strictObject({
    heading: plainText(200),
    images: z
      .array(z.strictObject({ image: mediaRefSchema.nullable(), caption: plainText(200) }))
      .max(GALLERY_MAX_IMAGES),
    columns,
    aspect: z.enum(ASPECTS),
    ...sectionPresentation,
  }),
  allowedChildren: "none",
  cssVariables: columnsVariable,
  editorControls: [
    { prop: "heading", kind: "text", label: "Heading" },
    {
      prop: "images",
      kind: "items",
      label: "Images",
      maxItems: GALLERY_MAX_IMAGES,
      itemLabel: "caption",
      itemDefaults: { image: null, caption: "" },
      fields: [
        { prop: "image", kind: "media", label: "Image" },
        { prop: "caption", kind: "text", label: "Caption" },
      ],
    },
    COLUMNS_CONTROL,
    ASPECT_CONTROL,
    ...sectionPresentationControls,
  ],
  render: ({ props, className, ctx, node, position }) => {
    const images = props.images.flatMap((item, i) => {
      const view = item.image ? ctx.data.image(item.image) : null;
      return view ? [{ key: String(i), view, caption: item.caption }] : [];
    });
    if (images.length === 0) return null;
    return (
      <SectionFrame
        type="gallery"
        className={className}
        props={props}
        headingId={props.heading ? headingId(node.id) : undefined}
      >
        {props.heading ? (
          <SectionHeading id={headingId(node.id)} position={position}>
            {props.heading}
          </SectionHeading>
        ) : null}
        <ul className={cx("sv-block-grid", `sv-aspect-${props.aspect}`)}>
          {images.map((item) => (
            <li key={item.key}>
              <figure className="sv-figure">
                <Image
                  image={item.view}
                  sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"
                />
                {item.caption ? <figcaption>{item.caption}</figcaption> : null}
              </figure>
            </li>
          ))}
        </ul>
      </SectionFrame>
    );
  },
});

export const FEATURES_MAX_ITEMS = 12;

export const features = defineComponent({
  type: "features",
  label: "Features",
  description: "Short points in a grid, each with an optional image.",
  icon: "layout-grid",
  category: "marketing",
  section: true,
  headingProp: "heading",
  defaultProps: { heading: "", intro: "", items: [], columns: 3, ...PRESENTATION_DEFAULTS },
  propertySchema: z.strictObject({
    heading: plainText(200),
    intro: plainText(500),
    items: z
      .array(
        z.strictObject({
          title: plainText(120),
          text: plainText(600),
          image: mediaRefSchema.nullable(),
        }),
      )
      .max(FEATURES_MAX_ITEMS),
    columns,
    ...sectionPresentation,
  }),
  allowedChildren: "none",
  cssVariables: columnsVariable,
  editorControls: [
    { prop: "heading", kind: "text", label: "Heading" },
    { prop: "intro", kind: "textarea", label: "Introduction" },
    {
      prop: "items",
      kind: "items",
      label: "Points",
      maxItems: FEATURES_MAX_ITEMS,
      itemLabel: "title",
      itemDefaults: { title: "", text: "", image: null },
      fields: [
        { prop: "title", kind: "text", label: "Title" },
        { prop: "text", kind: "textarea", label: "Text" },
        { prop: "image", kind: "media", label: "Image" },
      ],
    },
    COLUMNS_CONTROL,
    ...sectionPresentationControls,
  ],
  render: ({ props, className, ctx, node, position }) => {
    const items = props.items.filter((item) => item.title.trim() !== "");
    if (items.length === 0) return null;
    return (
      <SectionFrame
        type="features"
        className={className}
        props={props}
        headingId={props.heading ? headingId(node.id) : undefined}
      >
        {props.heading ? (
          <SectionHeading id={headingId(node.id)} position={position}>
            {props.heading}
          </SectionHeading>
        ) : null}
        {props.intro ? <p className="sv-block-intro">{props.intro}</p> : null}
        <ul className="sv-block-grid sv-features">
          {items.map((item, i) => {
            const view = item.image ? ctx.data.image(item.image) : null;
            return (
              <li key={i} className="sv-feature">
                {view ? <Image image={view} sizes="(max-width:640px) 100vw, 33vw" /> : null}
                <h3>{item.title}</h3>
                {item.text ? <p>{item.text}</p> : null}
              </li>
            );
          })}
        </ul>
      </SectionFrame>
    );
  },
});

export const callToAction = (kit: SchemaKit) =>
  defineComponent({
    type: "call-to-action",
    label: "Call to action",
    description: "A short message with one or two buttons.",
    icon: "megaphone",
    category: "marketing",
    section: true,
    headingProp: "heading",
    defaultProps: {
      heading: "",
      text: "",
      action: null,
      secondaryAction: null,
      background: "surface",
      spacing: "standard",
    },
    propertySchema: z.strictObject({
      heading: plainText(200),
      text: plainText(600),
      action: actionSchema(kit),
      secondaryAction: actionSchema(kit),
      ...sectionPresentation,
    }),
    allowedChildren: "none",
    editorControls: [
      { prop: "heading", kind: "text", label: "Heading" },
      { prop: "text", kind: "textarea", label: "Text" },
      { prop: "action", kind: "action", label: "Button" },
      { prop: "secondaryAction", kind: "action", label: "Second button" },
      ...sectionPresentationControls,
    ],
    render: ({ props, className, ctx, node, position }) => {
      if (!props.heading && !props.text) return null;
      return (
        <SectionFrame
          type="cta"
          className={cx(className, "sv-align-center")}
          props={props}
          headingId={props.heading ? headingId(node.id) : undefined}
          width="narrow"
        >
          {props.heading ? (
            <SectionHeading id={headingId(node.id)} position={position}>
              {props.heading}
            </SectionHeading>
          ) : null}
          {props.text ? <p className="sv-block-intro">{props.text}</p> : null}
          <Actions primary={props.action} secondary={props.secondaryAction} ctx={ctx} />
        </SectionFrame>
      );
    },
  });

export const FAQ_MAX_ITEMS = 30;

export const faq = defineComponent({
  type: "faq",
  label: "Questions and answers",
  description: "Questions that open to show their answers.",
  icon: "circle-help",
  category: "text",
  section: true,
  headingProp: "heading",
  defaultProps: { heading: "", items: [], ...PRESENTATION_DEFAULTS },
  propertySchema: z.strictObject({
    heading: plainText(200),
    items: z
      .array(z.strictObject({ question: plainText(300), answer: plainText(3_000) }))
      .max(FAQ_MAX_ITEMS),
    ...sectionPresentation,
  }),
  allowedChildren: "none",
  editorControls: [
    { prop: "heading", kind: "text", label: "Heading" },
    {
      prop: "items",
      kind: "items",
      label: "Questions",
      maxItems: FAQ_MAX_ITEMS,
      itemLabel: "question",
      itemDefaults: { question: "", answer: "" },
      fields: [
        { prop: "question", kind: "text", label: "Question" },
        { prop: "answer", kind: "textarea", label: "Answer" },
      ],
    },
    ...sectionPresentationControls,
  ],
  render: ({ props, className, node, position }) => {
    const items = props.items.filter((item) => item.question.trim() !== "");
    if (items.length === 0) return null;
    return (
      <SectionFrame
        type="faq"
        className={className}
        props={props}
        headingId={props.heading ? headingId(node.id) : undefined}
        width="narrow"
      >
        {props.heading ? (
          <SectionHeading id={headingId(node.id)} position={position}>
            {props.heading}
          </SectionHeading>
        ) : null}
        <div className="sv-faq">
          {items.map((item, i) => (
            <details key={i}>
              <summary>{item.question}</summary>
              {item.answer
                .split(/\n\s*\n/)
                .filter((p) => p.trim() !== "")
                .map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
            </details>
          ))}
        </div>
      </SectionFrame>
    );
  },
});

export const TESTIMONIALS_MAX_ITEMS = 12;

export const testimonials = defineComponent({
  type: "testimonials",
  label: "Testimonials",
  description: "Quotes from your customers, in their words.",
  icon: "quote",
  category: "marketing",
  section: true,
  headingProp: "heading",
  defaultProps: { heading: "", items: [], columns: 3, ...PRESENTATION_DEFAULTS },
  propertySchema: z.strictObject({
    heading: plainText(200),
    items: z
      .array(
        z.strictObject({
          quote: plainText(1_000),
          name: plainText(100),
          detail: plainText(120),
        }),
      )
      .max(TESTIMONIALS_MAX_ITEMS),
    columns,
    ...sectionPresentation,
  }),
  allowedChildren: "none",
  cssVariables: columnsVariable,
  editorControls: [
    { prop: "heading", kind: "text", label: "Heading" },
    {
      prop: "items",
      kind: "items",
      label: "Testimonials",
      help: "Only publish quotes your customers gave you.",
      maxItems: TESTIMONIALS_MAX_ITEMS,
      itemLabel: "name",
      itemDefaults: { quote: "", name: "", detail: "" },
      fields: [
        { prop: "quote", kind: "textarea", label: "Quote" },
        { prop: "name", kind: "text", label: "Name" },
        { prop: "detail", kind: "text", label: "Detail (e.g. city or company)" },
      ],
    },
    COLUMNS_CONTROL,
    ...sectionPresentationControls,
  ],
  render: ({ props, className, node, position }) => {
    const items = props.items.filter((item) => item.quote.trim() !== "" && item.name.trim() !== "");
    if (items.length === 0) return null;
    return (
      <SectionFrame
        type="testimonials"
        className={className}
        props={props}
        headingId={props.heading ? headingId(node.id) : undefined}
      >
        {props.heading ? (
          <SectionHeading id={headingId(node.id)} position={position}>
            {props.heading}
          </SectionHeading>
        ) : null}
        <ul className="sv-block-grid sv-testimonials">
          {items.map((item, i) => (
            <li key={i}>
              <figure className="sv-testimonial">
                <blockquote>
                  <p>{item.quote}</p>
                </blockquote>
                <figcaption>
                  <span className="sv-testimonial-name">{item.name}</span>
                  {item.detail ? (
                    <span className="sv-testimonial-detail">{item.detail}</span>
                  ) : null}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </SectionFrame>
    );
  },
});

export const LOGOS_MAX_ITEMS = 24;

export const logoStrip = (kit: SchemaKit) =>
  defineComponent({
    type: "logo-strip",
    label: "Logos",
    description: "A row of logos, such as partners or press.",
    icon: "gallery-horizontal",
    category: "media",
    section: true,
    headingProp: "heading",
    defaultProps: { heading: "", logos: [], ...PRESENTATION_DEFAULTS },
    propertySchema: z.strictObject({
      heading: plainText(200),
      logos: z
        .array(
          z.strictObject({
            image: mediaRefSchema.nullable(),
            name: plainText(100),
            link: kit.link.nullable(),
          }),
        )
        .max(LOGOS_MAX_ITEMS),
      ...sectionPresentation,
    }),
    allowedChildren: "none",
    editorControls: [
      { prop: "heading", kind: "text", label: "Heading" },
      {
        prop: "logos",
        kind: "items",
        label: "Logos",
        help: "Only show organisations you actually work with.",
        maxItems: LOGOS_MAX_ITEMS,
        itemLabel: "name",
        itemDefaults: { image: null, name: "", link: null },
        fields: [
          { prop: "image", kind: "media", label: "Logo" },
          { prop: "name", kind: "text", label: "Name (read by screen readers)" },
          { prop: "link", kind: "link", label: "Link" },
        ],
      },
      ...sectionPresentationControls,
    ],
    render: ({ props, className, ctx, node, position }) => {
      const logos = props.logos.flatMap((logo, i) => {
        const view = logo.image ? ctx.data.image(logo.image) : null;
        // A logo is only shown with its name, which is its alternative text.
        if (!view || logo.name.trim() === "") return [];
        const href = logo.link ? ctx.data.link(logo.link) : null;
        return [{ key: String(i), view: { ...view, alt: logo.name }, href }];
      });
      if (logos.length === 0) return null;
      return (
        <SectionFrame
          type="logos"
          className={className}
          props={props}
          headingId={props.heading ? headingId(node.id) : undefined}
        >
          {props.heading ? (
            <SectionHeading
              id={headingId(node.id)}
              position={position}
              className="sv-block-heading-small"
            >
              {props.heading}
            </SectionHeading>
          ) : null}
          <ul className="sv-logos">
            {logos.map((logo) => (
              <li key={logo.key}>
                {logo.href ? (
                  <a href={logo.href}>
                    <Image image={logo.view} sizes="10rem" />
                  </a>
                ) : (
                  <Image image={logo.view} sizes="10rem" />
                )}
              </li>
            ))}
          </ul>
        </SectionFrame>
      );
    },
  });

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,63}$/i;
const PHONE_RE = /^\+?[0-9() -]{3,32}$/;

export const contactDetails = defineComponent({
  type: "contact-details",
  label: "Contact details",
  description: "How to reach you: email, phone, address and opening hours.",
  icon: "contact",
  category: "text",
  section: true,
  headingProp: "heading",
  defaultProps: {
    heading: "",
    intro: "",
    email: "",
    phone: "",
    address: "",
    hours: "",
    ...PRESENTATION_DEFAULTS,
  },
  propertySchema: z.strictObject({
    heading: plainText(200),
    intro: plainText(600),
    email: z
      .string()
      .max(254)
      .refine((v) => v === "" || EMAIL_RE.test(v), "Not an email address."),
    phone: z
      .string()
      .max(32)
      .refine((v) => v === "" || PHONE_RE.test(v), "Use digits, spaces, brackets, + and -."),
    address: plainText(500),
    hours: plainText(500),
    ...sectionPresentation,
  }),
  allowedChildren: "none",
  editorControls: [
    { prop: "heading", kind: "text", label: "Heading" },
    { prop: "intro", kind: "textarea", label: "Introduction" },
    { prop: "email", kind: "email", label: "Email" },
    { prop: "phone", kind: "text", label: "Phone" },
    { prop: "address", kind: "textarea", label: "Address" },
    { prop: "hours", kind: "textarea", label: "Opening hours" },
    ...sectionPresentationControls,
  ],
  render: ({ props, className, node, position }) => {
    const rows: { label: string; value: ReactNode }[] = [];
    if (props.email)
      rows.push({ label: "Email", value: <a href={`mailto:${props.email}`}>{props.email}</a> });
    if (props.phone)
      rows.push({
        label: "Phone",
        value: <a href={`tel:${props.phone.replace(/[^0-9+]/g, "")}`}>{props.phone}</a>,
      });
    if (props.address) rows.push({ label: "Address", value: <Lines text={props.address} /> });
    if (props.hours) rows.push({ label: "Opening hours", value: <Lines text={props.hours} /> });
    if (rows.length === 0 && !props.heading && !props.intro) return null;
    return (
      <SectionFrame
        type="contact"
        className={className}
        props={props}
        headingId={props.heading ? headingId(node.id) : undefined}
        width="narrow"
      >
        {props.heading ? (
          <SectionHeading id={headingId(node.id)} position={position}>
            {props.heading}
          </SectionHeading>
        ) : null}
        {props.intro ? <p className="sv-block-intro">{props.intro}</p> : null}
        {rows.length > 0 ? (
          <dl className="sv-contact">
            {rows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </SectionFrame>
    );
  },
});

function Lines({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  return (
    <>
      {lines.map((line, i) => (
        <span key={i} className="sv-line">
          {line}
        </span>
      ))}
    </>
  );
}

/** Registration order is the builder's picker order. */
export const SECTION_BLOCKS = [
  hero,
  textSection,
  imageSection,
  imageText,
  gallery,
  features,
  callToAction,
  faq,
  testimonials,
  logoStrip,
  contactDetails,
] as const;
