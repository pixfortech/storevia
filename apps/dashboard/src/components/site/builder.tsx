"use client";

import {
  EMPTY_DOCUMENT_DATA,
  STOREVIA_REGISTRY,
  type DocumentData,
} from "@storevia/commerce/blocks";
import {
  createSection,
  duplicateSection,
  insertSection,
  moveSection,
  removeSection,
  setSectionHidden,
  setSectionVisibility,
  updateSectionProps,
  OperationError,
  type BuilderNode,
  type JsonObject,
  type PageDocument,
} from "@storevia/editor/document";
import type { ComponentDefinition } from "@storevia/editor/registry";
import { collectRequirements } from "@storevia/editor/render";
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
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  canvasDataAction,
  publishPageAction,
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
// separate step and needs its own permission.

type PageStatus = "published" | "draft" | "changes";
type SaveState =
  | { readonly state: "saved" }
  | { readonly state: "dirty" }
  | { readonly state: "saving" }
  | { readonly state: "error"; readonly message: string }
  | { readonly state: "conflict"; readonly message: string };

export interface BuilderPage {
  readonly id: string;
  readonly kind: "HOME" | "STANDARD";
  readonly title: string;
  readonly handle: string;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
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
  const [error, setError] = useState<string | null>(null);

  const docRef = useRef(document);
  const revisionRef = useRef(page.revision);
  const dirtyRef = useRef(false);
  const inFlight = useRef<Promise<boolean> | null>(null);

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

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) await inFlight.current;
    if (!dirtyRef.current) return true;
    const snapshot = docRef.current;
    dirtyRef.current = false;
    setSave({ state: "saving" });
    const request = savePageDraftAction(storeId, page.id, {
      revision: revisionRef.current,
      document: snapshot,
    }).then((result) => {
      if (result.ok) {
        revisionRef.current = result.data.revision;
        setStatus(result.data.status);
        setSave(dirtyRef.current ? { state: "dirty" } : { state: "saved" });
        return true;
      }
      dirtyRef.current = true;
      const message = result.message ?? "Your changes couldn't be saved.";
      setSave(
        result.code === "CONFLICT" ? { state: "conflict", message } : { state: "error", message },
      );
      return false;
    });
    inFlight.current = request;
    const ok = await request;
    inFlight.current = null;
    return ok;
  }, [storeId, page.id]);

  // Debounced autosave: one save at a time, never while a conflict is unresolved.
  useEffect(() => {
    if (save.state !== "dirty" || !canEdit) return;
    const timer = setTimeout(() => void saveNow(), AUTOSAVE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [document, save.state, saveNow, canEdit]);

  const change = useCallback((next: PageDocument) => {
    docRef.current = next;
    dirtyRef.current = true;
    setDocument(next);
    setError(null);
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

  async function publish() {
    setPublishing(true);
    const saved = await saveNow();
    if (!saved) {
      setPublishing(false);
      return;
    }
    const result = await publishPageAction(storeId, page.id, { revision: revisionRef.current });
    setPublishing(false);
    if (result.ok) {
      setStatus("published");
      setNotice({ tone: "success", title: result.message ?? "Published." });
    } else {
      setError(result.message ?? "The page couldn't be published.");
      if (result.code === "CONFLICT") setSave({ state: "conflict", message: result.message ?? "" });
    }
  }

  // ---- structure ----------------------------------------------------------

  const selected = document.root.find((n) => n.id === selectedId) ?? null;
  const selectedIndex = selected ? document.root.indexOf(selected) : -1;
  const definition = selected ? definitionOf(selected.type) : undefined;
  const sectionTypes = STOREVIA_REGISTRY.sections.filter(
    (d) => !d.requires?.includes("catalogue") || options.hasCatalogue,
  );
  const readOnly = !canEdit || save.state === "conflict";

  const statusText =
    save.state === "saving"
      ? "Saving…"
      : save.state === "dirty"
        ? "Unsaved changes"
        : save.state === "error"
          ? "Not saved"
          : save.state === "conflict"
            ? "Not saved: changed elsewhere"
            : "All changes saved";

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
          <fieldset disabled={readOnly} className="grid gap-5 disabled:opacity-60">
            <SettingsForm
              controls={definition.editorControls}
              props={{ ...definition.defaultProps, ...selected.props }}
              onChange={(props) => {
                apply((d) => updateSectionProps(d, selected.id, props as JsonObject));
              }}
              context={{ options, previews, sectionId: selected.id }}
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
              disabled={readOnly}
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
      {page.problems.length > 0 ? (
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
