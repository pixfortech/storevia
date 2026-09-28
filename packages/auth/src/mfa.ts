import "server-only";
import { createHmac } from "node:crypto";
import { systemDb } from "@storevia/database/system";
import { parseKeyring, SecretCipher } from "@storevia/security";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  otpauthUri,
  verifyTotp,
} from "./totp";

// Platform staff MFA storage (M8, ADR-0035). The TOTP secret is sealed with
// AES-256-GCM, bound to the user id; recovery codes are stored hashed and
// used once; lastUsedStep refuses a code's reuse.

export const MFA_ISSUER = "Storevia Admin";

let cipher: SecretCipher | undefined;

/**
 * STAFF_MFA_KEYS ("1:<base64 32 bytes>,…") seals the secrets; development
 * and test derive a key from the realm secret, deployed environments must
 * configure their own.
 */
export function mfaCipher(realmSecret: string, env: NodeJS.ProcessEnv = process.env): SecretCipher {
  if (cipher) return cipher;
  const ring = env["STAFF_MFA_KEYS"];
  if (ring) {
    cipher = new SecretCipher(parseKeyring(ring));
    return cipher;
  }
  const stage = env["STOREVIA_ENV"];
  if (stage !== "development" && stage !== "test") {
    throw new Error("STAFF_MFA_KEYS is not set");
  }
  const key = createHmac("sha256", realmSecret).update("storevia:staff-mfa-key").digest();
  cipher = new SecretCipher(new Map([[1, key]]));
  return cipher;
}

const aad = (userId: string) => `staff-mfa:${userId}`;

export interface MfaState {
  readonly enrolled: boolean;
}

export async function mfaState(userId: string): Promise<MfaState> {
  const row = await systemDb().staffMfa.findUnique({
    where: { userId },
    select: { enabledAt: true },
  });
  return { enrolled: row?.enabledAt != null };
}

/** Starts (or restarts) enrolment: a new pending secret, not yet in force. */
export async function startEnrolment(
  userId: string,
  account: string,
  realmSecret: string,
): Promise<{ readonly secret: string; readonly uri: string } | null> {
  const db = systemDb();
  const existing = await db.staffMfa.findUnique({ where: { userId } });
  if (existing?.enabledAt) return null;
  // A pending secret is shown again (a reload mustn't invalidate the key
  // the staff member is typing into their app).
  if (existing) {
    const pending = mfaCipher(realmSecret).open(
      { ciphertext: existing.secretCiphertext, keyVersion: existing.keyVersion },
      aad(userId),
    );
    return { secret: pending, uri: otpauthUri(MFA_ISSUER, account, pending) };
  }
  const secret = generateTotpSecret();
  const sealed = mfaCipher(realmSecret).seal(secret, aad(userId));
  await db.staffMfa.upsert({
    where: { userId },
    create: {
      userId,
      secretCiphertext: Buffer.from(sealed.ciphertext),
      keyVersion: sealed.keyVersion,
    },
    update: {
      secretCiphertext: Buffer.from(sealed.ciphertext),
      keyVersion: sealed.keyVersion,
      lastUsedStep: null,
      recoveryCodeHashes: [],
    },
  });
  return { secret, uri: otpauthUri(MFA_ISSUER, account, secret) };
}

async function secretOf(userId: string, realmSecret: string) {
  const row = await systemDb().staffMfa.findUnique({ where: { userId } });
  if (!row) return null;
  const secret = mfaCipher(realmSecret).open(
    { ciphertext: row.secretCiphertext, keyVersion: row.keyVersion },
    aad(userId),
  );
  return { row, secret };
}

/** Confirms enrolment with a first code; returns the recovery codes (shown once). */
export async function completeEnrolment(
  userId: string,
  code: string,
  realmSecret: string,
): Promise<readonly string[] | null> {
  const found = await secretOf(userId, realmSecret);
  if (!found || found.row.enabledAt) return null;
  const step = verifyTotp(found.secret, code);
  if (step === null) return null;
  const codes = generateRecoveryCodes();
  const { count } = await systemDb().staffMfa.updateMany({
    where: { userId, enabledAt: null },
    data: {
      enabledAt: new Date(),
      lastUsedStep: BigInt(step),
      recoveryCodeHashes: codes.map(hashRecoveryCode),
    },
  });
  return count === 1 ? codes : null;
}

/**
 * Verifies a sign-in's second factor: a TOTP code newer than the last one
 * used, or an unused recovery code (spent here). Compare-and-set on the
 * stored state, so two concurrent uses of one code can't both pass.
 */
export async function verifySecondFactor(
  userId: string,
  code: string,
  realmSecret: string,
): Promise<"totp" | "recovery" | null> {
  const found = await secretOf(userId, realmSecret);
  if (!found?.row.enabledAt) return null;
  const { row, secret } = found;
  const last = row.lastUsedStep === null ? null : Number(row.lastUsedStep);
  const step = verifyTotp(secret, code, { afterStep: last });
  if (step !== null) {
    const { count } = await systemDb().staffMfa.updateMany({
      where: { userId, lastUsedStep: row.lastUsedStep },
      data: { lastUsedStep: BigInt(step) },
    });
    return count === 1 ? "totp" : null;
  }
  const hash = hashRecoveryCode(code);
  if (!row.recoveryCodeHashes.includes(hash)) return null;
  const { count } = await systemDb().staffMfa.updateMany({
    where: { userId, recoveryCodeHashes: { has: hash } },
    data: { recoveryCodeHashes: row.recoveryCodeHashes.filter((h) => h !== hash) },
  });
  return count === 1 ? "recovery" : null;
}

/** Recovery codes left (for the account page). */
export async function recoveryCodesLeft(userId: string): Promise<number> {
  const row = await systemDb().staffMfa.findUnique({
    where: { userId },
    select: { recoveryCodeHashes: true },
  });
  return row?.recoveryCodeHashes.length ?? 0;
}
