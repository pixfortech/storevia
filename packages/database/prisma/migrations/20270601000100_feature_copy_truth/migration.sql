-- Feature copy tells the truth (final pass, MK-3 / MK-5). The reference
-- feature rows come from migrations (20260925000000_billing_entitlements),
-- not from `pnpm db:seed`, so a seed run never corrects their text: this
-- migration does. The discounts feature said "Discount codes and automatic
-- discounts.", but only discount codes (a percentage or a fixed amount off
-- the order) exist. Text only: no schema change, no entitlement change.
UPDATE "Feature"
  SET description = 'Discount codes: a percentage or a fixed amount off the order.'
  WHERE key = 'discounts';
