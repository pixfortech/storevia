"use client";

import {
  BUSINESS_TYPE_DEFINITIONS,
  isBusinessType,
  type BusinessType,
} from "@storevia/tenancy/business-types";
import {
  Badge,
  BusinessScene,
  Card,
  CardBody,
  CardHeader,
  cardClasses,
  Glyph,
  Icon,
} from "@storevia/ui";
import { normaliseSlug } from "@storevia/validation";
import { Globe } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";
import { BusinessTypePicker } from "@/components/business-type-picker";
import { FormMessage, SelectField, SubmitButton, TextField } from "@/components/forms";
import { BUSINESS_TYPE_GLYPH } from "@/lib/business-types";
import { COUNTRY_OPTIONS, CURRENCY_OPTIONS, LOCALE_OPTIONS, TIMEZONE_OPTIONS } from "@/lib/options";
import { createStoreAction } from "./actions";

/** A numbered step heading inside a card header. */
function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <span className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-caption font-semibold text-brand-700 ring-1 ring-brand-100 ring-inset"
      >
        {n}
      </span>
      {children}
    </span>
  );
}

/**
 * How the new store will look in the store list, updated as the form is
 * filled in. It restates the form, so assistive tech skips it.
 */
function StorePreview({
  type,
  name,
  address,
}: {
  type: BusinessType;
  name: string;
  address: string;
}) {
  return (
    <div aria-hidden="true">
      <p className="text-overline text-ink-faint uppercase">Preview</p>
      <div className={cardClasses("raised", "mt-3 overflow-hidden")}>
        <div className="flex h-36 items-end justify-center border-b border-line bg-subtle px-10 pt-8">
          <BusinessScene type={type} className="max-w-40" />
        </div>
        <div className="px-5 pt-4.5 pb-4">
          <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <span className="flex items-center gap-2 text-overline text-ink-faint uppercase">
              <Glyph name={BUSINESS_TYPE_GLYPH[type]} className="size-4" />
              {BUSINESS_TYPE_DEFINITIONS[type].label}
            </span>
            <Badge variant="dot" size="sm">
              Not launched
            </Badge>
          </p>
          <p className="mt-1.5 truncate font-display text-h4 text-ink">
            {name.trim() || "Your store"}
          </p>
          <p className="mt-5 flex min-w-0 items-center gap-2 text-body-sm text-ink-muted">
            <Icon icon={Globe} size="sm" className="text-ink-faint" />
            <span className="truncate">{address}</span>
          </p>
        </div>
      </div>
      <p className="mt-3 text-caption text-ink-faint">
        Your store starts unpublished. Visitors can&apos;t see it until storefronts launch.
      </p>
    </div>
  );
}

export function CreateStoreForm({
  orgId,
  rootDomain,
  defaults,
}: {
  orgId: string;
  rootDomain: string;
  defaults: { currency: string; locale: string; timezone: string; country: string };
}) {
  const [state, action] = useActionState(createStoreAction.bind(null, orgId), { ok: false });
  const chosen = state.values?.["businessType"] ?? "";
  const [type, setType] = useState<BusinessType>(isBusinessType(chosen) ? chosen : "ECOMMERCE");
  const [name, setName] = useState(state.values?.["name"] ?? "");
  const [slug, setSlug] = useState(state.values?.["slug"] ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  return (
    <form
      action={action}
      className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start xl:gap-10 2xl:gap-14"
      noValidate
    >
      <div className="min-w-0 max-w-3xl space-y-6">
        <FormMessage state={state} />
        <Card>
          <CardHeader
            title={<Step n={1}>What are you building?</Step>}
            description="It shapes the navigation, the home and suggested team roles."
          />
          <CardBody className="py-6">
            <BusinessTypePicker
              hideLegend
              defaultValue={type}
              error={state.fieldErrors?.["businessType"]}
              onChange={setType}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title={<Step n={2}>Store details</Step>}
            description="What people see, and where they find it."
          />
          <CardBody className="space-y-5 py-6">
            <TextField
              label="Store name"
              name="name"
              required
              state={state}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setName(value);
                if (!slugTouched) setSlug(normaliseSlug(value));
              }}
            />
            <TextField
              label="Store address"
              name="slug"
              required
              state={state}
              value={slug}
              autoComplete="off"
              spellCheck={false}
              addon={`.${rootDomain}`}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.currentTarget.value.toLowerCase());
              }}
              hint="Lowercase letters, numbers and hyphens. The address can't be changed, but you can connect your own domain later."
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title={<Step n={3}>Region and currency</Step>}
            description="Suggested from your organisation's country. Currency is fixed once the store is created."
          />
          <CardBody className="grid gap-5 py-6 sm:grid-cols-2">
            <SelectField
              label="Country"
              name="country"
              state={state}
              options={COUNTRY_OPTIONS}
              defaultValue={defaults.country}
            />
            <SelectField
              label="Currency"
              name="currency"
              state={state}
              options={CURRENCY_OPTIONS}
              defaultValue={defaults.currency}
              hint="Prices are shown and charged in this currency."
            />
            <SelectField
              label="Language"
              name="locale"
              state={state}
              options={LOCALE_OPTIONS}
              defaultValue={defaults.locale}
            />
            <SelectField
              label="Time zone"
              name="timezone"
              state={state}
              options={TIMEZONE_OPTIONS}
              defaultValue={defaults.timezone}
            />
          </CardBody>
        </Card>
        <div className="flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body-sm text-ink-muted">
            You can change everything except the address and currency later.
          </p>
          <SubmitButton size="lg" className="max-sm:w-full">
            Create store
          </SubmitButton>
        </div>
      </div>
      <div className="hidden xl:sticky xl:top-24 xl:block">
        <StorePreview type={type} name={name} address={`${slug || "your-store"}.${rootDomain}`} />
      </div>
    </form>
  );
}
