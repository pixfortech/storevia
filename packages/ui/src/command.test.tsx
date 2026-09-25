import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { commandResults, CommandMenu, type CommandItem } from "./command";
import { CommandMenuPreview } from "./command-preview";
import {
  DropdownMenu,
  DropdownMenuPreview,
  DropdownMenuTrigger,
  dropdownMenuShortcut,
} from "./dropdown-menu";
import { Dialog, OverlayPreview } from "./overlays";

const items: CommandItem[] = [
  { id: "home", label: "Home", group: "Acme Store" },
  { id: "members", label: "Members", group: "Acme Ltd", keywords: ["team", "invite"] },
  { id: "products", label: "Products", group: "Acme Store" },
  { id: "store-2", label: "Second store", group: "Stores", hint: "Acme Ltd" },
];

describe("commandResults", () => {
  it("groups items in order of each group's first appearance", () => {
    const groups = commandResults(items, "");
    expect(groups.map((g) => g.name)).toEqual(["Acme Store", "Acme Ltd", "Stores"]);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["home", "products"]);
  });

  it("matches every word against label, hint, group and keywords", () => {
    expect(commandResults(items, "team").flatMap((g) => g.items.map((i) => i.id))).toEqual([
      "members",
    ]);
    expect(
      commandResults(items, "  second   acme ").flatMap((g) => g.items.map((i) => i.id)),
    ).toEqual(["store-2"]);
    expect(commandResults(items, "nothing-like-this")).toEqual([]);
  });
});

describe("SSR safety", () => {
  it("renders closed overlays on the server without touching the DOM", () => {
    const html = renderToStaticMarkup(
      <>
        <CommandMenu
          open={false}
          onOpenChange={() => undefined}
          items={items}
          onSelect={() => undefined}
        />
        <Dialog title="Remove member?" trigger={<button type="button">Remove</button>}>
          body
        </Dialog>
        <DropdownMenu>
          <DropdownMenuTrigger>Account</DropdownMenuTrigger>
        </DropdownMenu>
      </>,
    );
    expect(html).toContain("Remove");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).not.toContain("body");
  });
});

describe("CommandMenuPreview", () => {
  const withIcons: CommandItem[] = [
    { id: "home", label: "Home", group: "Acme Store", icon: <svg data-icon="" /> },
    { id: "website", label: "Website", group: "Acme Store", hint: "Soon" },
    { id: "members", label: "Members", group: "Acme Ltd" },
  ];

  it("renders the open menu statically and hidden from assistive tech", () => {
    const html = renderToStaticMarkup(<CommandMenuPreview items={withIcons} />);
    expect(html).toMatch(/^<div inert="" aria-hidden="true"/);
    expect(html).not.toContain('role="option"');
    expect(html).toContain("Search or jump to…");
    expect(html).toContain(">Acme Store<");
    expect(html).toContain("3 results");
  });

  it("shows a hint such as 'Soon' at every width (under the label on phones)", () => {
    const html = renderToStaticMarkup(<CommandMenuPreview items={withIcons} />);
    expect(html).toContain(">Soon</span>");
    expect(html).not.toMatch(/hidden[^"]*sm:inline/);
    expect(html).toContain("flex-col sm:flex-row");
  });

  it("filters by the query and highlights the chosen row", () => {
    const html = renderToStaticMarkup(
      <CommandMenuPreview items={withIcons} query="mem" activeId="members" />,
    );
    expect(html).not.toContain(">Home<");
    expect(html).toContain("1 result");
    expect(html).toMatch(/bg-subtle[^>]*>(?:(?!<\/div>).)*Members/);
    const empty = renderToStaticMarkup(<CommandMenuPreview items={withIcons} query="zzz" />);
    expect(empty).toContain("No results for “zzz”");
  });

  it("draws rows at 40 px (44 on touch) with a bare 16 px icon", () => {
    const html = renderToStaticMarkup(<CommandMenuPreview items={withIcons} />);
    expect(html).toContain("min-h-10");
    expect(html).toContain("pointer-coarse:min-h-11");
    expect(html).toContain("size-4");
    expect(html).not.toContain("size-7");
  });
});

describe("OverlayPreview and DropdownMenuPreview", () => {
  it("renders a dialog's panel statically, docked like the live one", () => {
    const html = renderToStaticMarkup(
      <OverlayPreview title="Invite a teammate" description="A link" footer={<b>Send</b>}>
        body
      </OverlayPreview>,
    );
    expect(html).toMatch(/^<div inert="" aria-hidden="true" data-placement="center"/);
    expect(html).toContain("rounded-panel");
    expect(html).toContain("shadow-window");
    expect(html).toContain("Invite a teammate");
    expect(html).toContain("<b>Send</b>");
    expect(html).not.toContain('role="dialog"');
    const sheet = renderToStaticMarkup(<OverlayPreview side="bottom" title="Filters" />);
    expect(sheet).toContain("rounded-t-panel");
    expect(sheet).toContain("mt-auto");
    expect(sheet).toContain("w-9"); // grab handle
    expect(renderToStaticMarkup(<OverlayPreview side="right" title="Detail" />)).toContain(
      "ml-auto h-full",
    );
  });

  it("renders a menu statically with the live item states", () => {
    const html = renderToStaticMarkup(
      <DropdownMenuPreview
        items={[
          { type: "label", label: "Store" },
          { label: "Duplicate", shortcut: "⌘D", highlighted: true },
          { label: "Connect a domain", disabled: true },
          { type: "separator" },
          { type: "checkbox", label: "Compact rows", checked: true },
          { label: "Delete store", tone: "danger" },
        ]}
      />,
    );
    expect(html).toMatch(/^<div inert="" aria-hidden="true"/);
    expect(html).toContain("min-w-[220px]");
    expect(html).toMatch(/data-highlighted=""[^>]*>(?:(?!<\/div>).)*Duplicate/);
    expect(html).toContain("data-disabled");
    expect(html).toContain("lucide-check");
    expect(html).toContain("text-danger-700");
    expect(html).toContain("pointer-coarse:min-h-11");
    expect(html).not.toContain('role="menuitem"');
  });
});

describe("dropdownMenuShortcut", () => {
  it("keeps Mac glyphs on Apple platforms and names the keys", () => {
    expect(dropdownMenuShortcut("⌘D", true)).toEqual({ text: "⌘D", keys: "Meta+D" });
    expect(dropdownMenuShortcut("⇧⌘P", true)).toEqual({ text: "⇧⌘P", keys: "Shift+Meta+P" });
    expect(dropdownMenuShortcut("E", true)).toEqual({ text: "E", keys: "E" });
  });

  it("reads Ctrl, Alt and Shift elsewhere, in the usual order", () => {
    expect(dropdownMenuShortcut("⌘D", false)).toEqual({ text: "Ctrl+D", keys: "Control+D" });
    expect(dropdownMenuShortcut("⇧⌘P", false)).toEqual({
      text: "Ctrl+Shift+P",
      keys: "Control+Shift+P",
    });
    expect(dropdownMenuShortcut("⌥⌫", false)).toEqual({ text: "Alt+⌫", keys: "Alt+Backspace" });
    expect(dropdownMenuShortcut("e", false)).toEqual({ text: "e", keys: "E" });
  });

  it("keeps shortcuts that are already spelled out", () => {
    expect(dropdownMenuShortcut("Ctrl+K", false)).toEqual({ text: "Ctrl+K", keys: "Control+K" });
    expect(dropdownMenuShortcut("Shift+Esc", true)).toEqual({
      text: "Shift+Esc",
      keys: "Shift+Escape",
    });
  });
});
