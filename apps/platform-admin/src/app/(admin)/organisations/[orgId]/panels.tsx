"use client";

import { Alert, Button, Dialog, DialogClose, type ButtonProps } from "@storevia/ui";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import {
  CheckboxField,
  FormMessage,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
  type FormState,
} from "@/components/forms";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export interface PlanOption {
  readonly key: string;
  readonly name: string;
  readonly trialDays: number;
}

export interface FeatureOption {
  readonly key: string;
  readonly name: string;
  readonly type: "BOOLEAN" | "LIMIT" | "CONFIGURATION";
}

export interface SubscriptionSummary {
  readonly id: string; // sub_… public ID
  readonly status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";
  readonly planKey: string;
  readonly billingInterval: string | null;
  readonly trialEndsAt: string; // yyyy-mm-dd or ""
  readonly expiresAt: string;
  readonly defaultAccessEnd: string;
}

const INTERVALS = [
  { value: "MONTH", label: "Monthly" },
  { value: "YEAR", label: "Annual" },
  { value: "NONE", label: "Not billed on a cycle" },
];

const EXPIRY_MODES = [
  { value: "none", label: "No expiry" },
  { value: "date", label: "Expire automatically on a date" },
];

/** Reason (required) and internal notes, on every staff change. */
function ReasonFields({ state }: { state: FormState }) {
  return (
    <>
      <TextAreaField
        label="Reason"
        name="reason"
        state={state}
        rows={2}
        required
        hint="Required. Recorded in the audit log and subscription history."
      />
      <TextAreaField
        label="Internal notes"
        name="note"
        state={state}
        rows={2}
        hint="Optional. Visible to Storevia staff only."
      />
    </>
  );
}

/** Over-limit acknowledgement, shown once the server reports it is needed. */
function OverLimitAck({ state }: { state: FormState }) {
  if (!state.fieldErrors?.["acknowledgeOverLimit"]) return null;
  return (
    <CheckboxField
      name="acknowledgeOverLimit"
      state={{ ...state, fieldErrors: {} }}
      label="I understand the organisation will be over its plan limits. No data is deleted; new resources are blocked until usage fits."
    />
  );
}

function ActionDialog({
  label,
  title,
  description,
  action,
  submitLabel,
  variant = "secondary",
  testId,
  children,
}: {
  label: string;
  title: string;
  description?: string;
  action: Action;
  submitLabel: string;
  variant?: ButtonProps["variant"];
  testId?: string;
  children: (state: FormState) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, { ok: false });
  const [shown, setShown] = useState<FormState | null>(null);
  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      setShown(state);
    }
  }, [state]);
  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setShown(null);
        }}
        title={title}
        {...(description ? { description } : {})}
        trigger={
          <Button type="button" size="sm" variant={variant} data-testid={testId}>
            {label}
          </Button>
        }
      >
        <form action={formAction} className="space-y-4" noValidate>
          {state.ok ? null : <FormMessage state={state} />}
          {children(state)}
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Close
              </Button>
            </DialogClose>
            <SubmitButton variant={variant === "danger" ? "danger" : "primary"}>
              {submitLabel}
            </SubmitButton>
          </div>
        </form>
      </Dialog>
      {shown ? (
        <div className="basis-full">
          <FormMessage state={shown} />
        </div>
      ) : null}
    </>
  );
}

export function SubscriptionActions({
  subscription,
  plans,
  actions,
}: {
  subscription: SubscriptionSummary | null;
  plans: readonly PlanOption[];
  actions: {
    assign: Action;
    change: Action;
    activate: Action;
    cancel: Action;
    expire: Action;
  };
}) {
  const planOptions = plans.map((p) => ({ value: p.key, label: p.name }));
  if (!subscription) {
    return (
      <div className="flex flex-wrap gap-2">
        {(["ACTIVE", "TRIAL"] as const).map((status) => (
          <ActionDialog
            key={status}
            label={status === "TRIAL" ? "Start trial" : "Assign plan"}
            title={status === "TRIAL" ? "Start a trial" : "Assign a plan"}
            description="Creates a manual subscription. Dates are in UTC."
            action={actions.assign}
            submitLabel={status === "TRIAL" ? "Start trial" : "Assign plan"}
            variant={status === "TRIAL" ? "secondary" : "primary"}
            testId={status === "TRIAL" ? "start-trial" : "assign-plan"}
          >
            {(state) => (
              <>
                <input type="hidden" name="status" value={status} />
                <SelectField label="Plan" name="planKey" state={state} options={planOptions} />
                <SelectField
                  label="Billing interval"
                  name="billingInterval"
                  state={state}
                  options={INTERVALS}
                />
                <TextField
                  label="Subscription start"
                  name="startedAt"
                  type="date"
                  state={state}
                  hint="Leave empty to start now. Can't be in the future."
                />
                {status === "TRIAL" ? (
                  <TextField
                    label="Trial ends"
                    name="trialEndsAt"
                    type="date"
                    state={state}
                    hint="Leave empty for the plan's default trial length."
                  />
                ) : null}
                <SelectField
                  label="Expiry"
                  name="expiryMode"
                  state={state}
                  options={EXPIRY_MODES}
                />
                <TextField label="Expires on" name="expiresAt" type="date" state={state} />
                <ReasonFields state={state} />
              </>
            )}
          </ActionDialog>
        ))}
      </div>
    );
  }

  const { status } = subscription;
  const hidden = <input type="hidden" name="subscriptionId" value={subscription.id} />;
  return (
    <div className="flex flex-wrap gap-2">
      <ActionDialog
        label="Change plan"
        title="Change the subscription"
        description="Upgrades apply immediately. A downgrade never deletes data."
        action={actions.change}
        submitLabel="Save changes"
        testId="change-plan"
      >
        {(state) => (
          <>
            {hidden}
            <SelectField
              label="Plan"
              name="planKey"
              state={state}
              options={planOptions}
              defaultValue={subscription.planKey}
            />
            <SelectField
              label="Billing interval"
              name="billingInterval"
              state={state}
              options={INTERVALS}
              defaultValue={subscription.billingInterval ?? "NONE"}
            />
            {status === "TRIAL" ? (
              <TextField
                label="Trial ends"
                name="trialEndsAt"
                type="date"
                state={state}
                defaultValue={subscription.trialEndsAt}
              />
            ) : null}
            {status === "CANCELLED" ? (
              <>
                <input type="hidden" name="expiryMode" value="date" />
                <TextField
                  label="Access ends"
                  name="expiresAt"
                  type="date"
                  state={state}
                  defaultValue={subscription.expiresAt}
                />
              </>
            ) : (
              <>
                <SelectField
                  label="Expiry"
                  name="expiryMode"
                  state={state}
                  options={EXPIRY_MODES}
                  defaultValue={subscription.expiresAt ? "date" : "none"}
                />
                <TextField
                  label="Expires on"
                  name="expiresAt"
                  type="date"
                  state={state}
                  defaultValue={subscription.expiresAt}
                />
              </>
            )}
            <OverLimitAck state={state} />
            <ReasonFields state={state} />
          </>
        )}
      </ActionDialog>

      {status === "TRIAL" || status === "PAST_DUE" || status === "CANCELLED" ? (
        <ActionDialog
          label={status === "CANCELLED" ? "Reactivate" : "Activate"}
          title={
            status === "CANCELLED" ? "Reactivate the subscription" : "Activate the subscription"
          }
          action={actions.activate}
          submitLabel="Activate"
          testId="activate"
        >
          {(state) => (
            <>
              {hidden}
              <SelectField
                label="Expiry"
                name="expiryMode"
                state={state}
                options={EXPIRY_MODES}
                defaultValue={status !== "CANCELLED" && subscription.expiresAt ? "date" : "none"}
              />
              <TextField
                label="Expires on"
                name="expiresAt"
                type="date"
                state={state}
                defaultValue={status === "CANCELLED" ? "" : subscription.expiresAt}
              />
              <ReasonFields state={state} />
            </>
          )}
        </ActionDialog>
      ) : null}

      {status === "TRIAL" || status === "ACTIVE" || status === "PAST_DUE" ? (
        <ActionDialog
          label="Cancel"
          title="Cancel the subscription"
          description="The organisation keeps its plan until access ends, then falls back to system defaults."
          action={actions.cancel}
          submitLabel="Cancel subscription"
          testId="cancel"
        >
          {(state) => (
            <>
              {hidden}
              <TextField
                label="Access ends"
                name="accessEndsAt"
                type="date"
                state={state}
                defaultValue={subscription.defaultAccessEnd}
              />
              <ReasonFields state={state} />
            </>
          )}
        </ActionDialog>
      ) : null}

      <ActionDialog
        label="Expire now"
        title="Expire the subscription now"
        description="Entitlements end immediately and system defaults apply. Data is never deleted."
        action={actions.expire}
        submitLabel="Expire now"
        variant="danger"
        testId="expire"
      >
        {(state) => (
          <>
            {hidden}
            <OverLimitAck state={state} />
            <ReasonFields state={state} />
          </>
        )}
      </ActionDialog>
    </div>
  );
}

const MODES: Record<FeatureOption["type"], { value: string; label: string }[]> = {
  BOOLEAN: [
    { value: "enabled", label: "Enabled" },
    { value: "disabled", label: "Disabled" },
  ],
  LIMIT: [
    { value: "limit", label: "Limit" },
    { value: "unlimited", label: "Unlimited" },
    { value: "disabled", label: "Disabled (limit 0)" },
  ],
  CONFIGURATION: [
    { value: "config", label: "Configuration (JSON)" },
    { value: "disabled", label: "Disabled" },
  ],
};

function OverrideFields({
  state,
  features,
  initial,
}: {
  state: FormState;
  features: readonly FeatureOption[];
  initial?: { featureKey: string; mode: string; limit: string; config: string; expiresAt: string };
}) {
  const [featureKey, setFeatureKey] = useState(
    state.values?.["featureKey"] ?? initial?.featureKey ?? features[0]?.key ?? "",
  );
  const feature = features.find((f) => f.key === featureKey);
  const [mode, setMode] = useState(
    state.values?.["mode"] ?? initial?.mode ?? MODES[feature?.type ?? "BOOLEAN"][0]?.value ?? "",
  );
  const modes = MODES[feature?.type ?? "BOOLEAN"];
  return (
    <>
      {initial ? (
        <input type="hidden" name="featureKey" value={featureKey} />
      ) : (
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-ink">Feature</span>
          <select
            name="featureKey"
            value={featureKey}
            onChange={(e) => {
              setFeatureKey(e.target.value);
              const next = features.find((f) => f.key === e.target.value);
              setMode(MODES[next?.type ?? "BOOLEAN"][0]?.value ?? "");
            }}
            className="block h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-sm"
          >
            {features.map((f) => (
              <option key={f.key} value={f.key}>
                {f.name} ({f.type.toLowerCase()})
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block space-y-1.5 text-sm">
        <span className="font-medium text-ink">Value</span>
        <select
          name="mode"
          value={modes.some((m) => m.value === mode) ? mode : (modes[0]?.value ?? "")}
          onChange={(e) => {
            setMode(e.target.value);
          }}
          className="block h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-sm"
        >
          {modes.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        {state.fieldErrors?.["mode"] ? (
          <span className="text-danger-700">{state.fieldErrors["mode"]}</span>
        ) : null}
      </label>
      {mode === "limit" ? (
        <TextField
          label="Limit"
          name="limit"
          inputMode="numeric"
          state={state}
          defaultValue={initial?.limit ?? ""}
        />
      ) : null}
      {mode === "config" ? (
        <TextAreaField
          label="Configuration (JSON object)"
          name="config"
          state={state}
          placeholder='{"retentionDays": 90}'
        />
      ) : null}
      <SelectField
        label="Expiry"
        name="expiryMode"
        state={state}
        options={EXPIRY_MODES}
        defaultValue={initial?.expiresAt ? "date" : "none"}
      />
      <TextField
        label="Expires on"
        name="expiresAt"
        type="date"
        state={state}
        defaultValue={initial?.expiresAt ?? ""}
      />
      <TextAreaField
        label="Reason"
        name="reason"
        state={state}
        rows={2}
        required
        hint="Required. Recorded in the audit log."
      />
    </>
  );
}

export interface OverrideRow {
  readonly featureKey: string;
  readonly featureName: string;
  readonly value: string;
  readonly mode: string;
  readonly limit: string;
  readonly config: string;
  readonly reason: string;
  readonly expiresAt: string;
  readonly expiresLabel: string;
  readonly expired: boolean;
  readonly byline: string;
}

export function OverrideManager({
  overrides,
  features,
  canManage,
  actions,
}: {
  overrides: readonly OverrideRow[];
  features: readonly FeatureOption[];
  canManage: boolean;
  actions: { set: Action; remove: Action };
}) {
  return (
    <div className="space-y-4">
      {overrides.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No overrides. The plan (or system default) applies to every feature.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="py-2 pr-4 font-medium">Feature</th>
                <th className="py-2 pr-4 font-medium">Value</th>
                <th className="py-2 pr-4 font-medium">Reason</th>
                <th className="py-2 pr-4 font-medium">Expires</th>
                {canManage ? (
                  <th className="py-2 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {overrides.map((o) => (
                <tr key={o.featureKey} data-testid="override-row">
                  <td className="py-2 pr-4 font-medium">{o.featureName}</td>
                  <td className="py-2 pr-4">{o.value}</td>
                  <td className="py-2 pr-4">
                    <span className="block">{o.reason}</span>
                    <span className="block text-xs text-ink-muted">{o.byline}</span>
                  </td>
                  <td className={`py-2 pr-4 ${o.expired ? "text-danger-700" : ""}`}>
                    {o.expiresLabel}
                  </td>
                  {canManage ? (
                    <td className="py-2">
                      <div className="flex flex-wrap justify-end gap-2">
                        <ActionDialog
                          label="Edit"
                          title={`Edit override: ${o.featureName}`}
                          action={actions.set}
                          submitLabel="Save override"
                        >
                          {(state) => (
                            <OverrideFields
                              state={state}
                              features={features}
                              initial={{
                                featureKey: o.featureKey,
                                mode: o.mode,
                                limit: o.limit,
                                config: o.config,
                                expiresAt: o.expiresAt,
                              }}
                            />
                          )}
                        </ActionDialog>
                        <ActionDialog
                          label="Remove"
                          title={`Remove override: ${o.featureName}`}
                          description="The feature falls back to the plan, or the system default."
                          action={actions.remove}
                          submitLabel="Remove override"
                          variant="danger"
                        >
                          {(state) => (
                            <>
                              <input type="hidden" name="featureKey" value={o.featureKey} />
                              <TextAreaField
                                label="Reason"
                                name="reason"
                                state={state}
                                rows={2}
                                required
                              />
                            </>
                          )}
                        </ActionDialog>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <ActionDialog
            label="Add override"
            title="Add an entitlement override"
            description="Overrides replace the plan's value for this organisation only. Use them instead of creating per-customer plans."
            action={actions.set}
            submitLabel="Save override"
            testId="add-override"
          >
            {(state) => <OverrideFields state={state} features={features} />}
          </ActionDialog>
        </div>
      ) : null}
    </div>
  );
}

const SIMULATIONS = [
  { value: "created", label: "subscription.created" },
  { value: "activated", label: "subscription.activated" },
  { value: "renewed", label: "subscription.renewed" },
  { value: "upgraded", label: "subscription.upgraded" },
  { value: "downgraded", label: "subscription.downgraded" },
  { value: "past_due", label: "subscription.past_due" },
  { value: "payment_recovered", label: "subscription.payment_recovered" },
  { value: "cancelled", label: "subscription.cancelled" },
  { value: "reactivated", label: "subscription.reactivated" },
  { value: "expired", label: "subscription.expired" },
  { value: "duplicate", label: "Fault: duplicate of the last event" },
  { value: "replayed", label: "Fault: replayed (stale signature)" },
  { value: "out_of_order", label: "Fault: out-of-order (older event)" },
  { value: "invalid_signature", label: "Fault: invalid signature" },
  { value: "invalid_schema", label: "Fault: invalid payload" },
  { value: "unknown_subscription", label: "Fault: unknown subscription" },
];

export function SimulationPanel({
  plans,
  action,
}: {
  plans: readonly PlanOption[];
  action: Action;
}) {
  const [state, formAction] = useActionState(action, { ok: false });
  return (
    <form action={formAction} className="space-y-4" noValidate data-testid="simulation-form">
      <Alert tone="warning">
        Test billing only. Events are signed by the mock provider and delivered to the real webhook
        pipeline. Never available in production.
      </Alert>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Event" name="kind" state={state} options={SIMULATIONS} />
        <SelectField
          label="Plan (created, upgraded, downgraded)"
          name="planKey"
          state={state}
          options={plans.map((p) => ({ value: p.key, label: p.name }))}
        />
        <SelectField
          label="Billing interval"
          name="billingInterval"
          state={state}
          options={INTERVALS.filter((i) => i.value !== "NONE")}
        />
        <TextField
          label="Trial days (created)"
          name="trialDays"
          type="number"
          min={0}
          max={90}
          state={state}
          defaultValue="0"
        />
      </div>
      <SubmitButton variant="secondary">Send event</SubmitButton>
    </form>
  );
}

export function ReconcileButton({ action }: { action: (prev: FormState) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, { ok: false });
  return (
    <form action={formAction} className="space-y-3">
      <FormMessage state={state} />
      <SubmitButton size="sm" variant="ghost">
        Recalculate usage
      </SubmitButton>
    </form>
  );
}
