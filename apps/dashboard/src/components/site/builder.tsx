"use client";

import {
  EMPTY_DOCUMENT_DATA,
  STOREVIA_REGISTRY,
  type DocumentData,
} from "@storevia/commerce/blocks";
import {
  createSection,
  describeIssues,
  duplicateSection,
  insertSection,
  moveSection,
  problemText,
  removeSection,
  setSectionHidden,
  setSectionVisibility,
  updateSectionProps,
  validateDocument,
  OperationError,
  type BuilderNode,
  type DocumentProblem,
  type JsonObject,
  type PageDocument,
} from "@storevia/editor/document";
import type { ComponentDefinition } from "@storevia/editor/registry";
import { collectRequirements } from "@storevia/editor/render";
import { DRAFT_CONFLICT_MESSAGE } from "@storevia/site-admin/messages";
import type { ThemeTokens } from "@storevia/site-engine/theme";
import { Button, IconButton } from "@storevia/ui/button";
import { cn } from "@storevia/ui/cn";
import { Checkbox } from "@storevia/ui/choice";
import { Field, Input, Textarea } from "@storevia/ui/form";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";
import { SegmentedControl } from "@storevia/ui/segmented-control";
import { Alert, Badge } from "@storevia/ui/surfaces";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Plus,
  Settings2,
  Trash2,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  canvasDataAction,
  publishPageAction,
  revertPageDraftAction,
  savePageDraftAction,
  updatePageSettingsAction,
} from "@/app/(app)/s/[storeId]/website/actions";
import { UnsavedChangesGuard } from "@/components/catalogue/unsaved-guard";
import { Canvas, type Device } from "./canvas";
import { SettingsForm } from "./controls";
import type { SiteOptions } from "./pickers";
import { StatusNotice, type Notice } from "./notice";

// The Visual Builder (ADR-0030 §1): a structured section editor. The left
// panel lists the page's sections (select, move up/down, duplicate, hide,
// remove: every action is a button, so nothing depends on drag and drop),
// the centre shows the page as the storefront renders it, and the right
// panel edits the selected section's settings. Changes save as a draft
// (debounced autosave plus "Save draft"), with optimistic concurrency:
// another tab's or person's save is never overwritten. Publishing is a
// separate step and needs its own permission; after it the builder keeps
// editing the new draft. "Revert to published" throws the draft's changes
// away. Every change is validated here with the same registry the server
// uses, so an invalid field is shown at the field (and in a list of
// problems) and never sent; the server's refusals read the same way.

type PageStatus = "published" | "draft" | "changes";
type SaveState =
  | { readonly state: "saved" }
  | { readonly state: "dirty" }
  | { readonly state: "saving" }
  /** The server refused the document; the problems are listed. */
  | { readonly state: "invalid" }
  | { readonly state: "error"; readonly message: string }
  | { readonly state: "conflict"; readonly message: string };

export interface BuilderPage {
  readonly id: string;
  readonly kind: "HOME" | "STANDARD";
  readonly title: string;
  readonly handle: string;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  /** The page has a published version. */
  readonly live: boolean;
  readonly status: PageStatus;
  readonly revision: number;
  readonly document: PageDocument;
  readonly problems: readonly string[];
}

const STATUS_BADGE: Record<PageStatus, { label: string; tone: "success" | "warning" | "neutral" }> =
  {
    published: { label: "Published", tone: "success" },
    changes: { label: "Unpublished changes", tone: "warning" },
    draft: { label: "Draft", tone: "neutral" },
  };

const AUTOSAVE_MS = 1_500;

function definitionOf(type: string): ComponentDefinition<object, never> | undefined {
  return STOREVIA_REGISTRY.get(type);
}

/** What the server would refuse in this document (same registry, same rules). */
function problemsOf(document: PageDocument, kind: BuilderPage["kind"]): DocumentProblem[] {
  const result = validateDocument(document, { registry: STOREVIA_REGISTRY, pageKind: kind });
  return result.ok ? [] : describeIssues(document, result.issues, STOREVIA_REGISTRY);
}

/** A refusal's field errors (keyed by document path) as problems in the document that was sent. */
function refusedProblems(
  document: PageDocument,
  fieldErrors: Readonly<Record<string, string>> | undefined,
): DocumentProblem[] {
  const issues = Object.entries(fieldErrors ?? {}).map(([key, message]) => ({
    path: key.startsWith("root.") ? key : "",
    message,
  }));
  return describeIssues(document, issues, STOREVIA_REGISTRY);
}

/** A ref's value now (after an await, when it may have changed). */
const read = <T,>(ref: { readonly current: T }): T => ref.current;

const problemCount = (n: number) => `${String(n)} ${n === 1 ? "problem" : "problems"}`;

/** "Hero: Autumn is here", for the structure list. */
function sectionLabel(node: BuilderNode): string {
  const definition = definitionOf(node.type);
  if (!definition) return "Unknown section";
  if (!definition.section) return "Layout (made with older tools)";
  const heading = definition.headingProp ? node.props[definition.headingProp] : undefined;
  return typeof heading === "string" && heading.trim()
    ? `${definition.label}: ${heading.trim().slice(0, 40)}`
    : definition.label;
}

export function PageBuilder({
  storeId,
  storeName,
  locale,
  page,
  tokens,
  options: baseOptions,
  canPublish,
  canEdit,
  previewHref,
  backHref,
}: {
  storeId: string;
  storeName: string;
  locale: string;
  page: BuilderPage;
  tokens: ThemeTokens;
  options: Omit<SiteOptions, "rememberName">;
  canPublish: boolean;
  canEdit: boolean;
  previewHref: string;
  backHref: string;
}) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [document, setDocument] = useState<PageDocument>(page.document);
  const [status, setStatus] = useState<PageStatus>(page.status);
  const [save, setSave] = useState<SaveState>({ state: "saved" });
  const [selectedId, setSelectedId] = useState<string | null>(page.document.root[0]?.id ?? null);
  const [device, setDevice] = useState<Device>("desktop");
  const [tab, setTab] = useState<"structure" | "preview" | "settings">("preview");
  const [data, setData] = useState<DocumentData>(EMPTY_DOCUMENT_DATA);
  const [names, setNames] = useState<Record<string, string>>({ ...baseOptions.names });
  const [addOpen, setAddOpen] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [live, setLive] = useState(page.live);
  const [revertOpen, setRevertOpen] = useState(false);
  const [reverting, setReverting] = useState(false);
  /** Bumped when the whole document is replaced (revert), so settings forms start afresh. */
  const [generation, setGeneration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** Problems the server reported for the last document it was sent. */
  const [refused, setRefused] = useState<readonly DocumentProblem[]>([]);
  /** A field to focus once its section's settings are on screen ("Show"). */
  const [focusTarget, setFocusTarget] = useState<{
    readonly field: string | null;
    readonly nonce: number;
  } | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  const docRef = useRef(document);
  const revisionRef = useRef(page.revision);
  const dirtyRef = useRef(false);
  /** The save, publish or revert in progress: each waits for the one before (they share the revision). */
  const inFlight = useRef<Promise<boolean> | null>(null);

  const found = useMemo(() => problemsOf(document, page.kind), [document, page.kind]);
  const problems = found.length > 0 ? found : refused;

  const options: SiteOptions = useMemo(
    () => ({
      ...baseOptions,
      names,
      rememberName: (id: string, title: string) => {
        setNames((current) => ({ ...current, [id]: title }));
      },
    }),
    [baseOptions, names],
  );

  // ---- saving -------------------------------------------------------------

  /** Runs one request against the draft after any other in progress, holding the line while it runs. */
  const exclusive = useCallback(async (run: () => Promise<boolean>): Promise<boolean> => {
    while (inFlight.current) await inFlight.current;
    const request = run();
    inFlight.current = request;
    try {
      return await request;
    } finally {
      if (inFlight.current === request) inFlight.current = null;
    }
  }, []);

  const saveNow = useCallback(
    async (): Promise<boolean> =>
      exclusive(async () => {
        if (!dirtyRef.current) return true;
        const snapshot = docRef.current;
        // A document the server would refuse is never sent: its problems
        // are on screen, and the local copy stays until they're fixed.
        if (problemsOf(snapshot, page.kind).length > 0) return false;
        dirtyRef.current = false;
        setSave({ state: "saving" });
        const result = await savePageDraftAction(storeId, page.id, {
          revision: revisionRef.current,
          document: snapshot,
        });
        if (result.ok) {
          revisionRef.current = result.data.revision;
          setStatus(result.data.status);
          setRefused([]);
          // Changes made while the save was on its way are still to save.
          setSave(read(dirtyRef) ? { state: "dirty" } : { state: "saved" });
          return true;
        }
        dirtyRef.current = true;
        const message = result.message ?? "Your changes couldn't be saved.";
        if (result.code === "CONFLICT" && result.message === DRAFT_CONFLICT_MESSAGE) {
          setSave({ state: "conflict", message });
        } else if (result.code === "VALIDATION_FAILED") {
          setRefused(refusedProblems(snapshot, result.fieldErrors));
          setSave({ state: "invalid" });
        } else {
          setSave({ state: "error", message });
        }
        return false;
      }),
    [exclusive, storeId, page.id, page.kind],
  );

  // Debounced autosave: one save at a time, never while a conflict is
  // unresolved or while the document has problems (it resumes once fixed).
  const blocked = found.length > 0;
  useEffect(() => {
    if (save.state !== "dirty" || !canEdit || blocked) return;
    const timer = setTimeout(() => void saveNow(), AUTOSAVE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [document, save.state, saveNow, canEdit, blocked]);

  const change = useCallback((next: PageDocument) => {
    docRef.current = next;
    dirtyRef.current = true;
    setDocument(next);
    setError(null);
    setRefused([]);
    setSave((current) => (current.state === "conflict" ? current : { state: "dirty" }));
  }, []);

  const apply = (operation: (doc: PageDocument) => PageDocument) => {
    try {
      change(operation(docRef.current));
    } catch (e) {
      setError(e instanceof OperationError ? e.message : "That change couldn't be made.");
    }
  };

  // ---- canvas data --------------------------------------------------------

  const requirementsKey = useMemo(() => {
    const r = collectRequirements(document, STOREVIA_REGISTRY);
    return JSON.stringify([r.requests, r.links, r.media]);
  }, [document]);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void canvasDataAction(storeId, page.kind, docRef.current).then((result) => {
        if (!cancelled && result.ok) setData(result.data);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [requirementsKey, storeId, page.kind]);
  const previews = useMemo(
    () => Object.fromEntries(data.media.map(([id, view]) => [id, view.url])),
    [data.media],
  );

  // ---- publish ------------------------------------------------------------

  /** A refusal of publish or revert: only a stale revision is a conflict. */
  const refusal = (result: { code?: string | undefined; message?: string | undefined }) => {
    if (result.code === "CONFLICT" && result.message === DRAFT_CONFLICT_MESSAGE) {
      setSave({ state: "conflict", message: result.message });
    } else {
      setError(result.message ?? "That didn't work. Try again.");
    }
  };

  async function publish() {
    setPublishing(true);
    setError(null);
    const saved = await saveNow();
    if (!saved) {
      setPublishing(false);
      if (problemsOf(docRef.current, page.kind).length > 0) {
        setError("Fix the problems on this page before publishing it.");
      }
      return;
    }
    await exclusive(async () => {
      const result = await publishPageAction(storeId, page.id, { revision: revisionRef.current });
      if (!result.ok) {
        refusal(result);
        return false;
      }
      // The builder carries on with the draft publishing started.
      revisionRef.current = result.data.revision;
      setLive(true);
      if (!dirtyRef.current) setStatus("published");
      setNotice({ tone: "success", title: result.message ?? "Published." });
      return true;
    });
    setPublishing(false);
  }

  async function revert() {
    setReverting(true);
    setError(null);
    await exclusive(async () => {
      const result = await revertPageDraftAction(storeId, page.id, {
        revision: revisionRef.current,
      });
      if (!result.ok) {
        refusal(result);
        return false;
      }
      const next = result.data.document;
      revisionRef.current = result.data.revision;
      docRef.current = next;
      dirtyRef.current = false;
      setDocument(next);
      setStatus(result.data.status);
      setRefused([]);
      setSave({ state: "saved" });
      setGeneration((g) => g + 1);
      setSelectedId((current) =>
        next.root.some((n) => n.id === current) ? current : (next.root[0]?.id ?? null),
      );
      setNotice({ tone: "success", title: result.message ?? "Reverted." });
      return true;
    });
    setReverting(false);
    setRevertOpen(false);
  }

  /** Selects a problem's section and focuses the field that fixes it. */
  const showProblem = (problem: DocumentProblem) => {
    if (!problem.sectionId) return;
    setSelectedId(problem.sectionId);
    setTab("settings");
    setFocusTarget({ field: problem.field, nonce: Date.now() });
  };
  useEffect(() => {
    if (!focusTarget) return;
    const frame = requestAnimationFrame(() => {
      const panel = settingsRef.current;
      if (!panel) return;
      const field = focusTarget.field
        ? panel.querySelector<HTMLElement>(`[data-field="${CSS.escape(focusTarget.field)}"]`)
        : null;
      const scope = field ?? panel;
      scope.scrollIntoView({ block: "center" });
      scope
        .querySelector<HTMLElement>(
          "input:not([type=hidden]):not([disabled]), textarea, select, [contenteditable=true], button",
        )
        ?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [focusTarget]);

  // ---- structure ----------------------------------------------------------

  const selected = document.root.find((n) => n.id === selectedId) ?? null;
  const selectedIndex = selected ? document.root.indexOf(selected) : -1;
  const definition = selected ? definitionOf(selected.type) : undefined;
  const sectionTypes = STOREVIA_REGISTRY.sections.filter(
    (d) => !d.requires?.includes("catalogue") || options.hasCatalogue,
  );
  const readOnly = !canEdit || save.state === "conflict";
  const unsaved = save.state !== "saved";
  // Publishing needs something new: unsaved edits or a draft that differs from the live page.
  const nothingToPublish = status === "published" && !unsaved;
  const canRevert = live && (status === "changes" || unsaved);

  const statusText =
    save.state === "conflict"
      ? "Not saved: changed elsewhere"
      : unsaved && problems.length > 0
        ? `Not saved — fix ${problemCount(problems.length)}`
        : save.state === "saving"
          ? "Saving…"
          : save.state === "dirty"
            ? "Unsaved changes"
            : save.state === "error" || save.state === "invalid"
              ? "Not saved"
              : "All changes saved";

  const sectionProblems = selected
    ? problems.filter((p) => p.sectionId === selected.id)
    : ([] as DocumentProblem[]);
  const fieldErrors = Object.fromEntries(
    sectionProblems.flatMap((p) => (p.field ? [[p.field, p.message] as const] : [])),
  );
  const unplacedProblems = sectionProblems.filter((p) => !p.field);
  const needsAttention = new Set(problems.map((p) => p.sectionId));

  const structure = (
    <nav aria-label="Page sections" className="grid content-start gap-3 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-label font-semibold text-ink">Sections</h2>
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={Plus}
          disabled={readOnly}
          onClick={() => {
            setAddOpen(true);
          }}
        >
          Add section
        </Button>
      </div>
      {document.root.length === 0 ? (
        <p className="text-body-sm text-ink-muted">No sections yet.</p>
      ) : (
        <ol className="grid gap-1">
          {document.root.map((node, index) => {
            const label = sectionLabel(node);
            const isSelected = node.id === selectedId;
            return (
              <li
                key={node.id}
                className={cn(
                  "rounded-control border",
                  isSelected ? "border-brand-500 bg-brand-25" : "border-transparent",
                )}
              >
                <button
                  type="button"
                  aria-current={isSelected ? "true" : undefined}
                  className="flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-body-sm hover:bg-subtle focus-visible:outline-2 focus-visible:outline-focus"
                  onClick={() => {
                    setSelectedId(node.id);
                    setTab("settings");
                  }}
                >
                  <span aria-hidden="true" className="w-5 shrink-0 text-caption text-ink-faint">
                    {index + 1}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      node.hidden && "text-ink-faint line-through",
                    )}
                  >
                    {label}
                  </span>
                  {needsAttention.has(node.id) ? (
                    <Badge size="sm" tone="danger">
                      Needs a fix
                    </Badge>
                  ) : null}
                  {node.hidden ? <Badge size="sm">Hidden</Badge> : null}
                </button>
                {isSelected ? (
                  <div
                    className="flex flex-wrap gap-1 px-2 pb-2"
                    role="group"
                    aria-label={`${label} actions`}
                  >
                    <IconButton
                      size="sm"
                      icon={ArrowUp}
                      aria-label={`Move ${label} up`}
                      disabled={readOnly || index === 0}
                      onClick={() => {
                        apply((d) => moveSection(d, node.id, -1));
                      }}
                    />
                    <IconButton
                      size="sm"
                      icon={ArrowDown}
                      aria-label={`Move ${label} down`}
                      disabled={readOnly || index === document.root.length - 1}
                      onClick={() => {
                        apply((d) => moveSection(d, node.id, 1));
                      }}
                    />
                    <IconButton
                      size="sm"
                      icon={Copy}
                      aria-label={`Duplicate ${label}`}
                      disabled={readOnly}
                      onClick={() => {
                        apply((d) => duplicateSection(d, node.id));
                      }}
                    />
                    <IconButton
                      size="sm"
                      icon={node.hidden ? Eye : EyeOff}
                      aria-label={node.hidden ? `Show ${label}` : `Hide ${label}`}
                      disabled={readOnly}
                      onClick={() => {
                        apply((d) => setSectionHidden(d, node.id, !node.hidden));
                      }}
                    />
                    <IconButton
                      size="sm"
                      icon={Trash2}
                      aria-label={`Remove ${label}`}
                      disabled={readOnly}
                      onClick={() => {
                        setRemoveId(node.id);
                      }}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </nav>
  );

  const settings = (
    <section aria-label="Section settings" className="grid content-start gap-4 p-4">
      {!selected ? (
        <p className="text-body-sm text-ink-muted">Select a section to edit it.</p>
      ) : !definition?.section ? (
        <Alert tone="neutral" title="This section can't be edited here">
          It was made with the older layout tools. You can move it, hide it or remove it.
        </Alert>
      ) : (
        <>
          <div>
            <h2 className="text-body font-semibold text-ink">{definition.label}</h2>
            {definition.description ? (
              <p className="text-body-sm text-ink-muted">{definition.description}</p>
            ) : null}
          </div>
          {unplacedProblems.length > 0 ? (
            <Alert tone="danger" title="This section needs a fix">
              {unplacedProblems.map((p) => p.message).join(" ")}
            </Alert>
          ) : null}
          <fieldset disabled={readOnly} className="grid gap-5 disabled:opacity-60">
            {/* Keyed by section (and by revert), so no control keeps another section's state. */}
            <SettingsForm
              key={`${selected.id}:${String(generation)}`}
              controls={definition.editorControls}
              props={{ ...definition.defaultProps, ...selected.props }}
              onChange={(props) => {
                apply((d) => updateSectionProps(d, selected.id, props as JsonObject));
              }}
              context={{
                options,
                previews,
                sectionId: selected.id,
                errors: fieldErrors,
                schema: definition.propertySchema,
              }}
            />
            <fieldset className="grid gap-2 border-t border-line pt-4">
              <legend className="mb-1 text-label text-ink">Show on</legend>
              {(
                [
                  ["mobile", "Phones"],
                  ["tablet", "Tablets"],
                  ["desktop", "Computers"],
                ] as const
              ).map(([key, label]) => (
                <Checkbox
                  key={key}
                  label={label}
                  checked={selected.visibility?.[key] !== false}
                  onCheckedChange={(checked) => {
                    apply((d) =>
                      setSectionVisibility(d, selected.id, {
                        ...selected.visibility,
                        [key]: checked === true,
                      }),
                    );
                  }}
                />
              ))}
            </fieldset>
          </fieldset>
        </>
      )}
    </section>
  );

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <UnsavedChangesGuard dirty={save.state !== "saved"} />
      <header className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-body-sm text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Pages
        </Link>
        <h1 className="min-w-0 truncate font-display text-h4 text-ink">{page.title}</h1>
        <Badge tone={STATUS_BADGE[status].tone}>{STATUS_BADGE[status].label}</Badge>
        <p className="text-caption text-ink-muted" role="status" aria-live="polite">
          {statusText}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SegmentedControl
            aria-label="Preview width"
            size="sm"
            value={device}
            onValueChange={(v) => {
              setDevice(v as Device);
            }}
            options={[
              { value: "desktop", label: "Desktop" },
              { value: "tablet", label: "Tablet" },
              { value: "mobile", label: "Phone" },
            ]}
          />
          <IconButton
            size="sm"
            variant="secondary"
            icon={Settings2}
            aria-label="Page settings"
            onClick={() => {
              setSettingsOpen(true);
            }}
          />
          {live ? (
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={Undo2}
              disabled={readOnly || !canRevert}
              onClick={() => {
                setRevertOpen(true);
              }}
            >
              Revert to published
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            disabled={readOnly || save.state === "saved" || save.state === "saving"}
            onClick={() => void saveNow()}
          >
            Save draft
          </Button>
          <Button
            size="sm"
            variant="secondary"
            trailingIcon={ExternalLink}
            onClick={() => {
              void (async () => {
                const saved = await saveNow();
                if (saved) window.open(previewHref, "_blank", "noopener");
              })();
            }}
          >
            Preview
          </Button>
          {canPublish ? (
            <Button
              size="sm"
              pending={publishing}
              disabled={readOnly || nothingToPublish}
              title={nothingToPublish ? "Your site already shows this page." : undefined}
              onClick={() => void publish()}
            >
              Publish
            </Button>
          ) : null}
        </div>
      </header>

      <StatusNotice
        notice={notice}
        onDismiss={() => {
          setNotice(null);
        }}
        className="mt-3"
      />
      {problems.length > 0 ? (
        <Alert
          tone="danger"
          className="mt-3"
          title={
            unsaved
              ? `Not saved: fix ${problemCount(problems.length)} to save this page`
              : `Fix ${problemCount(problems.length)} on this page`
          }
          aria-label="Problems on this page"
        >
          <p>Your other changes are kept here and save once these are fixed.</p>
          <ul className="mt-2 grid gap-1.5">
            {problems.map((problem) => {
              const text = problemText(problem);
              return (
                <li key={`${problem.path}:${problem.message}`} className="flex items-start gap-3">
                  <span className="min-w-0 flex-1 text-ink">{text}</span>
                  {problem.sectionId ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Show ${text}`}
                      onClick={() => {
                        showProblem(problem);
                      }}
                    >
                      Show
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Alert>
      ) : page.problems.length > 0 ? (
        <Alert tone="warning" className="mt-3" title="Some of this page needs attention">
          {page.problems.join(" ")}
        </Alert>
      ) : null}
      {save.state === "conflict" ? (
        <Alert
          tone="danger"
          className="mt-3"
          title="This page changed somewhere else"
          actions={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                window.location.reload();
              }}
            >
              Reload
            </Button>
          }
        >
          {save.message}
        </Alert>
      ) : null}
      {save.state === "error" ? (
        <Alert tone="danger" className="mt-3" title="Not saved">
          {save.message}
        </Alert>
      ) : null}
      {error ? (
        <Alert
          tone="danger"
          className="mt-3"
          onDismiss={() => {
            setError(null);
          }}
        >
          {error}
        </Alert>
      ) : null}
      {!canEdit ? (
        <Alert tone="neutral" className="mt-3">
          You can look at this page, but your role can't change it.
        </Alert>
      ) : null}

      <div className="mt-3 lg:hidden">
        <SegmentedControl
          aria-label="Builder panel"
          fullWidth
          value={tab}
          onValueChange={(v) => {
            setTab(v as typeof tab);
          }}
          options={[
            { value: "structure", label: "Sections" },
            { value: "preview", label: "Preview" },
            { value: "settings", label: "Settings" },
          ]}
        />
      </div>

      <div className="mt-3 grid min-h-0 flex-1 gap-3 lg:grid-cols-[15rem_minmax(0,1fr)_19rem] 2xl:grid-cols-[17rem_minmax(0,1fr)_22rem]">
        <div
          className={cn(
            "min-h-0 overflow-y-auto rounded-card border border-line bg-surface lg:block",
            tab !== "structure" && "hidden",
          )}
        >
          {structure}
        </div>
        <div
          className={cn(
            "min-h-[32rem] overflow-hidden rounded-card border border-line lg:block",
            tab !== "preview" && "hidden",
          )}
        >
          <Canvas
            document={document}
            data={data}
            tokens={tokens}
            siteName={storeName}
            locale={locale}
            device={device}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
            }}
            labelFor={(type) => definitionOf(type)?.label ?? "Section"}
          />
        </div>
        <div
          ref={settingsRef}
          className={cn(
            "min-h-0 overflow-y-auto rounded-card border border-line bg-surface lg:block",
            tab !== "settings" && "hidden",
          )}
        >
          {settings}
        </div>
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={setAddOpen}
        size="lg"
        title="Add a section"
        description={
          selectedIndex >= 0
            ? "It goes after the selected section."
            : "It goes at the end of the page."
        }
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {sectionTypes.map((d) => (
            <li key={d.type}>
              <button
                type="button"
                className="grid h-full w-full gap-1 rounded-control border border-line p-3 text-left hover:border-brand-500 hover:bg-brand-25 focus-visible:outline-2 focus-visible:outline-focus"
                onClick={() => {
                  try {
                    const node = createSection(STOREVIA_REGISTRY, d.type, docRef.current);
                    const at = selectedIndex >= 0 ? selectedIndex + 1 : docRef.current.root.length;
                    change(insertSection(docRef.current, node, at));
                    setSelectedId(node.id);
                    setTab("settings");
                  } catch (e) {
                    setError(
                      e instanceof OperationError ? e.message : "The section couldn't be added.",
                    );
                  }
                  setAddOpen(false);
                }}
              >
                <span className="text-body-sm font-medium text-ink">{d.label}</span>
                {d.description ? (
                  <span className="text-caption text-ink-muted">{d.description}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </Dialog>

      <Dialog
        open={removeId !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveId(null);
        }}
        role="alertdialog"
        title="Remove this section?"
        description="It disappears from the draft. The published page doesn't change until you publish."
        footer={
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              variant="danger"
              onClick={() => {
                const id = removeId;
                if (id) {
                  const index = docRef.current.root.findIndex((n) => n.id === id);
                  apply((d) => removeSection(d, id));
                  const next = docRef.current.root[Math.min(index, docRef.current.root.length - 1)];
                  setSelectedId(next?.id ?? null);
                }
                setRemoveId(null);
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        }
      >
        <p className="text-body-sm text-ink-muted">{selected ? sectionLabel(selected) : ""}</p>
      </Dialog>

      <Dialog
        open={revertOpen}
        onOpenChange={(open) => {
          if (!reverting) setRevertOpen(open);
        }}
        role="alertdialog"
        title="Revert to the published version?"
        description="Your unpublished changes to this page are thrown away, and the draft goes back to what your site shows now. This can't be undone."
        footer={
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" disabled={reverting}>
                Keep editing
              </Button>
            </DialogClose>
            <Button variant="danger" pending={reverting} onClick={() => void revert()}>
              Revert
            </Button>
          </DialogFooter>
        }
      >
        <p className="text-body-sm text-ink-muted">Your live site doesn&apos;t change.</p>
      </Dialog>

      <PageSettingsDialog
        storeId={storeId}
        page={page}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        disabled={!canEdit}
      />
    </div>
  );
}

function PageSettingsDialog({
  storeId,
  page,
  open,
  onOpenChange,
  disabled,
}: {
  storeId: string;
  page: BuilderPage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
}) {
  const [title, setTitle] = useState(page.title);
  const [handle, setHandle] = useState(page.handle);
  const [seoTitle, setSeoTitle] = useState(page.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(page.seoDescription ?? "");
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [pending, setPending] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Page settings"
      description="These apply as soon as you save them."
      footer={
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            pending={pending}
            disabled={disabled}
            onClick={() => {
              void (async () => {
                setPending(true);
                const result = await updatePageSettingsAction(storeId, page.id, {
                  title,
                  handle,
                  seoTitle,
                  seoDescription,
                });
                setPending(false);
                if (result.ok) {
                  onOpenChange(false);
                  window.location.reload();
                } else
                  setErrors(result.fieldErrors ?? { title: result.message ?? "Couldn't save." });
              })();
            }}
          >
            Save settings
          </Button>
        </DialogFooter>
      }
    >
      <div className="grid gap-4">
        <Field label="Title" error={errors["title"]}>
          <Input
            value={title}
            maxLength={255}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
          />
        </Field>
        {page.kind === "STANDARD" ? (
          <Field
            label="Address"
            description={`Shown at /pages/${handle || "…"}`}
            error={errors["handle"]}
          >
            <Input
              value={handle}
              maxLength={100}
              onChange={(e) => {
                setHandle(e.target.value);
              }}
            />
          </Field>
        ) : null}
        <Field label="Search engine title" optional error={errors["seoTitle"]}>
          <Input
            value={seoTitle}
            maxLength={255}
            onChange={(e) => {
              setSeoTitle(e.target.value);
            }}
          />
        </Field>
        <Field label="Search engine description" optional error={errors["seoDescription"]}>
          <Textarea
            rows={3}
            value={seoDescription}
            maxLength={1000}
            onChange={(e) => {
              setSeoDescription(e.target.value);
            }}
          />
        </Field>
      </div>
    </Dialog>
  );
}
