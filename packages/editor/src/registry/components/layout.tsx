// Layout components: section, container, columns, column.
import { z } from "zod";
import { plainText } from "../../document/refs";
import { cx, defineComponent } from "../define";

export const section = defineComponent({
  type: "section",
  label: "Section",
  icon: "rows",
  category: "layout",
  defaultProps: { label: "", width: "contained" },
  propertySchema: z.strictObject({
    /** Accessible name for the landmark ("" = none). */
    label: plainText(100),
    width: z.enum(["contained", "full"]),
  }),
  allowedChildren: "any",
  editorControls: [
    { prop: "label", kind: "text", label: "Accessible name" },
    {
      prop: "width",
      kind: "select",
      label: "Width",
      options: [
        { value: "contained", label: "Contained" },
        { value: "full", label: "Full width" },
      ],
    },
  ],
  render: ({ props, className, children }) => (
    <section className={cx("sv-section", className)} aria-label={props.label || undefined}>
      {props.width === "contained" ? <div className="sv-container">{children}</div> : children}
    </section>
  ),
});

export const container = defineComponent({
  type: "container",
  label: "Container",
  icon: "square",
  category: "layout",
  defaultProps: {},
  propertySchema: z.strictObject({}),
  allowedChildren: "any",
  editorControls: [],
  render: ({ className, children }) => (
    <div className={cx("sv-container", className)}>{children}</div>
  ),
});

export const columns = defineComponent({
  type: "columns",
  label: "Columns",
  icon: "columns",
  category: "layout",
  defaultProps: { columns: 2, stackOnMobile: true },
  propertySchema: z.strictObject({
    columns: z.number().int().min(1).max(4),
    stackOnMobile: z.boolean(),
  }),
  allowedChildren: ["column"],
  cssVariables: (props) => (props.columns ? { "--sv-columns": String(props.columns) } : {}),
  editorControls: [
    { prop: "columns", kind: "number", label: "Columns" },
    { prop: "stackOnMobile", kind: "toggle", label: "Stack on phones" },
  ],
  render: ({ props, className, children }) => (
    <div className={cx("sv-columns", props.stackOnMobile && "sv-columns-stack", className)}>
      {children}
    </div>
  ),
});

export const column = defineComponent({
  type: "column",
  label: "Column",
  icon: "column",
  category: "layout",
  defaultProps: {},
  propertySchema: z.strictObject({}),
  allowedChildren: "any",
  allowedParents: ["columns"],
  editorControls: [],
  render: ({ className, children }) => <div className={cx("sv-column", className)}>{children}</div>,
});
