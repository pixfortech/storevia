import { describe, expect, it } from "vitest";
import {
  focusHasMoved,
  focusOrigin,
  focusPanel,
  keepFocusInNewerModal,
  openingOrigin,
  registerControlledLayer,
  registerLayerReturn,
  restoreFocus,
} from "./overlays-focus";

/*
 * A tiny fake DOM: just what the guards touch (closest with attribute
 * selectors, contains, getAttribute, focus, isConnected, activeElement,
 * getElementById, querySelector). Enough to replay the races the gallery hit
 * in a browser.
 */
class FakeElement {
  focusCount = 0;
  removed = false;
  constructor(
    readonly doc: FakeDocument,
    readonly attrs: Record<string, string> = {},
    readonly parent: FakeElement | null = null,
  ) {}
  get isConnected(): boolean {
    return !this.removed && (this.parent ? this.parent.isConnected : true);
  }
  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }
  setAttribute(name: string, value: string) {
    this.attrs[name] = value;
  }
  removeAttribute(name: string) {
    Reflect.deleteProperty(this.attrs, name);
  }
  matches(selector: string): boolean {
    return [...selector.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)].every(([, name = "", value]) =>
      value === undefined ? name in this.attrs : this.attrs[name] === value,
    );
  }
  closest(selector: string): FakeElement | null {
    if (this.matches(selector)) return this;
    return this.parent ? this.parent.closest(selector) : null;
  }
  contains(other: FakeElement | null): boolean {
    for (let el = other; el; el = el.parent) if (el === this) return true;
    return false;
  }
  focus() {
    this.focusCount++;
    this.doc.activeElement = this;
  }
}

class FakeDocument {
  body = new FakeElement(this);
  activeElement: FakeElement = this.body;
  readonly byId = new Map<string, FakeElement>();
  readonly all: FakeElement[] = [];
  el(attrs: Record<string, string> = {}, parent: FakeElement | null = this.body) {
    const element = new FakeElement(this, attrs, parent);
    if (attrs["id"]) this.byId.set(attrs["id"], element);
    this.all.push(element);
    return element;
  }
  getElementById(id: string) {
    return this.byId.get(id) ?? null;
  }
  querySelector(selector: string) {
    return this.all.find((el) => el.isConnected && el.matches(selector)) ?? null;
  }
}

const asDoc = (doc: FakeDocument) => doc as unknown as Document;
const asEl = (el: FakeElement) => el as unknown as Element;
const asHtml = (el: FakeElement) => el as unknown as HTMLElement;

function fakeEvent(currentTarget: FakeElement | null = null) {
  return {
    currentTarget,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}
const asEvent = (event: ReturnType<typeof fakeEvent>) => event as unknown as Event;

/** A page with a menu trigger and its open menu (Radix labels the menu by its trigger). */
function pageWithMenu() {
  const doc = new FakeDocument();
  const trigger = doc.el({ id: "trigger" });
  const menu = doc.el({ "data-sv-layer": "", role: "menu", "aria-labelledby": "trigger" });
  const item = doc.el({ role: "menuitem" }, menu);
  return { doc, trigger, menu, item };
}

describe("focusOrigin", () => {
  it("returns the element while it can take focus", () => {
    const { doc, item } = pageWithMenu();
    expect(focusOrigin(asEl(item), asDoc(doc))()).toBe(item);
  });

  it("falls back to the menu's trigger once the item's menu is closing or gone", () => {
    const { doc, trigger, menu, item } = pageWithMenu();
    const resolve = focusOrigin(asEl(item), asDoc(doc));
    menu.setAttribute("data-state", "closed"); // exit animation
    expect(resolve()).toBe(trigger);
    menu.removed = true; // unmounted
    expect(resolve()).toBe(trigger);
  });

  it("uses a dialog's registered return target, recursively", () => {
    const doc = new FakeDocument();
    const opener = doc.el({ id: "opener" });
    const dialog = doc.el({ "data-sv-layer": "", "data-sv-modal": "", role: "alertdialog" });
    registerLayerReturn(asEl(dialog), focusOrigin(asEl(opener), asDoc(doc)));
    // A menu inside the dialog, opened from a trigger inside the dialog.
    const trigger = doc.el({ id: "menu-trigger" }, dialog);
    const menu = doc.el({ "data-sv-layer": "", role: "menu", "aria-labelledby": "menu-trigger" });
    const item = doc.el({}, menu);
    const resolve = focusOrigin(asEl(item), asDoc(doc));
    menu.removed = true;
    expect(resolve()).toBe(trigger);
    dialog.setAttribute("data-state", "closed");
    expect(resolve()).toBe(opener);
  });

  it("ignores <body> and missing elements", () => {
    const doc = new FakeDocument();
    expect(focusOrigin(asEl(doc.body), asDoc(doc))()).toBeNull();
    expect(focusOrigin(null, asDoc(doc))()).toBeNull();
  });

  it("never treats a dialog's title as its trigger (only menus are labelled by one)", () => {
    const doc = new FakeDocument();
    doc.el({ id: "title" });
    const dialog = doc.el({ "data-sv-layer": "", role: "dialog", "aria-labelledby": "title" });
    const button = doc.el({}, dialog);
    const resolve = focusOrigin(asEl(button), asDoc(doc));
    dialog.removed = true;
    expect(resolve()).toBeNull();
  });
});

describe("the ⌘K-after-Esc race (regression)", () => {
  it("returns focus to the menu trigger when the palette opened during the menu's exit", () => {
    const { doc, trigger, menu, item } = pageWithMenu();
    item.focus();
    // Esc: the menu starts its 120 ms exit with focus still on the item…
    menu.setAttribute("data-state", "closed");
    // …and ⌘K opens the palette, which records where focus was.
    const palette = doc.el({ "data-sv-layer": "", "data-sv-modal": "", role: "dialog" });
    const returnTo = openingOrigin(asEl(palette), null, asDoc(doc));
    const input = doc.el({}, palette);
    input.focus();
    // The menu finishes closing: its restore is skipped (focus is in a newer modal).
    const menuClose = fakeEvent(menu);
    keepFocusInNewerModal(asEvent(menuClose), asDoc(doc));
    expect(menuClose.defaultPrevented).toBe(true);
    menu.removed = true;
    // Esc on the palette: it unmounts, focus falls to <body>, then the guard runs.
    palette.removed = true;
    doc.activeElement = doc.body;
    const paletteClose = fakeEvent(palette);
    restoreFocus(asEvent(paletteClose), returnTo, asDoc(doc));
    expect(paletteClose.defaultPrevented).toBe(true);
    expect(doc.activeElement).toBe(trigger);
  });

  it("returns focus to a popover's trigger when the palette opened during the popover's exit", () => {
    const doc = new FakeDocument();
    const trigger = doc.el({ "aria-controls": "pop", "aria-expanded": "true" });
    const popover = doc.el({ "data-sv-layer": "", role: "dialog", id: "pop" });
    // While open, the popover records the trigger that controls it.
    registerControlledLayer(asEl(popover), asDoc(doc));
    const copy = doc.el({}, popover);
    copy.focus();
    // Esc: Radix drops the trigger's aria-controls at once, and the popover
    // starts its exit with focus still inside it…
    trigger.removeAttribute("aria-controls");
    popover.setAttribute("data-state", "closed");
    // …and ⌘K opens the palette, which records where focus was.
    const palette = doc.el({ "data-sv-layer": "", "data-sv-modal": "", role: "dialog" });
    const returnTo = openingOrigin(asEl(palette), null, asDoc(doc));
    doc.el({}, palette).focus();
    popover.removed = true;
    palette.removed = true;
    doc.activeElement = doc.body;
    restoreFocus(asEvent(fakeEvent(palette)), returnTo, asDoc(doc));
    expect(doc.activeElement).toBe(trigger);
  });

  it("returns focus to a dialog's opener when the palette opened during the dialog's exit", () => {
    const doc = new FakeDocument();
    const opener = doc.el({ id: "remove" });
    const dialog = doc.el({ "data-sv-layer": "", "data-sv-modal": "", role: "alertdialog" });
    registerLayerReturn(asEl(dialog), openingOrigin(asEl(dialog), asEl(opener), asDoc(doc)));
    const cancel = doc.el({}, dialog);
    cancel.focus();
    dialog.setAttribute("data-state", "closed");
    const palette = doc.el({ "data-sv-layer": "", "data-sv-modal": "" });
    const returnTo = openingOrigin(asEl(palette), null, asDoc(doc));
    doc.el({}, palette).focus();
    // The dialog finishes closing while the palette has focus: nothing moves.
    const dialogClose = fakeEvent(dialog);
    restoreFocus(asEvent(dialogClose), () => asHtml(opener), asDoc(doc));
    expect(opener.focusCount).toBe(0);
    dialog.removed = true;
    palette.removed = true;
    doc.activeElement = doc.body;
    restoreFocus(asEvent(fakeEvent(palette)), returnTo, asDoc(doc));
    expect(doc.activeElement).toBe(opener);
  });
});

describe("guards", () => {
  it("restoreFocus always stops Radix's own restore, and leaves moved focus alone", () => {
    const doc = new FakeDocument();
    const target = doc.el();
    const elsewhere = doc.el();
    elsewhere.focus();
    const event = fakeEvent();
    restoreFocus(asEvent(event), () => asHtml(target), asDoc(doc));
    expect(event.defaultPrevented).toBe(true);
    expect(doc.activeElement).toBe(elsewhere);
    expect(focusHasMoved(asDoc(doc))).toBe(true);
    doc.activeElement = doc.body;
    expect(focusHasMoved(asDoc(doc))).toBe(false);
    restoreFocus(asEvent(fakeEvent()), () => asHtml(target), asDoc(doc));
    expect(doc.activeElement).toBe(target);
  });

  it("keepFocusInNewerModal lets a menu restore focus unless a newer modal holds it", () => {
    const { doc, menu } = pageWithMenu();
    // Focus on the page (menu closed normally): Radix restores to the trigger.
    const plain = fakeEvent(menu);
    keepFocusInNewerModal(asEvent(plain), asDoc(doc));
    expect(plain.defaultPrevented).toBe(false);
    // Focus inside a dialog that the menu item opened: skip the restore.
    const dialog = doc.el({ "data-sv-modal": "" });
    doc.el({}, dialog).focus();
    const newer = fakeEvent(menu);
    keepFocusInNewerModal(asEvent(newer), asDoc(doc));
    expect(newer.defaultPrevented).toBe(true);
  });

  it("keepFocusInNewerModal allows the restore when the menu lives in that modal", () => {
    const doc = new FakeDocument();
    const drawer = doc.el({ "data-sv-modal": "" });
    doc.el({ id: "in-drawer" }, drawer);
    const menu = doc.el({ "data-sv-layer": "", role: "menu", "aria-labelledby": "in-drawer" });
    doc.el({}, drawer).focus();
    const event = fakeEvent(menu);
    keepFocusInNewerModal(asEvent(event), asDoc(doc));
    expect(event.defaultPrevented).toBe(false);
  });

  it("focusPanel focuses the panel instead of its first control", () => {
    const doc = new FakeDocument();
    const panel = doc.el({ "data-sv-layer": "" });
    const event = fakeEvent(panel);
    focusPanel(asEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(doc.activeElement).toBe(panel);
  });

  it("openingOrigin prefers the trigger and ignores focus already inside the new layer", () => {
    const doc = new FakeDocument();
    const trigger = doc.el();
    const layer = doc.el({ "data-sv-layer": "" });
    expect(openingOrigin(asEl(layer), asEl(trigger), asDoc(doc))()).toBe(trigger);
    doc.el({}, layer).focus(); // an autofocused field
    expect(openingOrigin(asEl(layer), null, asDoc(doc))()).toBeNull();
  });
});
