// Human-readable entitlement values (client-safe). One formatter for the
// merchant billing page, platform-admin and the public pricing page, so a
// plan reads the same everywhere.
import type { EntitlementValue } from "./engine";
import type { FeatureKey } from "./features";

/** Limit features measured in bytes rather than counts. */
const BYTE_FEATURES: ReadonlySet<FeatureKey> = new Set<FeatureKey>(["media_storage"]);

const GiB = 1024n ** 3n;
const MiB = 1024n ** 2n;

/** Whether a limit feature is measured in bytes (media storage). */
export function isByteFeature(key: FeatureKey): boolean {
  return BYTE_FEATURES.has(key);
}

export function formatBytes(bytes: bigint): string {
  if (bytes >= GiB && bytes % GiB === 0n) return `${(bytes / GiB).toLocaleString("en-GB")} GB`;
  if (bytes >= GiB) return `${(Number(bytes) / Number(GiB)).toFixed(1)} GB`;
  if (bytes >= MiB) return `${(bytes / MiB).toLocaleString("en-GB")} MB`;
  if (bytes >= 1024n) return `${(bytes / 1024n).toLocaleString("en-GB")} KB`;
  return `${bytes.toLocaleString("en-GB")} bytes`;
}

/**
 * A short label for what the value grants ("Up to 3", "5 GB", "Included",
 * "365 days of history"), or null when it grants nothing.
 */
export function formatEntitlement(key: FeatureKey, value: EntitlementValue): string | null {
  switch (value.kind) {
    case "BOOLEAN":
      return value.enabled ? "Included" : null;
    case "LIMIT":
      if (value.limit <= 0n) return null;
      return BYTE_FEATURES.has(key)
        ? formatBytes(value.limit)
        : `Up to ${value.limit.toLocaleString("en-GB")}`;
    case "UNLIMITED":
      return "Unlimited";
    case "CONFIGURATION": {
      if (!value.enabled) return null;
      const days = value.config["retentionDays"];
      return typeof days === "number"
        ? `${days.toLocaleString("en-GB")} days of history`
        : "Included";
    }
  }
}
