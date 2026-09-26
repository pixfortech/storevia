import { isUuid } from "./uuid";

/**
 * TypeID public identifiers (ADR-0006): `<prefix>_<26 chars Crockford base32>`,
 * a reversible encoding of the row's UUID. Decoding validates the prefix, so an
 * ID of the wrong kind is rejected before any database lookup.
 */
export const ID_PREFIXES = {
  organisation: "org",
  store: "store",
  membership: "mem",
  invitation: "inv",
  user: "user",
  subscription: "sub",
  // Catalogue (ADR-0027).
  product: "prod",
  variant: "var",
  option: "opt",
  optionValue: "optval",
  collection: "coll",
  location: "loc",
  media: "media",
  // Storefront content (ADR-0028).
  page: "page",
} as const;

export type IdKind = keyof typeof ID_PREFIXES;

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const DECODE = new Map<string, number>(
  Array.from({ length: ALPHABET.length }, (_, i) => [ALPHABET.charAt(i), i]),
);
const SUFFIX_RE = /^[0-7][0-9a-hjkmnp-tv-z]{25}$/;

function encodeSuffix(uuid: string): string {
  let value = BigInt(`0x${uuid.replaceAll("-", "")}`);
  let out = "";
  for (let i = 0; i < 26; i++) {
    out = (ALPHABET[Number(value & 31n)] ?? "") + out;
    value >>= 5n;
  }
  return out;
}

function decodeSuffix(suffix: string): string {
  let value = 0n;
  for (const char of suffix) {
    const digit = DECODE.get(char);
    if (digit === undefined) throw new Error("invalid base32 character");
    value = (value << 5n) | BigInt(digit);
  }
  const hex = value.toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function toTypeId(kind: IdKind, uuid: string): string {
  if (!isUuid(uuid)) throw new Error(`toTypeId: not a UUID (${kind})`);
  return `${ID_PREFIXES[kind]}_${encodeSuffix(uuid)}`;
}

/** Returns the UUID, or `null` for anything malformed or of the wrong kind. */
export function parseTypeId(kind: IdKind, value: string): string | null {
  const prefix = `${ID_PREFIXES[kind]}_`;
  if (!value.startsWith(prefix)) return null;
  const suffix = value.slice(prefix.length);
  if (!SUFFIX_RE.test(suffix)) return null;
  return decodeSuffix(suffix);
}
