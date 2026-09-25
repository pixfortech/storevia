"use client";

import dynamic from "next/dynamic";

/**
 * The rich-text editor, loaded only when a form that needs it renders, so
 * the editor's code never ships with the list pages.
 */
export const LazyRichTextEditor = dynamic(
  () => import("./rich-text-editor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div aria-hidden="true">
        <div className="mb-1.5 h-5 w-24 rounded-xs bg-subtle" />
        <div className="h-52 rounded-control border border-line-control bg-surface" />
      </div>
    ),
  },
);
