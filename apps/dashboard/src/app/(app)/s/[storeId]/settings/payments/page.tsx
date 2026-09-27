import { getPaymentSettings, type PaymentConnectionView } from "@storevia/commerce";
import { hasPermission } from "@storevia/tenancy";
import { Alert, Badge, CardBody, type BadgeTone } from "@storevia/ui/surfaces";
import { FlaskConical, Lock, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { AccessNotice } from "@/components/areas/access-notice";
import {
  SettingsLayout,
  SettingsSection,
  type SettingsSectionLink,
} from "@/components/areas/settings";
import { LinkTabs } from "@/components/catalogue/link-tabs";
import { CopyField } from "@/components/settings/copy-field";
import {
  ConnectionActiveButton,
  ConnectTestPaymentsForm,
  RazorpayConnectForm,
} from "@/components/settings/payment-forms";
import { PageHeader } from "@/components/shell/app-shell";
import { env } from "@/lib/env";
import { settingsTabs } from "@/lib/settings-tabs";
import { storeContextOr404 } from "@/lib/tenant";

export const metadata: Metadata = { title: "Payment settings" };

const STATUS: Readonly<
  Record<PaymentConnectionView["status"], { readonly label: string; readonly tone: BadgeTone }>
> = {
  ACTIVE: { label: "Active", tone: "success" },
  PENDING: { label: "Pending", tone: "warning" },
  DISABLED: { label: "Disabled", tone: "neutral" },
  ERROR: { label: "Error", tone: "danger" },
};

const RAZORPAY_EVENTS = [
  "payment_link.paid",
  "payment_link.cancelled",
  "payment_link.expired",
] as const;

const CODE = "rounded-xs bg-subtle px-1 py-0.5 font-mono text-caption text-ink break-all";

export default async function PaymentSettingsPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const ctx = await storeContextOr404(storeId, `/s/${storeId}/settings/payments`);
  if (!hasPermission(ctx, "settings.manage")) {
    return (
      <>
        <PageHeader eyebrow={ctx.storeName} title="Payments" />
        <AccessNotice title="You don't have access to payment settings">
          Your role doesn&apos;t include managing store settings. Ask an owner or admin if you need
          it.
        </AccessNotice>
      </>
    );
  }
  const settings = await getPaymentSettings(ctx);
  const canEdit = ctx.storeStatus !== "ARCHIVED";
  const origin = env().DASHBOARD_URL;
  const webhookUrl = (c: PaymentConnectionView) => new URL(c.webhookPath, origin).toString();
  const offersRazorpay = settings.available.some((p) => p.key === "razorpay");
  const offersTest =
    settings.testPaymentsEnabled && settings.available.some((p) => p.key === "storevia-test");
  const hasTestConnection = settings.connections.some((c) => c.provider === "storevia-test");
  const razorpay = settings.connections.filter((c) => c.provider === "razorpay");
  const sections: SettingsSectionLink[] = [
    { id: "providers", label: "Connected providers" },
    ...(offersRazorpay ? [{ id: "razorpay", label: "Razorpay" }] : []),
    ...(offersTest ? [{ id: "test-payments", label: "Test payments" }] : []),
  ];
  return (
    <>
      <PageHeader
        eyebrow={ctx.storeName}
        title="Store settings"
        description="How shoppers pay you at checkout."
      />
      <LinkTabs
        label="Settings sections"
        className="mb-6 lg:mb-8"
        tabs={settingsTabs(ctx.storeId, "payments")}
      />
      {!canEdit ? (
        <Alert tone="neutral" icon={Lock} className="mb-6 max-w-3xl lg:mb-8">
          This store is archived, so its settings can&apos;t be changed.
        </Alert>
      ) : null}
      <SettingsLayout sections={sections}>
        <SettingsSection
          id="providers"
          title="Connected providers"
          description="Shoppers pay through your own provider account, and the money goes straight to you: Storevia never holds it. One provider is active at a time."
        >
          {settings.connections.length === 0 ? (
            <CardBody className="text-body-sm text-ink-muted">
              No payment provider connected yet. Until you connect one, shoppers can&apos;t pay at
              checkout.
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {settings.connections.map((c) => {
                const status = STATUS[c.status];
                const isTest = c.provider === "storevia-test";
                return (
                  <li
                    key={c.id}
                    data-testid="payment-connection-row"
                    className="space-y-4 px-5 py-5 sm:px-6"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="flex flex-wrap items-center gap-2 text-body-sm font-semibold text-ink">
                          {c.label}
                          {c.mode === "TEST" ? (
                            <Badge size="sm" tone="warning" icon={FlaskConical}>
                              Test mode
                            </Badge>
                          ) : (
                            <Badge size="sm" tone="brand">
                              Live
                            </Badge>
                          )}
                          <Badge size="sm" variant="dot" tone={status.tone}>
                            {status.label}
                          </Badge>
                        </h3>
                        {c.hint && !isTest ? (
                          <p className="mt-1 text-caption text-ink-muted">
                            Key <span className={CODE}>{c.hint}</span>
                          </p>
                        ) : null}
                        {c.mode === "TEST" ? (
                          <p className="mt-1 text-caption text-ink-muted">
                            {isTest
                              ? "Test mode: no real money moves."
                              : "Test mode: no real money moves. Connect live keys to take real payments."}
                          </p>
                        ) : null}
                      </div>
                      {canEdit ? (
                        <ConnectionActiveButton
                          storeId={storeId}
                          connectionId={c.id}
                          label={c.label}
                          active={c.status === "ACTIVE"}
                          disabled={!c.usable && c.status !== "ACTIVE"}
                        />
                      ) : null}
                    </div>
                    {!c.usable ? (
                      <Alert tone="warning" icon={TriangleAlert}>
                        {c.label} isn&apos;t available in this environment, so this connection
                        can&apos;t take payments here.
                      </Alert>
                    ) : null}
                    {c.status === "ERROR" ? (
                      <Alert tone="danger">
                        This connection stopped working. Enter its keys again below to reconnect.
                      </Alert>
                    ) : null}
                    {!isTest ? (
                      <CopyField
                        label="Webhook URL"
                        value={webhookUrl(c)}
                        hint={`Paste this into ${c.label}'s webhook settings, with this connection's webhook secret.`}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </SettingsSection>

        {offersRazorpay ? (
          <SettingsSection
            id="razorpay"
            title={razorpay.length > 0 ? "Update Razorpay keys" : "Connect Razorpay"}
            description="Take payments through your own Razorpay account, with the payment methods enabled on it."
          >
            <CardBody className="border-b border-line bg-subtle py-5">
              <ol className="list-decimal space-y-3 pl-5 text-body-sm text-ink-muted marker:text-ink-faint">
                <li>
                  <span className="font-medium text-ink">Use your own Razorpay account.</span> In
                  the Razorpay Dashboard, generate API keys: test mode keys to try things out, live
                  mode keys to take real payments. Payments settle from Razorpay to your bank
                  account; Storevia is never in the money flow.
                </li>
                <li>
                  <span className="font-medium text-ink">Connect here.</span> Enter the key ID, key
                  secret and a webhook secret you make up (a long random string). Test and live keys
                  are separate connections, each with its own webhook URL.
                </li>
                <li>
                  <span className="font-medium text-ink">Add the webhook in Razorpay.</span> Under
                  Webhooks, add the webhook URL shown for the connection above, enter the same
                  webhook secret and choose the events{" "}
                  {RAZORPAY_EVENTS.map((event, i) => (
                    <span key={event}>
                      <code className={CODE}>{event}</code>
                      {i < RAZORPAY_EVENTS.length - 2
                        ? ", "
                        : i === RAZORPAY_EVENTS.length - 2
                          ? " and "
                          : ""}
                    </span>
                  ))}
                  . Orders are created only when Razorpay confirms a payment this way.
                </li>
              </ol>
              {razorpay.map((c) => (
                <div key={c.id} className="mt-5">
                  <CopyField
                    label={`Webhook URL (${c.mode === "TEST" ? "test mode" : "live mode"})`}
                    value={webhookUrl(c)}
                  />
                </div>
              ))}
            </CardBody>
            {canEdit ? (
              <RazorpayConnectForm storeId={storeId} connected={razorpay.length > 0} />
            ) : null}
          </SettingsSection>
        ) : null}

        {offersTest ? (
          <SettingsSection
            id="test-payments"
            title="Test payments"
            description="A pretend payment page for trying checkout from start to finish, available only in development and test environments."
            actions={
              <Badge tone="warning" icon={FlaskConical}>
                Test mode — no real money moves
              </Badge>
            }
          >
            <CardBody className="text-body-sm text-ink-muted">
              {hasTestConnection
                ? "Test payments are connected. Enable or disable them under Connected providers."
                : "Shoppers get a test page where they choose whether the payment succeeds, fails or is cancelled. Connecting it makes it the active provider."}
            </CardBody>
            {canEdit && !hasTestConnection ? <ConnectTestPaymentsForm storeId={storeId} /> : null}
          </SettingsSection>
        ) : null}
      </SettingsLayout>
    </>
  );
}
