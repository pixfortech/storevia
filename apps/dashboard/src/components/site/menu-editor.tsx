"use client";

import { newNodeId } from "@storevia/editor/document";
import { Button, IconButton } from "@storevia/ui/button";
import { Field, Input } from "@storevia/ui/form";
import { Alert, Card } from "@storevia/ui/surfaces";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { saveMenuAction } from "@/app/(app)/s/[storeId]/website/actions";
import { UnsavedChangesGuard } from "@/components/catalogue/unsaved-guard";
import { LinkField, type LinkValue, type SiteOptions } from "./pickers";
import { StatusNotice, type Notice } from "./notice";

// Menus (ADR-0030 §8): the header and footer menus as labelled typed links,
// reordered with buttons. Saving checks every link belongs to this store and
// that nobody else saved the menu in between.

export interface MenuItemView {
  readonly id: string;
  readonly label: string;
  readonly link: LinkValue;
}

export function MenuEditor({
  storeId,
  handle,
  title,
  description,
  initial,
  revision: initialRevision,
  options: baseOptions,
  canEdit,
}: {
  storeId: string;
  handle: "main" | "footer";
  title: string;
  description: string;
  initial: readonly MenuItemView[];
  revision: number;
  options: Omit<SiteOptions, "rememberName">;
  canEdit: boolean;
}) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [items, setItems] = useState<MenuItemView[]>([...initial]);
  const [revision, setRevision] = useState(initialRevision);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({ ...baseOptions.names });
  const options: SiteOptions = {
    ...baseOptions,
    names,
    rememberName: (id, name) => {
      setNames((n) => ({ ...n, [id]: name }));
    },
  };

  const update = (next: MenuItemView[]) => {
    setItems(next);
    setDirty(true);
    setError(null);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    if (item) next.splice(to, 0, item);
    update(next);
  };

  return (
    <Card className="grid gap-4 p-5" role="region" aria-label={title}>
      <UnsavedChangesGuard dirty={dirty} />
      <div>
        <h2 className="text-body font-semibold text-ink">{title}</h2>
        <p className="text-body-sm text-ink-muted">{description}</p>
      </div>
      <StatusNotice
        notice={notice}
        onDismiss={() => {
          setNotice(null);
        }}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {items.length === 0 ? <p className="text-body-sm text-ink-muted">No links yet.</p> : null}
      <ol className="grid gap-3" aria-label={`${title} links`}>
        {items.map((item, index) => (
          <li
            key={item.id}
            className="grid gap-3 rounded-control border border-line p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <Field label="Label">
              <Input
                value={item.label}
                maxLength={80}
                disabled={!canEdit}
                onChange={(e) => {
                  update(
                    items.map((it, i) => (i === index ? { ...it, label: e.target.value } : it)),
                  );
                }}
              />
            </Field>
            <LinkField
              label="Goes to"
              value={item.link}
              options={options}
              onChange={(link) => {
                update(items.map((it, i) => (i === index ? { ...it, link } : it)));
              }}
            />
            <div className="flex items-start gap-1 sm:pt-7">
              <IconButton
                size="sm"
                icon={ArrowUp}
                aria-label={`Move ${item.label || "link"} up`}
                disabled={!canEdit || index === 0}
                onClick={() => {
                  move(index, index - 1);
                }}
              />
              <IconButton
                size="sm"
                icon={ArrowDown}
                aria-label={`Move ${item.label || "link"} down`}
                disabled={!canEdit || index === items.length - 1}
                onClick={() => {
                  move(index, index + 1);
                }}
              />
              <IconButton
                size="sm"
                icon={Trash2}
                aria-label={`Remove ${item.label || "link"}`}
                disabled={!canEdit}
                onClick={() => {
                  update(items.filter((_, i) => i !== index));
                }}
              />
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          leadingIcon={Plus}
          disabled={!canEdit || items.length >= 20}
          onClick={() => {
            update([...items, { id: newNodeId(), label: "", link: { type: "home" } }]);
          }}
        >
          Add link
        </Button>
        <Button
          disabled={!canEdit || !dirty}
          pending={pending}
          onClick={() => {
            void (async () => {
              setPending(true);
              const result = await saveMenuAction(storeId, handle, { revision, items });
              setPending(false);
              if (result.ok) {
                setRevision(result.data.revision);
                setDirty(false);
                setNotice({ tone: "success", title: result.message ?? "Saved." });
              } else
                setError(
                  result.fieldErrors?.["items"] ?? result.message ?? "The menu couldn't be saved.",
                );
            })();
          }}
        >
          Save {title.toLowerCase()}
        </Button>
      </div>
    </Card>
  );
}
