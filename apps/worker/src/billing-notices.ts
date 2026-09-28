import "server-only";
import { workerDb } from "@storevia/database/worker";
import { billingNoticeMessage, getEmailSender, type BillingNoticeKind } from "@storevia/email";
import type { JobDefinition } from "@storevia/jobs";
import { logger, recordMetric } from "@storevia/observability";
import { toTypeId } from "@storevia/types";

// Billing notices (M8): trial ending (3 days ahead), payment overdue (with
// the grace end) and plan ended, emailed to the organisation's owners and
// billing address. The database decides what is due and keeps a ledger
// keyed on the subscription and the date, so a notice goes once per date:
// a grace extension or a new trial notifies again. A claim is taken before
// sending (two workers never both send) and released if sending fails.

const log = logger.child({ component: "billing-notices" });
const BATCH = 100;

interface DueNotice {
  readonly dedupe_key: string;
  readonly kind: BillingNoticeKind;
  readonly organisation_id: string;
  readonly subscription_id: string;
  readonly organisation_name: string;
  readonly plan_name: string;
  readonly due_at: Date;
  readonly recipients: string[];
}

export async function sendBillingNotices(
  send: (message: ReturnType<typeof billingNoticeMessage>) => Promise<unknown> = (m) =>
    getEmailSender().send(m),
): Promise<{ sent: number; failed: number; skipped: number }> {
  const db = workerDb();
  const due = await db.$queryRaw<DueNotice[]>`
    SELECT dedupe_key, kind, organisation_id, subscription_id, organisation_name, plan_name,
      due_at, recipients
    FROM app_billing_notices_due(${BATCH}::int)`;
  const dashboard = process.env["DASHBOARD_URL"]?.replace(/\/+$/, "") ?? null;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const notice of due) {
    const [claim] = await db.$queryRaw<{ claimed: boolean }[]>`
      SELECT app_claim_billing_notice(${notice.dedupe_key}, ${notice.kind},
        ${notice.organisation_id}::uuid, ${notice.subscription_id}::uuid) AS claimed`;
    if (!claim?.claimed) {
      skipped += 1;
      continue;
    }
    let ok = notice.recipients.length > 0;
    for (const to of notice.recipients) {
      try {
        await send(
          billingNoticeMessage(to, {
            kind: notice.kind,
            organisationName: notice.organisation_name,
            planName: notice.plan_name,
            date: notice.due_at,
            billingUrl: dashboard
              ? `${dashboard}/o/${toTypeId("organisation", notice.organisation_id)}/billing`
              : null,
          }),
        );
      } catch (error) {
        ok = false;
        log.warn("billing notice not sent", {
          kind: notice.kind,
          organisationId: notice.organisation_id,
          error,
        });
        break;
      }
    }
    await db.$executeRaw`SELECT app_complete_billing_notice(${notice.dedupe_key}, ${ok})`;
    if (ok) sent += 1;
    else failed += 1;
  }
  if (sent > 0) recordMetric("billing.notices_sent", sent);
  if (failed > 0) recordMetric("billing.notices_failed", failed);
  return { sent, failed, skipped };
}

export const billingNoticesJob: JobDefinition = {
  name: "billing.notices",
  schedule: { everySeconds: 3600 },
  maxAttempts: 2,
  timeoutMs: 10 * 60_000,
  async run() {
    return { ...(await sendBillingNotices()) };
  },
};
