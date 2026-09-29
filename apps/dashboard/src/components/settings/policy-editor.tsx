"use client";

import { Button } from "@storevia/ui/button";
import { Alert, Card, CardBody, CardFooter } from "@storevia/ui/surfaces";
import type { JSONContent } from "@tiptap/react";
import { ListPlus, Scale } from "lucide-react";
import { useActionState, useEffect, useId, useState } from "react";
import { LazyRichTextEditor } from "@/components/catalogue/lazy-rich-text";
import { UnsavedChangesGuard } from "@/components/catalogue/unsaved-guard";
import { FormMessage, SubmitButton, TextField } from "@/components/forms";
import { isBlankDoc, policyOwnText } from "@/lib/policies";
import {
  policyAction,
  type PolicyActionState,
} from "@/app/(app)/s/[storeId]/settings/policies/actions";

// One store policy's editor (final pass, Phase 2A): title, the rich-text
// body, starter headings the merchant can insert (a template, never policy
// text), and save, publish and unpublish. Each save carries the revision
// this editor last saw, so a save over someone else's newer edit is refused.

export function PolicyEditor({
  storeId,
  handle,
  title,
  body,
  starter,
  revision: loadedRevision,
  published,
  canEdit,
}: {
  storeId: string;
  /** The policy's storefront handle (its URL segment here too). */
  handle: string;
  title: string;
  body: JSONContent | null;
  /** The starter document: section headings only. */
  starter: JSONContent;
  revision: number;
  /** Whether shoppers see a published version now. */
  published: boolean;
  canEdit: boolean;
}) {
  const [state, action] = useActionState<PolicyActionState, FormData>(
    policyAction.bind(null, storeId, handle),
    { ok: false },
  );
  const [doc, setDoc] = useState<JSONContent | null>(body);
  // Remounts the editor with new content (starter headings inserted).
  const [editorKey, setEditorKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const hintId = useId();
  useEffect(() => {
    if (state.revision !== undefined) setDirty(false);
  }, [state]);
  const revision = state.revision ?? loadedRevision;
  const hasOwnText = policyOwnText(doc).length > 0;

  const insertStarter = () => {
    const current = doc?.content ?? [];
    setDoc({
      type: "doc",
      content: isBlankDoc(doc)
        ? [...(starter.content ?? [])]
        : [...current, ...(starter.content ?? [])],
    });
    setEditorKey((k) => k + 1);
    setDirty(true);
  };

  return (
    <form action={action} noValidate>
      <UnsavedChangesGuard dirty={dirty} />
      <input type="hidden" name="revision" value={String(revision)} />
      <Card>
        <fieldset
          disabled={!canEdit}
          className="min-w-0 space-y-5 px-5 py-6 sm:px-6"
          onChange={() => {
            setDirty(true);
          }}
        >
          <legend className="sr-only">Policy</legend>
          <FormMessage state={state} />
          <TextField
            label="Title"
            name="title"
            defaultValue={title}
            maxLength={120}
            required
            state={state}
          />
          <LazyRichTextEditor
            key={editorKey}
            name="body"
            label="Policy text"
            defaultValue={doc}
            error={state.fieldErrors?.["body"]}
            disabled={!canEdit}
            placeholder="Write your policy in your own words."
            onChange={(next) => {
              setDoc(next);
              setDirty(true);
            }}
          />
        </fieldset>
        {canEdit ? (
          <CardBody className="space-y-3 border-t border-line bg-subtle py-5">
            <Alert tone="info" icon={Scale} title="Starter headings are a template">
              They&apos;re section headings only: Storevia doesn&apos;t provide legal wording. Write
              each section for your business in your own words, and consider having the text
              reviewed by a legal adviser.
            </Alert>
            <Button
              type="button"
              variant="secondary"
              leadingIcon={ListPlus}
              onClick={insertStarter}
            >
              Insert starter headings
            </Button>
          </CardBody>
        ) : null}
        {canEdit ? (
          <CardFooter className="justify-between">
            {!hasOwnText ? (
              <p id={hintId} className="text-body-sm text-ink-muted">
                Write the policy under the headings to publish it.
              </p>
            ) : null}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {published ? (
                <SubmitButton name="intent" value="unpublish" variant="ghost">
                  Unpublish
                </SubmitButton>
              ) : null}
              <SubmitButton name="intent" value="save" variant="secondary">
                Save draft
              </SubmitButton>
              <SubmitButton
                name="intent"
                value="publish"
                disabled={!hasOwnText}
                {...(!hasOwnText ? { "aria-describedby": hintId } : {})}
              >
                Publish
              </SubmitButton>
            </div>
          </CardFooter>
        ) : null}
      </Card>
    </form>
  );
}
