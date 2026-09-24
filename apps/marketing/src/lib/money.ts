/** Formats a price held in minor units, dropping ".00" for whole amounts. */
export function formatPrice(amount: bigint, currency: string): string {
  const probe = new Intl.NumberFormat("en-US", { style: "currency", currency });
  const exponent = probe.resolvedOptions().maximumFractionDigits ?? 2;
  const divisor = 10 ** exponent;
  const value = Number(amount) / divisor;
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : exponent,
    maximumFractionDigits: exponent,
  }).format(value);
}
