-- Collections are archived like products (ADR-0027 §6): hidden and
-- restorable, never hard-deleted. The handle stays reserved while archived.
ALTER TABLE "Collection" ADD COLUMN "archivedAt" TIMESTAMPTZ(3);
