"use client";

import {
  BUSINESS_TYPE_DEFINITIONS,
  isBusinessType,
  isLaunchBusinessType,
  LAUNCH_BUSINESS_TYPES,
  type BusinessType,
} from "@storevia/tenancy/business-types";
import { Button } from "@storevia/ui/button";
import { DescriptionList } from "@storevia/ui/data";
import { GlyphTile } from "@storevia/ui/icons";
import { countryByCode } from "@storevia/validation/geo";
import { CardBody, CardFooter } from "@storevia/ui/surfaces";
import { useActionState, useState } from "react";
import { ConfirmDialog } from "@/components/areas/confirm-dialog";
import { FieldGroup } from "@/components/areas/settings";
import { BusinessTypePicker } from "@/components/business-type-picker";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/components/forms";
import { BUSINESS_TYPE_GLYPH } from "@/lib/business-types";
import { COUNTRY_OPTIONS, localeOptionsFor, TIMEZONE_OPTIONS } from "@/lib/options";
import {
  archiveStoreAction,
  changeBusinessTypeAction,
  changeStoreSlugAction,
  setStorefrontLiveAction,
  updateSellerAction,
  updateStoreAction,
} from "./actions";

export function StoreSettingsForm({
  storeId,
  canEdit,
  values,
  fixed,
  replyTo,
}: {
  storeId: string;
  canEdit: boolean;
  /** Where shoppers' replies to order emails go today (from the saved settings). */
  replyTo: { address: string; source: "support" | "contact" | "platform" };
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
            <p className="text-body-sm text-ink-muted" data-testid="reply-to-note">
              Shoppers&apos; replies to order emails go to{" "}
              <span className="font-medium text-ink">{replyTo.address}</span>
              {replyTo.source === "support"
                ? " (your support email)."
                : replyTo.source === "contact"
                  ? " (your contact email; a support email takes its place when set)."
                  : ", Storevia's address, because this store has no support or contact email. Add one so replies reach you."}
            </p>
          </FieldGroup>
          <FieldGroup title="Region" className="border-t border-line pt-8">
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                label="Language"
                name="locale"
                state={state}
                options={localeOptionsFor(values.locale)}
                defaultValue={values.locale}
                hint="Your storefront and emails are in English. This sets how dates and numbers look."
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

export interface SellerValues {
  readonly legalName: string;
  readonly phone: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly countryCode: string;
  readonly gstin: string;
}

/**
 * The store's public seller identity (final pass, Phase 2A). The state or
 * region is a list for countries that have one, else free text; the server
 * checks every field again.
 */
export function SellerDetailsForm({
  storeId,
  canEdit,
  values,
}: {
  storeId: string;
  canEdit: boolean;
  values: SellerValues;
}) {
  const [state, action] = useActionState(updateSellerAction.bind(null, storeId), { ok: false });
  const [country, setCountry] = useState(state.values?.["countryCode"] ?? values.countryCode);
  const geo = countryByCode(country);
  const regions = geo?.regions ?? null;
  const regionLabel = geo?.regionLabel ?? "State or region";
  return (
    <form action={action} noValidate>
      <fieldset disabled={!canEdit} className="min-w-0">
        <legend className="sr-only">Seller details</legend>
        <CardBody className="space-y-8 py-6">
          <FieldGroup title="Business">
            <TextField
              label="Legal or business name"
              name="legalName"
              defaultValue={values.legalName}
              autoComplete="organization"
              maxLength={200}
              state={state}
              hint="The name shoppers are buying from, as registered."
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Phone"
                name="phone"
                type="tel"
                defaultValue={values.phone}
                autoComplete="tel"
                state={state}
              />
              <TextField
                label="GSTIN (optional)"
                name="gstin"
                defaultValue={values.gstin}
                autoCapitalize="characters"
                maxLength={20}
                state={state}
                hint="Checked and kept with your store. It isn't shown to shoppers or used to calculate tax."
              />
            </div>
          </FieldGroup>
          <FieldGroup title="Business address" className="border-t border-line pt-8">
            <TextField
              label="Address line 1"
              name="addressLine1"
              defaultValue={values.addressLine1}
              autoComplete="address-line1"
              maxLength={200}
              state={state}
            />
            <TextField
              label="Address line 2 (optional)"
              name="addressLine2"
              defaultValue={values.addressLine2}
              autoComplete="address-line2"
              maxLength={200}
              state={state}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="City"
                name="city"
                defaultValue={values.city}
                autoComplete="address-level2"
                maxLength={100}
                state={state}
              />
              <TextField
                label={geo?.postalCode?.label ?? "Postal code"}
                name="postalCode"
                defaultValue={values.postalCode}
                autoComplete="postal-code"
                maxLength={20}
                state={state}
              />
              <SelectField
                label="Country"
                name="countryCode"
                state={state}
                options={[{ value: "", label: "Choose a country" }, ...COUNTRY_OPTIONS]}
                value={country}
                onChange={(event) => {
                  setCountry(event.currentTarget.value);
                }}
              />
              {regions ? (
                <SelectField
                  key={country}
                  label={regionLabel}
                  name="region"
                  state={state}
                  options={[
                    { value: "", label: `Choose a ${regionLabel.toLowerCase()}` },
                    ...regions.map((r) => ({ value: r.code, label: r.name })),
                  ]}
                  defaultValue={country === values.countryCode ? values.region : ""}
                />
              ) : (
                <TextField
                  key={country}
                  label="State or region (optional)"
                  name="region"
                  defaultValue={country === values.countryCode ? values.region : ""}
                  autoComplete="address-level1"
                  maxLength={100}
                  state={state}
                />
              )}
            </div>
          </FieldGroup>
        </CardBody>
      </fieldset>
      {canEdit ? (
        <CardFooter className="justify-between">
          <FormMessage state={state} variant="inline" />
          <SubmitButton className="ml-auto">Save seller details</SubmitButton>
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
  // Only the launch types are offered (DB-2); a store with another type may
  // keep it or move to a launch type. With nothing else to choose, there's no form.
  const offered: readonly BusinessType[] = isLaunchBusinessType(current)
    ? LAUNCH_BUSINESS_TYPES
    : [current, ...LAUNCH_BUSINESS_TYPES];
  if (!canEdit || offered.length === 1) {
    const definition = BUSINESS_TYPE_DEFINITIONS[current];
    return (
      <CardBody className="flex items-center gap-4 py-6">
        <GlyphTile name={BUSINESS_TYPE_GLYPH[current]} size="lg" />
        <div className="min-w-0">
          <p className="text-body-sm font-semibold text-ink">{definition.label}</p>
          <p className="mt-0.5 text-body-sm text-ink-muted">{definition.tagline}</p>
          {/* The change that just moved the store here, confirmed. */}
          {state.ok && state.message ? (
            <p role="status" className="mt-2 text-body-sm text-success-700">
              {state.message}
            </p>
          ) : null}
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
          defaultValue={
            !state.ok && isBusinessType(chosen) && offered.includes(chosen) ? chosen : current
          }
          types={offered}
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
  blocked = false,
}: {
  storeId: string;
  live: boolean;
  canEdit: boolean;
  /** A launch check is missing: going live is refused (on the server too). */
  blocked?: boolean;
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
          <SubmitButton
            variant={live ? "secondary" : "primary"}
            className="ml-auto"
            disabled={blocked}
            {...(blocked ? { "aria-describedby": "launch-readiness-title" } : {})}
          >
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
