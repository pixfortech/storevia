// Billing notices (M8) with the real worker role: what is due, who gets it,
// once per date, again for a new date, and never lost when sending fails.
import { disconnectTestClients, migratorDb, truncateAll } from "@storevia/database/testing";
import type { EmailMessage } from "@storevia/email";
import { createOrganisation, type Principal } from "@storevia/tenancy";
import { uuidv7 } from "@storevia/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sendBillingNotices } from "../src/billing-notices";

const DAY = 86_400_000;
const at = (days: number) => new Date(Date.now() + days * DAY);

async function makeUser(label: string): Promise<Principal> {
  const email = `${label}-${uuidv7().slice(-6)}@example.test`;
  const user = await migratorDb().user.create({
    data: { id: uuidv7(), email, name: `User ${label}`, emailVerified: true },
  });
  return {
    userId: user.id,
    email,
    name: user.name,
    emailVerified: true,
    recentlyAuthenticated: false,
  };
}

async function org(label: string, subscription: Record<string, unknown>, billingEmail?: string) {
  const owner = await makeUser(label);
  const { organisationId } = await createOrganisation(owner, { name: `Org ${label}` });
  if (billingEmail) {
    await migratorDb().organisation.update({
      where: { id: organisationId },
      data: { billingEmail },
    });
  }
  const plan = await migratorDb().plan.findUniqueOrThrow({ where: { key: "business" } });
  const sub = await migratorDb().subscription.create({
    data: {
      organisationId,
      planId: plan.id,
      source: "MANUAL",
      startedAt: at(-40),
      status: "ACTIVE",
      ...subscription,
    },
  });
  return { owner, organisationId, subscriptionId: sub.id };
}

let outbox: EmailMessage[];
const capture = (message: EmailMessage) => {
  outbox.push(message);
  return Promise.resolve();
};

beforeEach(async () => {
  await truncateAll();
  outbox = [];
  process.env["DASHBOARD_URL"] = "https://app.storevia.test";
});

afterAll(disconnectTestClients);

describe("billing notices", () => {
  it("emails owners and the billing address what is due, once per date", async () => {
    const trial = await org(
      "trial",
      { status: "TRIAL", trialStartsAt: at(-12), trialEndsAt: at(2) },
      "accounts@trial.test",
    );
    const overdue = await org("overdue", {
      status: "PAST_DUE",
      pastDueSince: at(-3),
      graceEndsAt: at(5),
    });
    const ended = await org("ended", { status: "EXPIRED", endedAt: at(-1) });
    await org("later", { status: "TRIAL", trialStartsAt: at(-4), trialEndsAt: at(10) });
    await org("fine", {});

    expect(await sendBillingNotices(capture)).toEqual({ sent: 3, failed: 0, skipped: 0 });
    const to = (template: string) => outbox.filter((m) => m.template === template).map((m) => m.to);
    expect(to("billing-trial-ending").sort()).toEqual(
      [trial.owner.email.toLowerCase(), "accounts@trial.test"].sort(),
    );
    expect(to("billing-payment-overdue")).toEqual([overdue.owner.email.toLowerCase()]);
    expect(to("billing-plan-ended")).toEqual([ended.owner.email.toLowerCase()]);
    const overdueMail = outbox.find((m) => m.template === "billing-payment-overdue");
    expect(overdueMail?.subject).toContain("overdue");
    expect(overdueMail?.text).toContain("https://app.storevia.test/o/org_");
    expect(overdueMail?.text).toContain("Business");

    // Once per date.
    outbox = [];
    expect(await sendBillingNotices(capture)).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(outbox).toEqual([]);

    // A grace extension is a new date: the merchant hears about it.
    await migratorDb().subscription.update({
      where: { id: overdue.subscriptionId },
      data: { graceEndsAt: at(20) },
    });
    expect(await sendBillingNotices(capture)).toEqual({ sent: 1, failed: 0, skipped: 0 });
    // The ledger keeps no address.
    const notices = await migratorDb().billingNotice.findMany();
    expect(JSON.stringify(notices)).not.toContain("@");
  });

  it("a failed send is retried on the next run, never dropped", async () => {
    await org("flaky", { status: "PAST_DUE", pastDueSince: at(-3), graceEndsAt: at(5) });
    const failing = () => Promise.reject(new Error("SMTP down"));
    expect(await sendBillingNotices(failing)).toEqual({ sent: 0, failed: 1, skipped: 0 });
    expect(await migratorDb().billingNotice.count()).toBe(0);
    expect(await sendBillingNotices(capture)).toEqual({ sent: 1, failed: 0, skipped: 0 });
  });

  it("suspended or deleted organisations get nothing", async () => {
    const suspended = await org("suspended", {
      status: "PAST_DUE",
      pastDueSince: at(-3),
      graceEndsAt: at(5),
    });
    await migratorDb().organisation.update({
      where: { id: suspended.organisationId },
      data: { status: "SUSPENDED", suspendedAt: new Date() },
    });
    expect(await sendBillingNotices(capture)).toEqual({ sent: 0, failed: 0, skipped: 0 });
  });

  it("the ledger and its functions are the worker's alone", async () => {
    const { platformDb } = await import("@storevia/database/platform");
    await expect(platformDb().billingNotice.findMany()).rejects.toThrow(/permission denied/);
  });
});
