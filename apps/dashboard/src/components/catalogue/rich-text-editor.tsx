"use client";

import { IconButton } from "@storevia/ui/button";
import { cn } from "@storevia/ui/cn";
import { Input } from "@storevia/ui/form";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@storevia/ui/popover";
import { Button } from "@storevia/ui/button";
import { EditorContent, useEditor, useEditorState, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useId, useState } from "react";

// A rich-text field limited to what the server accepts (ADR-0027 §10):
// paragraphs, headings 2-4, bold, italic, strike, code, links (http, https,
// mailto), lists, quotes, breaks and rules. The browser only ever produces
// the document; the server validates it against its allow-list and renders
// the HTML itself, so nothing typed or pasted here reaches a page unchecked.

export interface RichTextEditorProps {
  /** Form field that carries the document as JSON. */
  name: string;
  /** The form the field belongs to, when it sits outside it (the `form` attribute). */
  form?: string | undefined;
  label: string;
  defaultValue: JSONContent | null;
  onChange?: (doc: JSONContent) => void;
  error?: string | undefined;
  disabled?: boolean;
  placeholder?: string;
}

function ToolbarButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean | undefined;
  disabled?: boolean | undefined;
  onClick: () => void;
}) {
  return (
    <IconButton
      type="button"
      size="sm"
      variant="ghost"
      icon={icon}
      aria-label={label}
      aria-pressed={active ?? undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(active && "bg-brand-50 text-brand-700 hover:bg-brand-50")}
    />
  );
}

export function RichTextEditor({
  name,
  form,
  label,
  defaultValue,
  onChange,
  error,
  disabled = false,
  placeholder = "Describe the product: what it is, what it's made of, how to care for it.",
}: RichTextEditorProps) {
  const id = useId();
  const [json, setJson] = useState(() =>
    JSON.stringify(defaultValue ?? { type: "doc", content: [] }),
  );
  const [link, setLink] = useState("");
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        codeBlock: false,
        underline: false,
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ["http", "https", "mailto"],
          isAllowedUri: (url) => /^(https?:|mailto:)/i.test(url.trim()),
          HTMLAttributes: { rel: "noopener noreferrer nofollow ugc", target: null },
        },
      }),
    ],
    content: defaultValue ?? "",
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        ...(error ? { "aria-invalid": "true", "aria-describedby": `${id}-error` } : {}),
        class: "min-h-40 px-4 py-3 outline-none",
      },
    },
    onUpdate: ({ editor: current }) => {
      const doc = current.getJSON();
      setJson(JSON.stringify(doc));
      onChange?.(doc);
    },
  });
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            strike: e.isActive("strike"),
            code: e.isActive("code"),
            h2: e.isActive("heading", { level: 2 }),
            h3: e.isActive("heading", { level: 3 }),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
            link: e.isActive("link"),
            canUndo: e.can().undo(),
            canRedo: e.can().redo(),
            empty: e.isEmpty,
          }
        : null,
  });
  const chain = () => editor?.chain().focus();
  const off = disabled || !editor;

  return (
    <div className="min-w-0">
      <span className="mb-1.5 block text-label font-medium text-ink" id={`${id}-label`}>
        {label}
      </span>
      <div
        className={cn(
          "rounded-control border bg-surface shadow-xs transition-colors",
          "focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-100",
          error ? "border-danger-500" : "border-line-control",
          disabled && "bg-subtle opacity-70",
        )}
      >
        <div
          role="toolbar"
          aria-label={`${label} formatting`}
          aria-controls={id}
          className="flex flex-wrap items-center gap-0.5 border-b border-line px-1.5 py-1"
        >
          <ToolbarButton
            icon={Bold}
            label="Bold"
            active={state?.bold}
            disabled={off}
            onClick={() => chain()?.toggleBold().run()}
          />
          <ToolbarButton
            icon={Italic}
            label="Italic"
            active={state?.italic}
            disabled={off}
            onClick={() => chain()?.toggleItalic().run()}
          />
          <ToolbarButton
            icon={Strikethrough}
            label="Strikethrough"
            active={state?.strike}
            disabled={off}
            onClick={() => chain()?.toggleStrike().run()}
          />
          <ToolbarButton
            icon={Code}
            label="Code"
            active={state?.code}
            disabled={off}
            onClick={() => chain()?.toggleCode().run()}
          />
          <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
          <ToolbarButton
            icon={Heading2}
            label="Heading"
            active={state?.h2}
            disabled={off}
            onClick={() => chain()?.toggleHeading({ level: 2 }).run()}
          />
          <ToolbarButton
            icon={Heading3}
            label="Subheading"
            active={state?.h3}
            disabled={off}
            onClick={() => chain()?.toggleHeading({ level: 3 }).run()}
          />
          <ToolbarButton
            icon={List}
            label="Bulleted list"
            active={state?.bullet}
            disabled={off}
            onClick={() => chain()?.toggleBulletList().run()}
          />
          <ToolbarButton
            icon={ListOrdered}
            label="Numbered list"
            active={state?.ordered}
            disabled={off}
            onClick={() => chain()?.toggleOrderedList().run()}
          />
          <ToolbarButton
            icon={Quote}
            label="Quote"
            active={state?.quote}
            disabled={off}
            onClick={() => chain()?.toggleBlockquote().run()}
          />
          <ToolbarButton
            icon={Minus}
            label="Divider"
            disabled={off}
            onClick={() => chain()?.setHorizontalRule().run()}
          />
          <Popover
            onOpenChange={(open) => {
              if (open)
                setLink((editor?.getAttributes("link")["href"] as string | undefined) ?? "");
            }}
          >
            <PopoverTrigger asChild>
              <IconButton
                type="button"
                size="sm"
                variant="ghost"
                icon={Link2}
                aria-label="Link"
                aria-pressed={state?.link ?? undefined}
                disabled={off}
                className={cn(state?.link && "bg-brand-50 text-brand-700 hover:bg-brand-50")}
              />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80">
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const href = link.trim();
                  if (!href) chain()?.extendMarkRange("link").unsetLink().run();
                  else if (/^(https?:\/\/|mailto:)/i.test(href)) {
                    chain()?.extendMarkRange("link").setLink({ href }).run();
                  }
                }}
              >
                <Input
                  aria-label="Link address"
                  placeholder="https://"
                  value={link}
                  onChange={(event) => {
                    setLink(event.currentTarget.value);
                  }}
                />
                <p className="text-caption text-ink-faint">
                  Web (https://) and email (mailto:) links only.
                </p>
                <div className="flex justify-end gap-2">
                  {state?.link ? (
                    <PopoverClose asChild>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => chain()?.extendMarkRange("link").unsetLink().run()}
                      >
                        Remove
                      </Button>
                    </PopoverClose>
                  ) : null}
                  <PopoverClose asChild>
                    <Button type="submit" size="sm">
                      Apply
                    </Button>
                  </PopoverClose>
                </div>
              </form>
            </PopoverContent>
          </Popover>
          <span className="ml-auto flex items-center gap-0.5">
            <ToolbarButton
              icon={Undo2}
              label="Undo"
              disabled={off || !state?.canUndo}
              onClick={() => chain()?.undo().run()}
            />
            <ToolbarButton
              icon={Redo2}
              label="Redo"
              disabled={off || !state?.canRedo}
              onClick={() => chain()?.redo().run()}
            />
          </span>
        </div>
        <div className="relative">
          {state?.empty ? (
            <p
              aria-hidden="true"
              className="pointer-events-none absolute top-3 right-4 left-4 text-body text-ink-faint"
            >
              {placeholder}
            </p>
          ) : null}
          <EditorContent
            editor={editor}
            className="rich-text text-body text-ink [&_.ProseMirror]:max-h-[32rem] [&_.ProseMirror]:overflow-y-auto"
          />
        </div>
        {!editor ? <div className="min-h-40" aria-hidden="true" /> : null}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-body-sm text-danger-700">
          {error}
        </p>
      ) : null}
      <input type="hidden" name={name} value={json} form={form} />
    </div>
  );
}
