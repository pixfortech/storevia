"use client";

import {
  BUSINESS_TYPE_DEFINITIONS,
  isBusinessType,
  type BusinessType,
} from "@storevia/tenancy/business-types";
import { Button } from "@storevia/ui/button";
import { DescriptionList } from "@storevia/ui/data";
import { GlyphTile } from "@storevia/ui/icons";
import { CardBody, CardFooter } from "@storevia/ui/surfaces";
import { useActionState, useState } from "react";
import { ConfirmDialog } from "@/components/areas/confirm-dialog";
import { FieldGroup } from "@/components/areas/settings";
import { BusinessTypePicker } from "@/components/business-type-picker";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/components/forms";
import { BUSINESS_TYPE_GLYPH } from "@/lib/business-types";
import { LOCALE_OPTIONS, TIMEZONE_OPTIONS } from "@/lib/options";
import {
  archiveStoreAction,
  changeBusinessTypeAction,
  changeStoreSlugAction,
  setStorefrontLiveAction,
  updateStoreAction,
} from "./actions";

export function StoreSettingsForm({
  storeId,
  canEdit,
  values,
  fixed,
}: {
  storeId: string;
  canEdit: boolean;
  values: {
    name: string;
    locale: string;
    timezone: string;
    contactEmail: string;
    supportEmail: string;
  };
  /** Details set when the store was created, already formatted. */
  fixed: readonly { term: string; detail: string }[];
}) {
  const [state, action] = useActionState(updateStoreAction.bind(null, storeId), { ok: false });
  const withCurrent = <T extends { value: string; label: string }>(
    options: readonly T[],
    current: string,
  ) =>
    options.some((o) => o.value === current)
      ? options
      : [{ value: current, label: current }, ...options];
  return (
    <form action={action} noValidate>
      {/* Fixed facts first, so the Save footer sits right under the fields it saves. */}
      <CardBody className="border-b border-line bg-subtle py-6">
        <FieldGroup
          title="Set when the store was created"
          description="These can't be changed, so prices and your address stay consistent."
        >
          <DescriptionList layout="stacked" columns={2} items={fixed} className="gap-y-5" />
        </FieldGroup>
      </CardBody>
      <fieldset disabled={!canEdit} className="min-w-0">
        <CardBody className="space-y-8 py-6">
          <FieldGroup title="Store details">
            <TextField
              label="Store name"
              name="name"
              defaultValue={values.name}
              required
              state={state}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Contact email"
                name="contactEmail"
                type="email"
                defaultValue={values.contactEmail}
                state={state}
              />
              <TextField
                label="Support email"
                name="supportEmail"
                type="email"
                defaultValue={values.supportEmail}
                state={state}
              />
            </div>
          </FieldGroup>
          <FieldGroup title="Region" className="border-t border-line pt-8">
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                label="Language"
                name="locale"
                state={state}
                options={withCurrent(LOCALE_OPTIONS, values.locale)}
                defaultValue={values.locale}
              />
              <SelectField
                label="Time zone"
                name="timezone"
                state={state}
                options={withCurrent(TIMEZONE_OPTIONS, values.timezone)}
                defaultValue={values.timezone}
              />
            </div>
          </FieldGroup>
        </CardBody>
      </fieldset>
      {canEdit ? (
        <CardFooter className="justify-between">
          <FormMessage state={state} variant="inline" />
          <SubmitButton className="ml-auto">Save changes</SubmitButton>
        </CardFooter>
      ) : null}
    </form>
  );
}

export function ArchiveStoreForm({ storeId, storeName }: { storeId: string; storeName: string }) {
  const [state, action] = useActionState(archiveStoreAction.bind(null, storeId), { ok: false });
  return (
    <ConfirmDialog
      title={`Archive ${storeName}?`}
      description="The store disappears from your list. Its data is kept."
      confirmLabel="Archive"
      action={action}
      state={state}
      trigger={<Button variant="danger-outline">Archive store</Button>}
    />
  );
}

export function BusinessTypeForm({
  storeId,
  current,
  canEdit,
}: {
  storeId: string;
  current: BusinessType;
  canEdit: boolean;
}) {
  const [state, action] = useActionState(changeBusinessTypeAction.bind(null, storeId), {
    ok: false,
  });
  // Remount after each result so the radios reflect the saved (or rejected) value.
  const [seen, setSeen] = useState(state);
  const [version, setVersion] = useState(0);
  if (seen !== state) {
    setSeen(state);
    setVersion((v) => v + 1);
  }
  if (!canEdit) {
    const definition = BUSINESS_TYPE_DEFINITIONS[current];
    return (
      <CardBody className="flex items-center gap-4 py-6">
        <GlyphTile name={BUSINESS_TYPE_GLYPH[current]} size="lg" />
        <div className="min-w-0">
          <p className="text-body-sm font-semibold text-ink">{definition.label}</p>
          <p className="mt-0.5 text-body-sm text-ink-muted">{definition.tagline}</p>
        </div>
      </CardBody>
    );
  }
  const chosen = state.values?.["businessType"] ?? "";
  return (
    <form key={version} action={action} noValidate>
      <CardBody className="py-6">
        <BusinessTypePicker
          legend="This store is a…"
          hideLegend
          defaultValue={!state.ok && isBusinessType(chosen) ? chosen : current}
          error={state.fieldErrors?.["businessType"]}
        />
      </CardBody>
      <CardFooter className="justify-between">
        <FormMessage state={state} variant="inline" />
        <SubmitButton variant="secondary" className="ml-auto">
          Update business type
        </SubmitButton>
      </CardFooter>
    </form>
  );
}

/** Go live / back to coming soon (ADR-0028 §3). */
export function StorefrontStatusForm({
  storeId,
  live,
  canEdit,
}: {
  storeId: string;
  live: boolean;
  canEdit: boolean;
}) {
  const [state, action] = useActionState(setStorefrontLiveAction.bind(null, storeId), {
    ok: false,
  });
  return (
    <form action={action}>
      <input type="hidden" name="live" value={live ? "false" : "true"} />
      <CardFooter className="justify-between">
        <FormMessage state={state} variant="inline" />
        {canEdit ? (
          <SubmitButton variant={live ? "secondary" : "primary"} className="ml-auto">
            {live ? "Switch to coming soon" : "Go live"}
          </SubmitButton>
        ) : null}
      </CardFooter>
    </form>
  );
}

/** Changes the store address; the old address keeps redirecting (ADR-0028 §12). */
export function StoreAddressForm({
  storeId,
  slug,
  rootDomain,
}: {
  storeId: string;
  slug: string;
  rootDomain: string;
}) {
  const [state, action] = useActionState(changeStoreSlugAction.bind(null, storeId), {
    ok: false,
  });
  return (
    <form action={action} noValidate>
      <CardBody className="py-6">
        <TextField
          label="Store address"
          name="slug"
          defaultValue={state.values?.["slug"] ?? slug}
          required
          state={state}
          hint={`Your store is served at <address>.${rootDomain}. Links to the old address keep working: they redirect to the new one, and no other store can ever take it.`}
        />
      </CardBody>
      <CardFooter className="justify-between">
        <FormMessage state={state} variant="inline" />
        <SubmitButton variant="secondary" className="ml-auto">
          Change address
        </SubmitButton>
      </CardFooter>
    </form>
  );
}
