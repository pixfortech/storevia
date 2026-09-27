import "server-only";
import { assertFeature } from "@storevia/entitlements";
import { recordAudit, type TenantContext } from "@storevia/tenancy";
import { DomainError, notFound, validationFailed } from "@storevia/types";
import {
  inStore,
  internalId,
  optionalMoneyField,
  parseMoneyField,
  pgCode,
  publicId,
  storeSettings,
} from "../internal";
import type { MoneyJson } from "../money";

// Discount codes (ADR-0031 §7): PERCENTAGE or FIXED_AMOUNT over the whole
// order, one code each, minimum subtotal, start/end, active flag and a total
// usage limit. Reading needs `discount.read`; changes `discount.manage`,
// and creating one needs the plan's `discounts` feature. Codes are stored
// upper-case and are unique per store. A code that has been used is
// disabled, never deleted, so orders keep their history.

export type DiscountState = "active" | "scheduled" | "expired" | "used_up" | "disabled";

export interface DiscountView {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly type: "PERCENTAGE" | "FIXED_AMOUNT";
  /** "10" (percent) or a money amount. */
  readonly percentage: string | null;
  readonly amount: MoneyJson | null;
  readonly minSubtotal: MoneyJson | null;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly usageLimit: number | null;
  readonly usageCount: number;
  readonly state: DiscountState;
}

function stateOf(d: {
  status: string;
  startsAt: Date;
  endsAt: Date | null;
  usageLimit: number | null;
  usageCount: number;
}): DiscountState {
  const now = Date.now();
  if (d.status !== "ACTIVE") return "disabled";
  if (d.startsAt.getTime() > now) return "scheduled";
  if (d.endsAt && d.endsAt.getTime() <= now) return "expired";
  if (d.usageLimit !== null && d.usageCount >= d.usageLimit) return "used_up";
  return "active";
}

const bpsToPercent = (bps: number) => {
  const whole = Math.trunc(bps / 100);
  const fraction = (bps % 100).toString().padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${String(whole)}.${fraction}` : String(whole);
};

export async function listDiscounts(ctx: TenantContext): Promise<readonly DiscountView[]> {
  return inStore(ctx, "discount.read", async (tx, store) => {
    const { currency } = await storeSettings(tx, store.storeId);
    const rows = await tx.discount.findMany({
      where: { method: "CODE" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { codes: { take: 1, orderBy: { createdAt: "asc" } } },
      take: 500,
    });
    return rows
      .filter((d) => d.type === "PERCENTAGE" || d.type === "FIXED_AMOUNT")
      .map((d) => ({
        id: publicId("discount", d.id),
        code: d.codes[0]?.code ?? "",
        title: d.title,
        type: d.type as "PERCENTAGE" | "FIXED_AMOUNT",
        percentage: d.percentageBps === null ? null : bpsToPercent(d.percentageBps),
        amount: d.amount !== null ? { amount: d.amount.toString(), currency } : null,
        minSubtotal:
          d.minSubtotalAmount !== null
            ? { amount: d.minSubtotalAmount.toString(), currency }
            : null,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        usageLimit: d.usageLimit,
        usageCount: d.usageCount,
        state: stateOf(d),
      }));
  });
}

export interface DiscountInput {
  readonly code?: unknown;
  readonly title?: unknown;
  readonly type?: unknown;
  /** Percent ("10", "12.5") for PERCENTAGE; a money amount for FIXED_AMOUNT. */
  readonly value?: unknown;
  readonly minSubtotal?: unknown;
  readonly startsAt?: unknown;
  readonly endsAt?: unknown;
  readonly usageLimit?: unknown;
}

const dateField = (value: unknown, field: string): Date | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw validationFailed({ [field]: "Enter a valid date." });
  return date;
};

function parseInput(input: DiscountInput, currency: string) {
  const code = typeof input.code === "string" ? input.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9_-]{1,32}$/.test(code)) {
    throw validationFailed({ code: "Use 1–32 letters, numbers, dashes or underscores." });
  }
  const title = (typeof input.title === "string" ? input.title.trim() : "") || code;
  if (title.length > 255) throw validationFailed({ title: "Use at most 255 characters." });
  const type = input.type === "FIXED_AMOUNT" ? "FIXED_AMOUNT" : "PERCENTAGE";
  const raw = typeof input.value === "string" ? input.value.trim().replace(/%$/, "") : "";
  let percentageBps: number | null = null;
  let amount: bigint | null = null;
  if (type === "PERCENTAGE") {
    const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(raw);
    const bps = match?.[1] ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : 0;
    if (bps < 1 || bps > 10_000)
      throw validationFailed({ value: "Enter a percentage between 0.01 and 100." });
    percentageBps = bps;
  } else {
    amount = parseMoneyField("value", raw, currency);
    if (amount <= 0n) throw validationFailed({ value: "Enter an amount greater than zero." });
  }
  const minSubtotal =
    typeof input.minSubtotal === "string" && input.minSubtotal.trim()
      ? (optionalMoneyField("minSubtotal", input.minSubtotal, currency) ?? null)
      : null;
  if (minSubtotal !== null && minSubtotal < 0n)
    throw validationFailed({ minSubtotal: "Enter zero or more." });
  const startsAt = dateField(input.startsAt, "startsAt") ?? new Date();
  const endsAt = dateField(input.endsAt, "endsAt");
  if (endsAt && endsAt <= startsAt)
    throw validationFailed({ endsAt: "The end must be after the start." });
  let usageLimit: number | null = null;
  if (typeof input.usageLimit === "string" && input.usageLimit.trim()) {
    usageLimit = Number(input.usageLimit);
    if (!Number.isInteger(usageLimit) || usageLimit < 1 || usageLimit > 1_000_000) {
      throw validationFailed({ usageLimit: "Enter a whole number of uses, or leave it empty." });
    }
  }
  return {
    code,
    title,
    type,
    percentageBps,
    amount,
    minSubtotal,
    startsAt,
    endsAt,
    usageLimit,
  } as const;
}

export async function createDiscount(
  ctx: TenantContext,
  input: DiscountInput,
): Promise<{ readonly discountId: string }> {
  return inStore(
    ctx,
    "discount.manage",
    async (tx, store) => {
      await assertFeature(tx, store.organisationId, "discounts");
      const { currency } = await storeSettings(tx, store.storeId);
      const d = parseInput(input, currency);
      const base = { organisationId: store.organisationId, storeId: store.storeId };
      try {
        const created = await tx.discount.create({
          data: {
            ...base,
            title: d.title,
            type: d.type,
            method: "CODE",
            percentageBps: d.percentageBps,
            amount: d.amount,
            currency: d.type === "FIXED_AMOUNT" ? currency : null,
            minSubtotalAmount: d.minSubtotal,
            startsAt: d.startsAt,
            endsAt: d.endsAt,
            usageLimit: d.usageLimit,
          },
          select: { id: true },
        });
        await tx.discountCode.create({ data: { ...base, discountId: created.id, code: d.code } });
        await recordAudit(
          tx,
          store,
          "discount.created",
          { type: "Discount", id: created.id },
          {
            code: d.code,
          },
        );
        return { discountId: publicId("discount", created.id) };
      } catch (error) {
        if (pgCode(error) === "23505")
          throw validationFailed({ code: "This code is already in use." });
        throw error;
      }
    },
    { write: true },
  );
}

export async function updateDiscount(
  ctx: TenantContext,
  discountPublicId: unknown,
  input: DiscountInput,
): Promise<void> {
  const id = internalId("discount", discountPublicId);
  await inStore(
    ctx,
    "discount.manage",
    async (tx, store) => {
      const existing = await tx.$queryRaw<{ type: string; usage: number; code: string }[]>`
        SELECT d.type::text AS type, d."usageCount" AS usage,
          (SELECT c.code FROM "DiscountCode" c WHERE c."discountId" = d.id ORDER BY c."createdAt" LIMIT 1) AS code
        FROM "Discount" d WHERE d.id = ${id}::uuid FOR UPDATE`;
      const current = existing[0];
      if (!current) throw notFound();
      const { currency } = await storeSettings(tx, store.storeId);
      // The code and the type identify the discount on past orders: they stay.
      const d = parseInput({ ...input, code: current.code, type: current.type }, currency);
      if (d.usageLimit !== null && d.usageLimit < current.usage) {
        throw validationFailed({
          usageLimit: `This code has already been used ${String(current.usage)} times.`,
        });
      }
      await tx.discount.update({
        where: { id },
        data: {
          title: d.title,
          percentageBps: d.percentageBps,
          amount: d.amount,
          minSubtotalAmount: d.minSubtotal,
          startsAt: d.startsAt,
          endsAt: d.endsAt,
          usageLimit: d.usageLimit,
        },
      });
      await recordAudit(
        tx,
        store,
        "discount.updated",
        { type: "Discount", id },
        { code: current.code },
      );
    },
    { write: true },
  );
}

export async function setDiscountActive(
  ctx: TenantContext,
  discountPublicId: unknown,
  active: boolean,
): Promise<void> {
  const id = internalId("discount", discountPublicId);
  await inStore(
    ctx,
    "discount.manage",
    async (tx, store) => {
      const updated = await tx.discount.updateMany({
        where: { id },
        data: { status: active ? "ACTIVE" : "DISABLED" },
      });
      if (updated.count === 0) throw notFound();
      await recordAudit(tx, store, active ? "discount.enabled" : "discount.disabled", {
        type: "Discount",
        id,
      });
    },
    { write: true },
  );
}

/** Deletes an unused code; a used one must be disabled instead. */
export async function deleteDiscount(ctx: TenantContext, discountPublicId: unknown): Promise<void> {
  const id = internalId("discount", discountPublicId);
  await inStore(
    ctx,
    "discount.manage",
    async (tx, store) => {
      const rows = await tx.$queryRaw<{ used: boolean }[]>`
        SELECT (d."usageCount" > 0 OR EXISTS (SELECT 1 FROM "DiscountRedemption" r WHERE r."discountId" = d.id)) AS used
        FROM "Discount" d WHERE d.id = ${id}::uuid FOR UPDATE`;
      const row = rows[0];
      if (!row) throw notFound();
      if (row.used) {
        throw new DomainError(
          "CONFLICT",
          "This code has been used, so it can't be deleted. Disable it instead.",
        );
      }
      await tx.discountCode.deleteMany({ where: { discountId: id } });
      await tx.discount.delete({ where: { id } });
      await recordAudit(tx, store, "discount.deleted", { type: "Discount", id });
    },
    { write: true },
  );
}
