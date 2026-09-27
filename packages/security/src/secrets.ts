import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Envelope encryption for secrets Storevia must hold on a merchant's behalf
// (payment provider keys, ADR-0031 §4). AES-256-GCM with a random 96-bit IV;
// the associated data binds a ciphertext to the row it belongs to, so a
// ciphertext copied to another row (or another store) doesn't decrypt.
// Keys are versioned: rows record the version they were written with, the
// newest key encrypts, older keys still decrypt until rows are re-written.
// In production the key material comes from KMS / Secrets Manager.

const IV_BYTES = 12;
const TAG_BYTES = 16;

export class SecretCipherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretCipherError";
  }
}

export interface SealedSecret {
  readonly ciphertext: Uint8Array;
  readonly keyVersion: number;
}

export class SecretCipher {
  private readonly keys: ReadonlyMap<number, Buffer>;
  readonly currentVersion: number;

  constructor(keys: ReadonlyMap<number, Buffer>) {
    if (keys.size === 0) throw new SecretCipherError("no encryption keys configured");
    for (const [version, key] of keys) {
      if (!Number.isInteger(version) || version < 1) {
        throw new SecretCipherError("key versions are positive integers");
      }
      if (key.length !== 32) throw new SecretCipherError("keys are 32 bytes (AES-256)");
    }
    this.keys = keys;
    this.currentVersion = Math.max(...keys.keys());
  }

  seal(plaintext: string, associatedData: string): SealedSecret {
    const key = this.keys.get(this.currentVersion);
    if (!key) throw new SecretCipherError("no current key");
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from(associatedData, "utf8"));
    const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return {
      ciphertext: Buffer.concat([iv, cipher.getAuthTag(), body]),
      keyVersion: this.currentVersion,
    };
  }

  /** Throws SecretCipherError when the key is unknown or the data was tampered with or moved. */
  open(sealed: SealedSecret, associatedData: string): string {
    const key = this.keys.get(sealed.keyVersion);
    if (!key) throw new SecretCipherError("unknown key version");
    const data = Buffer.from(sealed.ciphertext);
    if (data.length < IV_BYTES + TAG_BYTES) throw new SecretCipherError("ciphertext too short");
    const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, IV_BYTES));
    decipher.setAAD(Buffer.from(associatedData, "utf8"));
    decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    try {
      return Buffer.concat([
        decipher.update(data.subarray(IV_BYTES + TAG_BYTES)),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new SecretCipherError("secret could not be decrypted");
    }
  }
}

/**
 * Parses a keyring: "1:<base64 32 bytes>,2:<base64 32 bytes>". The highest
 * version encrypts.
 */
export function parseKeyring(value: string): Map<number, Buffer> {
  const keys = new Map<number, Buffer>();
  for (const part of value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)) {
    const match = /^(\d{1,4}):([A-Za-z0-9+/=_-]+)$/.exec(part);
    if (!match?.[1] || !match[2]) throw new SecretCipherError("malformed keyring entry");
    const key = Buffer.from(match[2], "base64");
    keys.set(Number(match[1]), key);
  }
  return keys;
}

/** Masks an identifier for display: the first `head` and last 4 characters. */
export function maskIdentifier(value: string, head = 9): string {
  if (value.length <= head + 4) return `…${value.slice(-4)}`;
  return `${value.slice(0, head)}…${value.slice(-4)}`;
}
