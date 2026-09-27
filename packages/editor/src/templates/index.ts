// The Site Engine's own documents (ADR-0028 §6, ADR-0030 §9): the page shown
// for an unknown path, and the starter content of a new site's home page and
// of a new content page. Stored in code and rendered by the same registry.
// They contain no invented content: the home hero shows the site's own name,
// and a new content page starts with its title only.
import type { PageDocument } from "../document/types";

export const NOT_FOUND_DOCUMENT: PageDocument = {
  schemaVersion: 1,
  root: [
    {
      id: "dfNotFound01",
      type: "section",
      props: { label: "", width: "contained" },
      styles: { paddingBlock: { $token: "space.3xl" }, textAlign: "center" },
      children: [
        {
          id: "dfNotFoundHd",
          type: "heading",
          props: { text: "Page not found", level: 1 },
          styles: {},
        },
        {
          id: "dfNotFoundTx",
          type: "text",
          props: { text: "The page you were looking for doesn't exist or is no longer available." },
          styles: { color: { $token: "color.muted" } },
        },
        {
          id: "dfNotFoundBt",
          type: "button",
          props: { label: "Back to the home page", link: { type: "home" }, style: "primary" },
          styles: {},
        },
      ],
    },
  ],
};

/** A home page for a site without a catalogue: its name, nothing more. */
export const SITE_HOME_DOCUMENT: PageDocument = {
  schemaVersion: 1,
  root: [
    {
      id: "dfHomeHero01",
      type: "hero",
      props: {
        heading: "",
        subheading: "",
        cta: null,
        secondaryCta: null,
        image: null,
        align: "center",
        height: "standard",
      },
      styles: {},
    },
  ],
};

/** A new content page: a text section headed with the page's title. */
export function contentPageDocument(title: string): PageDocument {
  return {
    schemaVersion: 1,
    root: [
      {
        id: "newPageText1",
        type: "text-section",
        props: {
          heading: title.slice(0, 200),
          body: null,
          align: "left",
          width: "narrow",
          background: "default",
          spacing: "standard",
        },
        styles: {},
      },
    ],
  };
}
