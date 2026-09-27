// Section operations for the structured builder (ADR-0030 §1). Pure
// functions over a document: each returns a new document and keeps the
// invariants the server checks anyway (unique, well-formed node ids; at
// most DOCUMENT_LIMITS.maxSections sections; known section types), so the
// builder can never produce an impossible state. Only top-level sections
// are edited; their settings are their props.
import type { Registry } from "../registry/types";
import {
  DOCUMENT_LIMITS,
  NODE_ID_RE,
  type BuilderNode,
  type JsonObject,
  type NodeVisibility,
  type PageDocument,
} from "./types";

export class OperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationError";
  }
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

/** A new 12-character node id (07 §2), from the platform's CSPRNG. */
export function newNodeId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) id += ALPHABET.charAt(byte & 63);
  return id;
}

function allIds(nodes: readonly BuilderNode[], into = new Set<string>()): Set<string> {
  for (const node of nodes) {
    into.add(node.id);
    allIds(node.children ?? [], into);
  }
  return into;
}

function freshId(taken: Set<string>, generate: () => string): string {
  for (let i = 0; i < 16; i++) {
    const id = generate();
    if (NODE_ID_RE.test(id) && !taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
  throw new OperationError("Couldn't create a unique section id.");
}

function locate(document: PageDocument, id: string): { index: number; node: BuilderNode } {
  const index = document.root.findIndex((node) => node.id === id);
  const node = document.root[index];
  if (index < 0 || !node) throw new OperationError("That section no longer exists.");
  return { index, node };
}

const withRoot = (document: PageDocument, root: readonly BuilderNode[]): PageDocument => ({
  ...document,
  root,
});

/** A section of a registered section type, with its default settings. */
export function createSection(
  registry: Pick<Registry, "get">,
  type: string,
  document: PageDocument,
  generate: () => string = newNodeId,
): BuilderNode {
  const definition = registry.get(type);
  if (!definition?.section) throw new OperationError("That kind of section isn't available.");
  return {
    id: freshId(allIds(document.root), generate),
    type,
    props: structuredClone(definition.defaultProps) as JsonObject,
    styles: {},
  };
}

export function insertSection(
  document: PageDocument,
  node: BuilderNode,
  index = document.root.length,
): PageDocument {
  if (document.root.length >= DOCUMENT_LIMITS.maxSections) {
    throw new OperationError(
      `A page can have at most ${String(DOCUMENT_LIMITS.maxSections)} sections.`,
    );
  }
  const taken = allIds(document.root);
  for (const id of allIds([node])) {
    if (taken.has(id) || !NODE_ID_RE.test(id))
      throw new OperationError("Section ids must be unique.");
  }
  const at = Math.max(0, Math.min(index, document.root.length));
  return withRoot(document, [...document.root.slice(0, at), node, ...document.root.slice(at)]);
}

/** Moves a section by `delta` places; moving past either end leaves the document unchanged. */
export function moveSection(document: PageDocument, id: string, delta: number): PageDocument {
  const { index: from, node } = locate(document, id);
  const to = from + delta;
  if (!Number.isInteger(delta) || to < 0 || to >= document.root.length) return document;
  const root = [...document.root];
  root.splice(from, 1);
  root.splice(to, 0, node);
  return withRoot(document, root);
}

/** A copy of a section (and anything inside it) with new ids, placed after it. */
export function duplicateSection(
  document: PageDocument,
  id: string,
  generate: () => string = newNodeId,
): PageDocument {
  const { index, node: original } = locate(document, id);
  const taken = allIds(document.root);
  const copy = (node: BuilderNode): BuilderNode => ({
    ...structuredClone(node),
    id: freshId(taken, generate),
    ...(node.children ? { children: node.children.map(copy) } : {}),
  });
  return insertSection(document, copy(original), index + 1);
}

export function removeSection(document: PageDocument, id: string): PageDocument {
  const { index } = locate(document, id);
  return withRoot(document, [...document.root.slice(0, index), ...document.root.slice(index + 1)]);
}

function replaceSection(
  document: PageDocument,
  id: string,
  change: (node: BuilderNode) => BuilderNode,
): PageDocument {
  const { index, node } = locate(document, id);
  const root = [...document.root];
  root[index] = change(node);
  return withRoot(document, root);
}

/** Replaces a section's settings (validated on save, like everything else). */
export function updateSectionProps(
  document: PageDocument,
  id: string,
  props: JsonObject,
): PageDocument {
  return replaceSection(document, id, (node) => ({ ...node, props }));
}

/** Hidden sections stay in the document but render nowhere. */
export function setSectionHidden(
  document: PageDocument,
  id: string,
  hidden: boolean,
): PageDocument {
  return replaceSection(document, id, (node) => {
    const { hidden: _drop, ...rest } = node;
    return hidden ? { ...rest, hidden: true } : rest;
  });
}

/** Per-device visibility; showing everywhere drops the setting. */
export function setSectionVisibility(
  document: PageDocument,
  id: string,
  visibility: NodeVisibility,
): PageDocument {
  return replaceSection(document, id, (node) => {
    const { visibility: _drop, ...rest } = node;
    const hiddenSomewhere = Object.values(visibility).some((v) => v === false);
    return hiddenSomewhere ? { ...rest, visibility } : rest;
  });
}
