-- Milestone 2.5: business types and role presets (ADR-0024).
-- Business type is presentation only; it is never read by an authorisation or
-- entitlement check. Existing stores keep the e-commerce experience.

-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('ECOMMERCE', 'BUSINESS', 'PUBLISHING', 'PORTFOLIO');

-- AlterEnum


ALTER TYPE "MemberRole" ADD VALUE 'INVENTORY_MANAGER';
ALTER TYPE "MemberRole" ADD VALUE 'SITE_MANAGER';
ALTER TYPE "MemberRole" ADD VALUE 'CONTENT_MANAGER';
ALTER TYPE "MemberRole" ADD VALUE 'EDITOR';
ALTER TYPE "MemberRole" ADD VALUE 'AUTHOR';

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "businessType" "BusinessType" NOT NULL DEFAULT 'ECOMMERCE';


-- Tenant code may change a store's business type (store.update, audited).
GRANT UPDATE ("businessType") ON "Store" TO storevia_app;
