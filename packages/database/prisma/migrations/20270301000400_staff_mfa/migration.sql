-- Platform staff MFA (M8 security review S12, ADR-0035). The roadmap bars
-- platform-admin from production until staff have a second factor. TOTP
-- (RFC 6238) with single-use recovery codes; the secret is sealed with
-- AES-256-GCM (bound to the user id), recovery codes are stored hashed, and
-- lastUsedStep refuses a code's reuse. A platform session is usable only
-- once Session."mfaVerifiedAt" is set.
CREATE TABLE "StaffMfa" (
    "userId" UUID NOT NULL,
    "secretCiphertext" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL,
    "enabledAt" TIMESTAMPTZ(3),
    "lastUsedStep" BIGINT,
    "recoveryCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StaffMfa_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "StaffMfa" ADD CONSTRAINT "StaffMfa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffMfa"
  ADD CONSTRAINT "StaffMfa_recovery_hashes" CHECK (
    "recoveryCodeHashes" IS NOT NULL AND cardinality("recoveryCodeHashes") <= 10),
  ADD CONSTRAINT "StaffMfa_key_version" CHECK ("keyVersion" >= 1);

-- packages/auth (system role) manages it; platform-admin sees only whether
-- a staff member has enrolled.
GRANT SELECT, INSERT, UPDATE, DELETE ON "StaffMfa" TO storevia_system;
GRANT SELECT ("userId", "enabledAt") ON "StaffMfa" TO storevia_platform;
