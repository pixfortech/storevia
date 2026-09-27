"use client";

import { Button } from "@storevia/ui/button";
import { Field, Input } from "@storevia/ui/form";
import { Dialog, DialogClose, DialogFooter } from "@storevia/ui/overlays";
import { Badge, Card } from "@storevia/ui/surfaces";
import { FilePlus2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createPageAction,
  deletePageAction,
  unpublishPageAction,
} from "@/app/(app)/s/[storeId]/website/actions";
import { StatusNotice, type Notice } from "./notice";

// The store's pages: the home page first, then content pages. Opening one
// goes to the builder; creating one starts a draft that isn't on the site
// until it's published.

export interface PageRowView {
  readonly id: string;
  readonly kind: "HOME" | "STANDARD";
  readonly title: string;
  readonly handle: string;
  readonly status: "published" | "draft" | "changes";
  readonly updatedAt: string;
  readonly editHref: string;
}

const STATUS = {
  published: { label: "Published", tone: "success" },
  changes: { label: "Unpublished changes", tone: "warning" },
  draft: { label: "Not published", tone: "neutral" },
} as const;

export function PagesList({
  storeId,
  pages,
  canCreate,
  canPublish,
  builderBase,
}: {
  storeId: string;
  pages: readonly PageRowView[];
  canCreate: boolean;
  canPublish: boolean;
  builderBase: string;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<{
    page: PageRowView;
    action: "delete" | "unpublish";
  } | null>(null);

  async function create() {
    setPending(true);
    const result = await createPageAction(storeId, { title });
    setPending(false);
    if (result.ok) {
      setOpen(false);
      router.push(`${builderBase}/${result.data.pageId}`);
    } else
      setErrors(result.fieldErrors ?? { title: result.message ?? "The page couldn't be created." });
  }

  return (
    <>
      {canCreate ? (
        <div className="mb-4 flex justify-end">
          <Button
            leadingIcon={FilePlus2}
            onClick={() => {
              setOpen(true);
            }}
          >
            New page
          </Button>
        </div>
      ) : null}
      <StatusNotice
        notice={notice}
        onDismiss={() => {
          setNotice(null);
        }}
        className="mb-4"
      />
      <Card className="overflow-hidden p-0">
        <ul className="divide-y divide-line" aria-label="Pages">
          {pages.map((page) => (
            <li key={page.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link href={page.editHref} className="font-medium text-ink hover:underline">
                  {page.title}
                </Link>
                <p className="text-caption text-ink-muted">
                  {page.kind === "HOME" ? "Home page" : `/pages/${page.handle}`}
                </p>
              </div>
              <Badge tone={STATUS[page.status].tone}>{STATUS[page.status].label}</Badge>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    router.push(page.editHref);
                  }}
                >
                  Edit
                </Button>
                {canPublish && page.kind === "STANDARD" && page.status !== "draft" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setConfirm({ page, action: "unpublish" });
                    }}
                  >
                    Unpublish
                  </Button>
                ) : null}
                {canPublish && page.kind === "STANDARD" ? (
                  <Button
                    size="sm"
                    variant="danger-outline"
                    onClick={() => {
                      setConfirm({ page, action: "delete" });
                    }}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="New page"
        description="For pages like About, Contact, Shipping or Returns. It stays a draft until you publish it."
        footer={
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button pending={pending} onClick={() => void create()}>
              Create page
            </Button>
          </DialogFooter>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <Field label="Title" error={errors["title"] ?? errors["handle"]}>
            <Input
              value={title}
              maxLength={255}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
            />
          </Field>
        </form>
      </Dialog>

      <Dialog
        open={confirm !== null}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
        role="alertdialog"
        title={confirm?.action === "delete" ? "Delete this page?" : "Unpublish this page?"}
        description={
          confirm?.action === "delete"
            ? "It leaves your site now, and links to it stop showing. This can't be undone."
            : "It leaves your site now. Its draft stays, so you can publish it again."
        }
        footer={
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button
              variant="danger"
              onClick={() => {
                void (async () => {
                  if (!confirm) return;
                  const result =
                    confirm.action === "delete"
                      ? await deletePageAction(storeId, confirm.page.id)
                      : await unpublishPageAction(storeId, confirm.page.id);
                  setConfirm(null);
                  setNotice(
                    result.ok
                      ? { tone: "success", title: result.message ?? "Done." }
                      : { tone: "danger", title: result.message ?? "That didn't work." },
                  );
                  router.refresh();
                })();
              }}
            >
              {confirm?.action === "delete" ? "Delete page" : "Unpublish"}
            </Button>
          </DialogFooter>
        }
      >
        <p className="text-body-sm text-ink">{confirm?.page.title}</p>
      </Dialog>
    </>
  );
}
