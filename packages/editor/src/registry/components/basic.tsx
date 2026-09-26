// Basic and media components: heading, text, rich-text, image, button,
// divider, spacer, and the hero used by the default home page.
import { z } from "zod";
import { linkTargetSchema, mediaRefSchema, plainText, richTextSchema } from "../../document/refs";
import { Image } from "../../render/parts";
import { RichText } from "../../render/rich-text";
import { cx, defineComponent } from "../define";

const HEADINGS = { 1: "h1", 2: "h2", 3: "h3", 4: "h4" } as const;

export const heading = defineComponent({
  type: "heading",
  label: "Heading",
  icon: "heading",
  category: "basic",
  defaultProps: { text: "Heading", level: 2 },
  propertySchema: z.strictObject({
    text: plainText(300).min(1),
    level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  }),
  allowedChildren: "none",
  editorControls: [
    { prop: "text", kind: "text", label: "Text" },
    {
      prop: "level",
      kind: "select",
      label: "Level",
      options: [1, 2, 3, 4].map((n) => ({ value: String(n), label: `Heading ${String(n)}` })),
    },
  ],
  render: ({ props, className }) => {
    const Tag = HEADINGS[props.level];
    return <Tag className={cx("sv-heading", className)}>{props.text}</Tag>;
  },
});

export const text = defineComponent({
  type: "text",
  label: "Text",
  icon: "text",
  category: "basic",
  defaultProps: { text: "" },
  propertySchema: z.strictObject({ text: plainText(5_000) }),
  allowedChildren: "none",
  editorControls: [{ prop: "text", kind: "textarea", label: "Text" }],
  render: ({ props, className }) => {
    const paragraphs = props.text.split(/\n\s*\n/).filter((p) => p.trim() !== "");
    if (paragraphs.length === 0) return null;
    return (
      <div className={cx("sv-text", className)}>
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    );
  },
});

export const richText = defineComponent({
  type: "rich-text",
  label: "Rich text",
  icon: "pilcrow",
  category: "basic",
  defaultProps: { doc: { type: "doc", content: [{ type: "paragraph" }] } },
  propertySchema: z.strictObject({ doc: richTextSchema }),
  allowedChildren: "none",
  editorControls: [{ prop: "doc", kind: "richtext", label: "Text" }],
  render: ({ props, className }) => (
    <RichText doc={props.doc} className={cx("sv-prose", className)} />
  ),
});

export const image = defineComponent({
  type: "image",
  label: "Image",
  icon: "image",
  category: "media",
  defaultProps: { image: null, link: null, caption: "" },
  propertySchema: z.strictObject({
    image: mediaRefSchema.nullable(),
    link: linkTargetSchema.nullable(),
    caption: plainText(300),
  }),
  allowedChildren: "none",
  editorControls: [
    { prop: "image", kind: "media", label: "Image" },
    { prop: "link", kind: "link", label: "Link" },
    { prop: "caption", kind: "text", label: "Caption" },
  ],
  render: ({ props, className, ctx }) => {
    const view = props.image ? ctx.data.image(props.image) : null;
    if (!view) return null;
    const img = <Image image={view} sizes="(max-width:1024px) 100vw, 72rem" />;
    const href = props.link ? ctx.data.link(props.link) : null;
    return (
      <figure className={cx("sv-figure", className)}>
        {href ? <a href={href}>{img}</a> : img}
        {props.caption ? <figcaption>{props.caption}</figcaption> : null}
      </figure>
    );
  },
});

export const button = defineComponent({
  type: "button",
  label: "Button",
  icon: "mouse-pointer",
  category: "basic",
  defaultProps: { label: "Shop now", link: { type: "search" }, style: "primary" },
  propertySchema: z.strictObject({
    label: plainText(80).min(1),
    link: linkTargetSchema,
    style: z.enum(["primary", "secondary"]),
  }),
  allowedChildren: "none",
  editorControls: [
    { prop: "label", kind: "text", label: "Label" },
    { prop: "link", kind: "link", label: "Link" },
    {
      prop: "style",
      kind: "select",
      label: "Style",
      options: [
        { value: "primary", label: "Primary" },
        { value: "secondary", label: "Secondary" },
      ],
    },
  ],
  render: ({ props, className, ctx }) => {
    // A link that no longer resolves in this store renders as nothing (07 §3).
    const href = ctx.data.link(props.link);
    if (!href) return null;
    return (
      <a
        className={cx("sv-button", props.style === "secondary" && "sv-button-secondary", className)}
        href={href}
      >
        {props.label}
      </a>
    );
  },
});

export const divider = defineComponent({
  type: "divider",
  label: "Divider",
  icon: "minus",
  category: "basic",
  defaultProps: {},
  propertySchema: z.strictObject({}),
  allowedChildren: "none",
  editorControls: [],
  render: ({ className }) => <hr className={cx("sv-divider", className)} />,
});

const SPACES = ["sm", "md", "lg", "xl", "2xl", "3xl"] as const;

export const spacer = defineComponent({
  type: "spacer",
  label: "Spacer",
  icon: "move-vertical",
  category: "basic",
  defaultProps: { size: "xl" },
  propertySchema: z.strictObject({ size: z.enum(SPACES) }),
  allowedChildren: "none",
  cssVariables: (props) => (props.size ? { "--sv-spacer": `var(--sv-space-${props.size})` } : {}),
  editorControls: [
    {
      prop: "size",
      kind: "select",
      label: "Size",
      options: SPACES.map((s) => ({ value: s, label: s })),
    },
  ],
  render: ({ className }) => <div className={cx("sv-spacer", className)} aria-hidden="true" />,
});

export const hero = defineComponent({
  type: "hero",
  label: "Hero",
  icon: "panel-top",
  category: "marketing",
  defaultProps: { heading: "", subheading: "", cta: null, image: null, align: "center" },
  propertySchema: z.strictObject({
    /** "" shows the store's name. */
    heading: plainText(200),
    subheading: plainText(500),
    cta: z.strictObject({ label: plainText(80).min(1), link: linkTargetSchema }).nullable(),
    image: mediaRefSchema.nullable(),
    align: z.enum(["left", "center"]),
  }),
  allowedChildren: "none",
  editorControls: [
    { prop: "heading", kind: "text", label: "Heading" },
    { prop: "subheading", kind: "textarea", label: "Subheading" },
    { prop: "cta", kind: "link", label: "Button" },
    { prop: "image", kind: "media", label: "Background image" },
    {
      prop: "align",
      kind: "select",
      label: "Alignment",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Centre" },
      ],
    },
  ],
  render: ({ props, className, ctx }) => {
    const view = props.image ? ctx.data.image(props.image) : null;
    const href = props.cta ? ctx.data.link(props.cta.link) : null;
    return (
      <section
        className={cx(
          "sv-hero",
          props.align === "center" && "sv-hero-center",
          view && "sv-hero-image",
          className,
        )}
      >
        {view ? <Image image={view} sizes="100vw" priority className="sv-hero-backdrop" /> : null}
        <div className="sv-container sv-hero-body">
          <h1 className="sv-hero-heading">{props.heading || ctx.store.name}</h1>
          {props.subheading ? <p className="sv-hero-sub">{props.subheading}</p> : null}
          {props.cta && href ? (
            <a className="sv-button" href={href}>
              {props.cta.label}
            </a>
          ) : null}
        </div>
      </section>
    );
  },
});
