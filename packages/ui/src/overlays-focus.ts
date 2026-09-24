// Focus return for overlays (overlays.tsx, command.tsx). Internal: not
// exported from the package. Plain DOM functions, so they are unit-tested
// with small fakes (overlays-focus.test.ts).
//
// Every overlay's content carries data-sv-layer (and data-sv-modal when it
// is modal); Radix sets data-state="closed" on it for the length of its exit
// animation. Two races follow from that animation:
//
// - A newer modal opens while an older layer is still closing (⌘K straight
//   after Esc, or a menu item that opens a dialog). The older layer must not
//   pull focus back out of the newer one when it finally unmounts.
// - The newer layer records where focus was when it opened, but that element
//   sits in the closing layer and is about to be removed. When the newer
//   layer closes, focus goes to wherever the closing layer would have sent it
//   (its trigger), not to <body>.

/** Where focus should go when a layer closes. Resolved at close time. */
export type FocusResolver = () => HTMLElement | null;

const LAYER = "[data-sv-layer]";
const CLOSING_LAYER = '[data-sv-layer][data-state="closed"]';
const MODAL = "[data-sv-modal]";

/** Return targets of open dialogs and command menus, keyed by their content element. */
const returnTargets = new WeakMap<Element, FocusResolver>();

/** Records where focus goes when `layer` closes, so layers opened on top of it can defer to it. */
export function registerLayerReturn(layer: Element, resolve: FocusResolver): void {
  returnTargets.set(layer, resolve);
}

function asFocusable(node: Element | null | undefined, doc: Document): HTMLElement | null {
  if (!node || node === doc.body) return null;
  return typeof (node as HTMLElement).focus === "function" ? (node as HTMLElement) : null;
}

/** Still on the page, and not inside a layer that is closing. */
function usable(element: HTMLElement): boolean {
  return element.isConnected && !element.closest(CLOSING_LAYER);
}

/**
 * A resolver that returns `element` while it can take focus, and otherwise
 * wherever the layer containing it returns focus to (recursively, so a menu
 * inside a closing dialog falls back to the dialog's trigger).
 */
export function focusOrigin(
  element: Element | null | undefined,
  doc: Document = document,
): FocusResolver {
  const target = asFocusable(element, doc);
  if (!target) return () => null;
  const layer = target.closest(LAYER);
  const outer = layer ? layerReturn(layer, doc) : null;
  return () => (usable(target) ? target : (outer?.() ?? null));
}

function layerReturn(layer: Element, doc: Document): FocusResolver {
  const registered = returnTargets.get(layer);
  if (registered) return registered;
  // Radix menus are labelled by their trigger, and return focus to it.
  if (layer.getAttribute("role") === "menu") {
    const triggerId = layer.getAttribute("aria-labelledby");
    return focusOrigin(triggerId ? doc.getElementById(triggerId) : null, doc);
  }
  return () => null;
}

/**
 * Popovers on open: record the trigger that controls them. Radix removes the
 * trigger's aria-controls as soon as the popover starts closing, so it has
 * to be looked up while the popover is open.
 */
export function registerControlledLayer(layer: Element, doc: Document = document): void {
  const id = layer.getAttribute("id");
  const trigger = id
    ? doc.querySelector(`[aria-controls="${id.replace(/["\\]/g, "\\$&")}"]`)
    : null;
  registerLayerReturn(layer, openingOrigin(layer, trigger, doc));
}

/** True when focus has already moved on (anywhere but <body>) as a layer finishes closing. */
export function focusHasMoved(doc: Document = document): boolean {
  return asFocusable(doc.activeElement, doc) !== null;
}

/**
 * Dialogs, drawers and sheets on close: leave focus alone if it has moved on
 * (e.g. into a newer modal); otherwise return it to the resolved target.
 * Always prevents Radix's own restore, which knows only the trigger.
 */
export function restoreFocus(event: Event, resolve: FocusResolver, doc: Document = document) {
  event.preventDefault();
  if (focusHasMoved(doc)) return;
  resolve()?.focus();
}

/**
 * Menus on close: skip Radix's restore to the trigger only when focus is
 * inside a different, newer modal (a dialog the menu item opened, or ⌘K).
 */
export function keepFocusInNewerModal(event: Event, doc: Document = document): void {
  const modal = doc.activeElement?.closest(MODAL);
  if (!modal) return;
  const content = event.currentTarget as Element | null;
  const triggerId = content?.getAttribute("aria-labelledby");
  const trigger = triggerId ? doc.getElementById(triggerId) : null;
  if (trigger && modal.contains(trigger)) return;
  event.preventDefault();
}

/**
 * Side panels and sheets take focus themselves on open: a screen reader
 * starts at the title, Tab moves into the content (and stays trapped), and
 * on phones no field raises the keyboard over the sheet. Radix would focus
 * the first control instead, skipping links, which often lands on the
 * footer or the × at the end.
 */
export function focusPanel(event: Event): void {
  event.preventDefault();
  (event.currentTarget as HTMLElement | null)?.focus();
}

/**
 * The resolver a layer records as it opens: its trigger when it has one,
 * otherwise the element focused before it (ignoring anything already inside
 * the new layer, e.g. an autofocused field).
 */
export function openingOrigin(
  layer: Element,
  trigger: Element | null | undefined,
  doc: Document = document,
): FocusResolver {
  if (trigger) return focusOrigin(trigger, doc);
  const active = doc.activeElement;
  return active && layer.contains(active) ? () => null : focusOrigin(active, doc);
}
