-- Milestone 6: checkout, customers, orders, payments (ADR-0031). Promotes
-- the checkout, customer, discount, shipping, tax, order, payment, refund
-- and fulfilment models, adds OrderNotification, and the storevia_checkout
-- role's access: one store and one checkout at a time.
-- storevia_checkout (LOGIN NOBYPASSRLS) is created by infrastructure /
-- `pnpm db:setup` beforehand.

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('OPEN', 'PAYMENT_PENDING', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CONVERTED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING');

-- CreateEnum
CREATE TYPE "DiscountMethod" AS ENUM ('CODE', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "DiscountStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "DiscountTarget" AS ENUM ('ALL', 'PRODUCTS', 'COLLECTIONS');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('RESERVED', 'REDEEMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "ShippingRateType" AS ENUM ('FLAT', 'WEIGHT_BASED', 'PRICE_BASED');

-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('PENDING', 'AUTHORISED', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED', 'VOIDED');

-- CreateEnum
CREATE TYPE "OrderFulfilmentStatus" AS ENUM ('UNFULFILLED', 'PARTIALLY_FULFILLED', 'FULFILLED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AddressType" AS ENUM ('SHIPPING', 'BILLING');

-- CreateEnum
CREATE TYPE "PaymentProviderMode" AS ENUM ('TEST', 'LIVE');

-- CreateEnum
CREATE TYPE "PaymentConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED', 'ERROR');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'REQUIRES_ACTION', 'AUTHORISED', 'CAPTURED', 'PARTIALLY_CAPTURED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "FulfilmentState" AS ENUM ('PENDING', 'SUCCESS', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('ORDER_CONFIRMATION', 'ORDER_CANCELLED', 'ORDER_FULFILLED', 'REFUND_CREATED');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "email" CITEXT,
    "phone" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "note" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checkout" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "cartId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "customerId" UUID,
    "email" TEXT,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'OPEN',
    "currency" CHAR(3) NOT NULL,
    "shippingAddress" JSONB,
    "billingAddress" JSONB,
    "shippingRateId" UUID,
    "discountCode" TEXT,
    "subtotalAmount" BIGINT NOT NULL DEFAULT 0,
    "discountAmount" BIGINT NOT NULL DEFAULT 0,
    "shippingAmount" BIGINT NOT NULL DEFAULT 0,
    "taxAmount" BIGINT NOT NULL DEFAULT 0,
    "totalAmount" BIGINT NOT NULL DEFAULT 0,
    "pricingHash" TEXT,
    "quote" JSONB,
    "pricedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "completedOrderId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Checkout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "checkoutId" UUID,
    "orderId" UUID,
    "orderLineId" UUID,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discount" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "method" "DiscountMethod" NOT NULL,
    "status" "DiscountStatus" NOT NULL DEFAULT 'ACTIVE',
    "percentageBps" INTEGER,
    "amount" BIGINT,
    "currency" CHAR(3),
    "target" "DiscountTarget" NOT NULL DEFAULT 'ALL',
    "minSubtotalAmount" BIGINT,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3),
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountCode" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "discountId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscountCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscountRedemption" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "discountId" UUID NOT NULL,
    "discountCodeId" UUID,
    "checkoutId" UUID NOT NULL,
    "orderId" UUID,
    "customerId" UUID,
    "email" TEXT,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DiscountRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingZone" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShippingZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingZoneCountry" (
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "zoneId" UUID NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "regionCodes" TEXT[],

    CONSTRAINT "ShippingZoneCountry_pkey" PRIMARY KEY ("zoneId","countryCode")
);

-- CreateTable
CREATE TABLE "ShippingRate" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "zoneId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ShippingRateType" NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "amount" BIGINT NOT NULL,
    "minSubtotalAmount" BIGINT,
    "maxSubtotalAmount" BIGINT,
    "minWeightGrams" INTEGER,
    "maxWeightGrams" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShippingRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxConfiguration" (
    "storeId" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "pricesIncludeTax" BOOLEAN NOT NULL DEFAULT false,
    "chargeTaxOnShipping" BOOLEAN NOT NULL DEFAULT false,
    "calculator" TEXT NOT NULL DEFAULT 'manual',
    "taxRegistrationId" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TaxConfiguration_pkey" PRIMARY KEY ("storeId")
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "regionCode" TEXT,
    "name" TEXT NOT NULL,
    "ratePpm" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "compound" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "checkoutId" UUID,
    "customerId" UUID,
    "email" TEXT,
    "phone" TEXT,
    "currency" CHAR(3) NOT NULL,
    "pricesIncludeTax" BOOLEAN NOT NULL,
    "subtotalAmount" BIGINT NOT NULL,
    "discountAmount" BIGINT NOT NULL,
    "shippingAmount" BIGINT NOT NULL,
    "taxAmount" BIGINT NOT NULL,
    "totalAmount" BIGINT NOT NULL,
    "refundedAmount" BIGINT NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "paymentStatus" "OrderPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "fulfilmentStatus" "OrderFulfilmentStatus" NOT NULL DEFAULT 'UNFULFILLED',
    "stockShortage" BOOLEAN NOT NULL DEFAULT false,
    "sourceName" TEXT NOT NULL DEFAULT 'storefront',
    "customerLocale" TEXT,
    "note" TEXT,
    "tags" TEXT[],
    "placedAt" TIMESTAMPTZ(3) NOT NULL,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID,
    "variantId" UUID,
    "productTitle" TEXT NOT NULL,
    "variantTitle" TEXT,
    "sku" TEXT,
    "currency" CHAR(3) NOT NULL,
    "unitPriceAmount" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "discountAmount" BIGINT NOT NULL DEFAULT 0,
    "taxAmount" BIGINT NOT NULL DEFAULT 0,
    "totalAmount" BIGINT NOT NULL,
    "requiresShipping" BOOLEAN NOT NULL,
    "taxable" BOOLEAN NOT NULL,
    "weightGrams" INTEGER,
    "fulfilledQuantity" INTEGER NOT NULL DEFAULT 0,
    "refundedQuantity" INTEGER NOT NULL DEFAULT 0,
    "attributes" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAddress" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "type" "AddressType" NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "company" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "regionCode" TEXT,
    "postalCode" TEXT,
    "countryCode" CHAR(2) NOT NULL,
    "phone" TEXT,

    CONSTRAINT "OrderAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDiscount" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "discountId" UUID,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "percentageBps" INTEGER,
    "amount" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,

    CONSTRAINT "OrderDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderShippingLine" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "shippingRateId" UUID,
    "title" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "amount" BIGINT NOT NULL,
    "discountAmount" BIGINT NOT NULL DEFAULT 0,
    "taxAmount" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "OrderShippingLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderTaxLine" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "orderLineId" UUID,
    "title" TEXT NOT NULL,
    "ratePpm" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "OrderTaxLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "data" JSONB,
    "actorUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProviderConnection" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "mode" "PaymentProviderMode" NOT NULL,
    "status" "PaymentConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "externalAccountId" TEXT,
    "credentialsCiphertext" BYTEA,
    "keyVersion" INTEGER,
    "credentialHint" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PaymentProviderConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "checkoutId" UUID,
    "orderId" UUID,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "providerChargeId" TEXT,
    "redirectUrl" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "currency" CHAR(3) NOT NULL,
    "amount" BIGINT NOT NULL,
    "capturedAmount" BIGINT NOT NULL DEFAULT 0,
    "refundedAmount" BIGINT NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "capturedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "InboundWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "currency" CHAR(3) NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT,
    "providerRefundId" TEXT,
    "failureMessage" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundLine" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "refundId" UUID NOT NULL,
    "orderLineId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "restockLocationId" UUID,

    CONSTRAINT "RefundLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fulfilment" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "state" "FulfilmentState" NOT NULL DEFAULT 'PENDING',
    "trackingCompany" TEXT,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "shippedAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Fulfilment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfilmentLine" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "fulfilmentId" UUID NOT NULL,
    "orderLineId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "FulfilmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderNotification" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "referenceId" UUID,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrderNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_storeId_createdAt_idx" ON "Customer"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_id_storeId_key" ON "Customer"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Checkout_tokenHash_key" ON "Checkout"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Checkout_completedOrderId_key" ON "Checkout"("completedOrderId");

-- CreateIndex
CREATE INDEX "Checkout_storeId_status_updatedAt_idx" ON "Checkout"("storeId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Checkout_cartId_idx" ON "Checkout"("cartId");

-- CreateIndex
CREATE INDEX "Checkout_customerId_idx" ON "Checkout"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Checkout_id_storeId_key" ON "Checkout"("id", "storeId");

-- CreateIndex
CREATE INDEX "InventoryReservation_status_expiresAt_idx" ON "InventoryReservation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "InventoryReservation_checkoutId_idx" ON "InventoryReservation"("checkoutId");

-- CreateIndex
CREATE INDEX "InventoryReservation_storeId_idx" ON "InventoryReservation"("storeId");

-- CreateIndex
CREATE INDEX "InventoryReservation_inventoryItemId_idx" ON "InventoryReservation"("inventoryItemId");

-- CreateIndex
CREATE INDEX "InventoryReservation_locationId_idx" ON "InventoryReservation"("locationId");

-- CreateIndex
CREATE INDEX "Discount_storeId_status_startsAt_idx" ON "Discount"("storeId", "status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Discount_id_storeId_key" ON "Discount"("id", "storeId");

-- CreateIndex
CREATE INDEX "DiscountCode_discountId_idx" ON "DiscountCode"("discountId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCode_storeId_code_key" ON "DiscountCode"("storeId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountCode_id_storeId_key" ON "DiscountCode"("id", "storeId");

-- CreateIndex
CREATE INDEX "DiscountRedemption_discountId_customerId_idx" ON "DiscountRedemption"("discountId", "customerId");

-- CreateIndex
CREATE INDEX "DiscountRedemption_storeId_idx" ON "DiscountRedemption"("storeId");

-- CreateIndex
CREATE INDEX "DiscountRedemption_discountCodeId_idx" ON "DiscountRedemption"("discountCodeId");

-- CreateIndex
CREATE INDEX "DiscountRedemption_orderId_idx" ON "DiscountRedemption"("orderId");

-- CreateIndex
CREATE INDEX "DiscountRedemption_customerId_idx" ON "DiscountRedemption"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRedemption_discountId_checkoutId_key" ON "DiscountRedemption"("discountId", "checkoutId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscountRedemption_discountId_orderId_key" ON "DiscountRedemption"("discountId", "orderId");

-- CreateIndex
CREATE INDEX "ShippingZone_storeId_idx" ON "ShippingZone"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingZone_id_storeId_key" ON "ShippingZone"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingZoneCountry_storeId_countryCode_key" ON "ShippingZoneCountry"("storeId", "countryCode");

-- CreateIndex
CREATE INDEX "ShippingRate_zoneId_idx" ON "ShippingRate"("zoneId");

-- CreateIndex
CREATE INDEX "ShippingRate_storeId_idx" ON "ShippingRate"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxConfiguration_storeId_organisationId_key" ON "TaxConfiguration"("storeId", "organisationId");

-- CreateIndex
CREATE INDEX "TaxRate_storeId_countryCode_idx" ON "TaxRate"("storeId", "countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "Order_checkoutId_key" ON "Order"("checkoutId");

-- CreateIndex
CREATE INDEX "Order_storeId_placedAt_idx" ON "Order"("storeId", "placedAt");

-- CreateIndex
CREATE INDEX "Order_storeId_paymentStatus_fulfilmentStatus_idx" ON "Order"("storeId", "paymentStatus", "fulfilmentStatus");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_storeId_orderNumber_key" ON "Order"("storeId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_id_storeId_key" ON "Order"("id", "storeId");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderLine_variantId_idx" ON "OrderLine"("variantId");

-- CreateIndex
CREATE INDEX "OrderLine_storeId_idx" ON "OrderLine"("storeId");

-- CreateIndex
CREATE INDEX "OrderLine_productId_idx" ON "OrderLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLine_id_storeId_key" ON "OrderLine"("id", "storeId");

-- CreateIndex
CREATE INDEX "OrderAddress_storeId_idx" ON "OrderAddress"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderAddress_orderId_type_key" ON "OrderAddress"("orderId", "type");

-- CreateIndex
CREATE INDEX "OrderDiscount_orderId_idx" ON "OrderDiscount"("orderId");

-- CreateIndex
CREATE INDEX "OrderDiscount_storeId_idx" ON "OrderDiscount"("storeId");

-- CreateIndex
CREATE INDEX "OrderShippingLine_orderId_idx" ON "OrderShippingLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderShippingLine_storeId_idx" ON "OrderShippingLine"("storeId");

-- CreateIndex
CREATE INDEX "OrderTaxLine_orderId_idx" ON "OrderTaxLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderTaxLine_storeId_idx" ON "OrderTaxLine"("storeId");

-- CreateIndex
CREATE INDEX "OrderTaxLine_orderLineId_idx" ON "OrderTaxLine"("orderLineId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderEvent_storeId_idx" ON "OrderEvent"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderConnection_storeId_provider_mode_key" ON "PaymentProviderConnection"("storeId", "provider", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderConnection_id_storeId_key" ON "PaymentProviderConnection"("id", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_checkoutId_idx" ON "Payment"("checkoutId");

-- CreateIndex
CREATE INDEX "Payment_storeId_idx" ON "Payment"("storeId");

-- CreateIndex
CREATE INDEX "Payment_connectionId_idx" ON "Payment"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_provider_providerPaymentId_key" ON "Payment"("provider", "providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_id_storeId_key" ON "Payment"("id", "storeId");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_status_receivedAt_idx" ON "PaymentWebhookEvent"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_storeId_idx" ON "PaymentWebhookEvent"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_storeId_provider_providerEventId_key" ON "PaymentWebhookEvent"("storeId", "provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Refund_orderId_idx" ON "Refund"("orderId");

-- CreateIndex
CREATE INDEX "Refund_storeId_idx" ON "Refund"("storeId");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_id_storeId_key" ON "Refund"("id", "storeId");

-- CreateIndex
CREATE INDEX "RefundLine_storeId_idx" ON "RefundLine"("storeId");

-- CreateIndex
CREATE INDEX "RefundLine_orderLineId_idx" ON "RefundLine"("orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundLine_refundId_orderLineId_key" ON "RefundLine"("refundId", "orderLineId");

-- CreateIndex
CREATE INDEX "Fulfilment_orderId_idx" ON "Fulfilment"("orderId");

-- CreateIndex
CREATE INDEX "Fulfilment_storeId_idx" ON "Fulfilment"("storeId");

-- CreateIndex
CREATE INDEX "Fulfilment_locationId_idx" ON "Fulfilment"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Fulfilment_id_storeId_key" ON "Fulfilment"("id", "storeId");

-- CreateIndex
CREATE INDEX "FulfilmentLine_storeId_idx" ON "FulfilmentLine"("storeId");

-- CreateIndex
CREATE INDEX "FulfilmentLine_orderLineId_idx" ON "FulfilmentLine"("orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "FulfilmentLine_fulfilmentId_orderLineId_key" ON "FulfilmentLine"("fulfilmentId", "orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderNotification_dedupeKey_key" ON "OrderNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "OrderNotification_status_nextAttemptAt_idx" ON "OrderNotification"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "OrderNotification_orderId_idx" ON "OrderNotification"("orderId");

-- CreateIndex
CREATE INDEX "OrderNotification_storeId_idx" ON "OrderNotification"("storeId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_cartId_storeId_fkey" FOREIGN KEY ("cartId", "storeId") REFERENCES "Cart"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_inventoryItemId_storeId_fkey" FOREIGN KEY ("inventoryItemId", "storeId") REFERENCES "InventoryItem"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_locationId_storeId_fkey" FOREIGN KEY ("locationId", "storeId") REFERENCES "Location"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_discountId_storeId_fkey" FOREIGN KEY ("discountId", "storeId") REFERENCES "Discount"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_discountId_storeId_fkey" FOREIGN KEY ("discountId", "storeId") REFERENCES "Discount"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_discountCodeId_fkey" FOREIGN KEY ("discountCodeId") REFERENCES "DiscountCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_orderId_storeId_fkey" FOREIGN KEY ("orderId", "storeId") REFERENCES "Order"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingZone" ADD CONSTRAINT "ShippingZone_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingZoneCountry" ADD CONSTRAINT "ShippingZoneCountry_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingZoneCountry" ADD CONSTRAINT "ShippingZoneCountry_zoneId_storeId_fkey" FOREIGN KEY ("zoneId", "storeId") REFERENCES "ShippingZone"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_zoneId_storeId_fkey" FOREIGN KEY ("zoneId", "storeId") REFERENCES "ShippingZone"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxConfiguration" ADD CONSTRAINT "TaxConfiguration_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_storeId_fkey" FOREIGN KEY ("orderId", "storeId") REFERENCES "Order"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAddress" ADD CONSTRAINT "OrderAddress_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAddress" ADD CONSTRAINT "OrderAddress_orderId_storeId_fkey" FOREIGN KEY ("orderId", "storeId") REFERENCES "Order"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDiscount" ADD CONSTRAINT "OrderDiscount_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDiscount" ADD CONSTRAINT "OrderDiscount_orderId_storeId_fkey" FOREIGN KEY ("orderId", "storeId") REFERENCES "Order"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderShippingLine" ADD CONSTRAINT "OrderShippingLine_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderShippingLine" ADD CONSTRAINT "OrderShippingLine_orderId_storeId_fkey" FOREIGN KEY ("orderId", "storeId") REFERENCES "Order"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTaxLine" ADD CONSTRAINT "OrderTaxLine_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTaxLine" ADD CONSTRAINT "OrderTaxLine_orderId_storeId_fkey" FOREIGN KEY ("orderId", "storeId") REFERENCES "Order"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTaxLine" ADD CONSTRAINT "OrderTaxLine_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_storeId_fkey" FOREIGN KEY ("orderId", "storeId") REFERENCES "Order"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderConnection" ADD CONSTRAINT "PaymentProviderConnection_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_connectionId_storeId_fkey" FOREIGN KEY ("connectionId", "storeId") REFERENCES "PaymentProviderConnection"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_storeId_fkey" FOREIGN KEY ("orderId", "storeId") REFERENCES "Order"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_storeId_fkey" FOREIGN KEY ("paymentId", "storeId") REFERENCES "Payment"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundLine" ADD CONSTRAINT "RefundLine_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundLine" ADD CONSTRAINT "RefundLine_refundId_storeId_fkey" FOREIGN KEY ("refundId", "storeId") REFERENCES "Refund"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundLine" ADD CONSTRAINT "RefundLine_orderLineId_storeId_fkey" FOREIGN KEY ("orderLineId", "storeId") REFERENCES "OrderLine"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fulfilment" ADD CONSTRAINT "Fulfilment_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fulfilment" ADD CONSTRAINT "Fulfilment_orderId_storeId_fkey" FOREIGN KEY ("orderId", "storeId") REFERENCES "Order"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fulfilment" ADD CONSTRAINT "Fulfilment_locationId_storeId_fkey" FOREIGN KEY ("locationId", "storeId") REFERENCES "Location"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfilmentLine" ADD CONSTRAINT "FulfilmentLine_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfilmentLine" ADD CONSTRAINT "FulfilmentLine_fulfilmentId_storeId_fkey" FOREIGN KEY ("fulfilmentId", "storeId") REFERENCES "Fulfilment"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfilmentLine" ADD CONSTRAINT "FulfilmentLine_orderLineId_storeId_fkey" FOREIGN KEY ("orderLineId", "storeId") REFERENCES "OrderLine"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderNotification" ADD CONSTRAINT "OrderNotification_storeId_organisationId_fkey" FOREIGN KEY ("storeId", "organisationId") REFERENCES "Store"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderNotification" ADD CONSTRAINT "OrderNotification_orderId_storeId_fkey" FOREIGN KEY ("orderId", "storeId") REFERENCES "Order"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Milestone 6 rules (ADR-0031). Everything below is hand-written.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Shapes and bounds. Amounts are minor units; currencies ISO codes.
-- ---------------------------------------------------------------------------
ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_email_shape" CHECK (email IS NULL OR (char_length(email) <= 254 AND email LIKE '%_@_%')),
  ADD CONSTRAINT "Customer_text_lengths" CHECK (
    (phone IS NULL OR char_length(phone) <= 32)
    AND (("firstName" IS NULL) OR char_length("firstName") <= 100)
    AND (("lastName" IS NULL) OR char_length("lastName") <= 100)
    AND (note IS NULL OR char_length(note) <= 5000)
    AND cardinality(tags) <= 50);
-- One customer per store and email, case-insensitively (citext).
CREATE UNIQUE INDEX "Customer_store_email_live" ON "Customer" ("storeId", email)
  WHERE email IS NOT NULL AND "deletedAt" IS NULL;

ALTER TABLE "Checkout"
  ADD CONSTRAINT "Checkout_token_hash_format" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "Checkout_currency_format" CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "Checkout_email_shape" CHECK (email IS NULL OR (char_length(email) <= 254 AND email LIKE '%_@_%')),
  ADD CONSTRAINT "Checkout_discount_code_format" CHECK ("discountCode" IS NULL OR "discountCode" ~ '^[A-Z0-9_-]{1,32}$'),
  ADD CONSTRAINT "Checkout_amounts" CHECK ("subtotalAmount" >= 0 AND "discountAmount" >= 0
    AND "discountAmount" <= "subtotalAmount" AND "shippingAmount" >= 0 AND "taxAmount" >= 0
    AND "totalAmount" >= 0),
  ADD CONSTRAINT "Checkout_json_objects" CHECK (
    ("shippingAddress" IS NULL OR jsonb_typeof("shippingAddress") = 'object')
    AND ("billingAddress" IS NULL OR jsonb_typeof("billingAddress") = 'object')
    AND (quote IS NULL OR (jsonb_typeof(quote) = 'object' AND octet_length(quote::text) <= 262144))),
  ADD CONSTRAINT "Checkout_pricing_hash_format" CHECK ("pricingHash" IS NULL OR "pricingHash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "Checkout_completed_order" CHECK ((status = 'COMPLETED') = ("completedOrderId" IS NOT NULL));
CREATE INDEX "Checkout_sweep" ON "Checkout" ("expiresAt") WHERE status IN ('OPEN', 'PAYMENT_PENDING');

ALTER TABLE "InventoryReservation"
  ADD CONSTRAINT "InventoryReservation_quantity_positive" CHECK (quantity > 0),
  ADD CONSTRAINT "InventoryReservation_converted_order" CHECK (
    (status = 'CONVERTED') <= ("orderId" IS NOT NULL AND "orderLineId" IS NOT NULL));
CREATE INDEX "InventoryReservation_orderId_idx" ON "InventoryReservation" ("orderId");

ALTER TABLE "Discount"
  ADD CONSTRAINT "Discount_title_length" CHECK (char_length(title) BETWEEN 1 AND 255),
  -- M6 supports code discounts over the whole order (ADR-0031 §7).
  ADD CONSTRAINT "Discount_m6_scope" CHECK (method = 'CODE' AND target = 'ALL' AND type <> 'FREE_SHIPPING'),
  ADD CONSTRAINT "Discount_value_by_type" CHECK (
    (type = 'PERCENTAGE' AND "percentageBps" BETWEEN 1 AND 10000 AND amount IS NULL AND currency IS NULL)
    OR (type = 'FIXED_AMOUNT' AND "percentageBps" IS NULL AND amount > 0 AND currency ~ '^[A-Z]{3}$')
    OR type = 'FREE_SHIPPING'),
  ADD CONSTRAINT "Discount_minimum_nonnegative" CHECK ("minSubtotalAmount" IS NULL OR "minSubtotalAmount" >= 0),
  ADD CONSTRAINT "Discount_dates" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt"),
  ADD CONSTRAINT "Discount_usage" CHECK ("usageCount" >= 0
    AND ("usageLimit" IS NULL OR ("usageLimit" > 0 AND "usageCount" <= "usageLimit")));
ALTER TABLE "DiscountCode"
  ADD CONSTRAINT "DiscountCode_format" CHECK (code ~ '^[A-Z0-9_-]{1,32}$'),
  ADD CONSTRAINT "DiscountCode_usage" CHECK ("usageCount" >= 0);
ALTER TABLE "DiscountRedemption"
  ADD CONSTRAINT "DiscountRedemption_redeemed_order" CHECK ((status = 'REDEEMED') = ("orderId" IS NOT NULL));
CREATE INDEX "DiscountRedemption_checkoutId_idx" ON "DiscountRedemption" ("checkoutId");

ALTER TABLE "ShippingZone"
  ADD CONSTRAINT "ShippingZone_name_length" CHECK (char_length(name) BETWEEN 1 AND 100);
ALTER TABLE "ShippingZoneCountry"
  ADD CONSTRAINT "ShippingZoneCountry_country_format" CHECK ("countryCode" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "ShippingZoneCountry_regions" CHECK (cardinality("regionCodes") <= 100);
ALTER TABLE "ShippingRate"
  ADD CONSTRAINT "ShippingRate_name_length" CHECK (char_length(name) BETWEEN 1 AND 100),
  ADD CONSTRAINT "ShippingRate_currency_format" CHECK (currency ~ '^[A-Z]{3}$'),
  -- Weight-based rates are later (ADR-0031 §7).
  ADD CONSTRAINT "ShippingRate_m6_types" CHECK (type IN ('FLAT', 'PRICE_BASED')
    AND "minWeightGrams" IS NULL AND "maxWeightGrams" IS NULL),
  ADD CONSTRAINT "ShippingRate_amounts" CHECK (amount >= 0
    AND ("minSubtotalAmount" IS NULL OR "minSubtotalAmount" >= 0)
    AND ("maxSubtotalAmount" IS NULL OR "maxSubtotalAmount" >= 0)
    AND ("minSubtotalAmount" IS NULL OR "maxSubtotalAmount" IS NULL OR "minSubtotalAmount" <= "maxSubtotalAmount")),
  ADD CONSTRAINT "ShippingRate_flat_has_no_range" CHECK (type <> 'FLAT'
    OR ("minSubtotalAmount" IS NULL AND "maxSubtotalAmount" IS NULL));

ALTER TABLE "TaxConfiguration"
  ADD CONSTRAINT "TaxConfiguration_manual" CHECK (calculator = 'manual'),
  ADD CONSTRAINT "TaxConfiguration_registration_length" CHECK ("taxRegistrationId" IS NULL OR char_length("taxRegistrationId") <= 64);
ALTER TABLE "TaxRate"
  ADD CONSTRAINT "TaxRate_country_format" CHECK ("countryCode" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "TaxRate_region_format" CHECK ("regionCode" IS NULL OR "regionCode" ~ '^[A-Z0-9-]{1,10}$'),
  ADD CONSTRAINT "TaxRate_name_length" CHECK (char_length(name) BETWEEN 1 AND 100),
  ADD CONSTRAINT "TaxRate_rate_range" CHECK ("ratePpm" BETWEEN 0 AND 1000000),
  ADD CONSTRAINT "TaxRate_not_compound" CHECK (NOT compound);

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_number_positive" CHECK ("orderNumber" > 0),
  ADD CONSTRAINT "Order_currency_format" CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "Order_amounts" CHECK ("subtotalAmount" >= 0 AND "discountAmount" >= 0
    AND "discountAmount" <= "subtotalAmount" AND "shippingAmount" >= 0 AND "taxAmount" >= 0
    AND "totalAmount" >= 0),
  ADD CONSTRAINT "Order_total_adds_up" CHECK ("totalAmount" = "subtotalAmount" - "discountAmount"
    + "shippingAmount" + CASE WHEN "pricesIncludeTax" THEN 0 ELSE "taxAmount" END),
  ADD CONSTRAINT "Order_refunded_range" CHECK ("refundedAmount" BETWEEN 0 AND "totalAmount"),
  ADD CONSTRAINT "Order_cancelled_pair" CHECK ((status = 'CANCELLED') = ("cancelledAt" IS NOT NULL)),
  ADD CONSTRAINT "Order_text_lengths" CHECK ((note IS NULL OR char_length(note) <= 5000)
    AND (email IS NULL OR char_length(email) <= 254) AND (phone IS NULL OR char_length(phone) <= 32)
    AND ("cancelReason" IS NULL OR char_length("cancelReason") <= 500) AND cardinality(tags) <= 50);
CREATE INDEX "Order_store_email" ON "Order" ("storeId", lower(email));
CREATE INDEX "Order_storeId_status_placedAt_idx" ON "Order" ("storeId", status, "placedAt");

ALTER TABLE "OrderLine"
  ADD CONSTRAINT "OrderLine_currency_format" CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "OrderLine_quantity_range" CHECK (quantity BETWEEN 1 AND 9999),
  ADD CONSTRAINT "OrderLine_amounts" CHECK ("unitPriceAmount" >= 0 AND "discountAmount" >= 0
    AND "taxAmount" >= 0 AND "totalAmount" >= 0
    AND "discountAmount" <= "unitPriceAmount" * quantity),
  ADD CONSTRAINT "OrderLine_fulfilled_range" CHECK ("fulfilledQuantity" BETWEEN 0 AND quantity),
  ADD CONSTRAINT "OrderLine_refunded_range" CHECK ("refundedQuantity" BETWEEN 0 AND quantity);
ALTER TABLE "OrderAddress"
  ADD CONSTRAINT "OrderAddress_country_format" CHECK ("countryCode" ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT "OrderAddress_line1" CHECK (char_length(line1) BETWEEN 1 AND 200);
ALTER TABLE "OrderDiscount"
  ADD CONSTRAINT "OrderDiscount_amount" CHECK (amount >= 0 AND currency ~ '^[A-Z]{3}$');
ALTER TABLE "OrderShippingLine"
  ADD CONSTRAINT "OrderShippingLine_amounts" CHECK (amount >= 0 AND "discountAmount" >= 0
    AND "taxAmount" >= 0 AND currency ~ '^[A-Z]{3}$');
ALTER TABLE "OrderTaxLine"
  ADD CONSTRAINT "OrderTaxLine_amounts" CHECK (amount >= 0 AND "ratePpm" BETWEEN 0 AND 1000000
    AND currency ~ '^[A-Z]{3}$');
ALTER TABLE "OrderEvent"
  ADD CONSTRAINT "OrderEvent_type_format" CHECK (type ~ '^[a-z][a-z_.]{1,63}$'),
  ADD CONSTRAINT "OrderEvent_data_object" CHECK (data IS NULL OR jsonb_typeof(data) = 'object');

ALTER TABLE "PaymentProviderConnection"
  ADD CONSTRAINT "PaymentProviderConnection_provider" CHECK (provider IN ('storevia-test', 'razorpay')),
  ADD CONSTRAINT "PaymentProviderConnection_test_is_test" CHECK (provider <> 'storevia-test' OR mode = 'TEST'),
  ADD CONSTRAINT "PaymentProviderConnection_hint_length" CHECK ("credentialHint" IS NULL OR char_length("credentialHint") <= 64),
  ADD CONSTRAINT "PaymentProviderConnection_credentials_pair" CHECK (("credentialsCiphertext" IS NULL) = ("keyVersion" IS NULL));
-- Checkout uses the store's one active connection.
CREATE UNIQUE INDEX "PaymentProviderConnection_one_active" ON "PaymentProviderConnection" ("storeId")
  WHERE status = 'ACTIVE';

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_currency_format" CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "Payment_amounts" CHECK (amount > 0 AND "capturedAmount" BETWEEN 0 AND amount
    AND "refundedAmount" BETWEEN 0 AND "capturedAmount"),
  ADD CONSTRAINT "Payment_captured_pair" CHECK ((status = 'CAPTURED') = ("capturedAt" IS NOT NULL)),
  ADD CONSTRAINT "Payment_key_length" CHECK (char_length("idempotencyKey") BETWEEN 8 AND 128),
  ADD CONSTRAINT "Payment_text_lengths" CHECK (("failureCode" IS NULL OR char_length("failureCode") <= 64)
    AND ("failureMessage" IS NULL OR char_length("failureMessage") <= 500)
    AND ("redirectUrl" IS NULL OR char_length("redirectUrl") <= 2048));
-- One payment attempt in flight per checkout.
CREATE UNIQUE INDEX "Payment_one_pending_per_checkout" ON "Payment" ("checkoutId") WHERE status = 'PENDING';
CREATE INDEX "Payment_pending_expiry" ON "Payment" ("expiresAt") WHERE status = 'PENDING';

ALTER TABLE "PaymentWebhookEvent"
  ADD CONSTRAINT "PaymentWebhookEvent_payload_object" CHECK (jsonb_typeof(payload) = 'object'
    AND octet_length(payload::text) <= 16384),
  ADD CONSTRAINT "PaymentWebhookEvent_event_id_length" CHECK (char_length("providerEventId") BETWEEN 1 AND 128);

ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_amount_positive" CHECK (amount > 0 AND currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT "Refund_text_lengths" CHECK ((reason IS NULL OR char_length(reason) <= 500)
    AND ("failureMessage" IS NULL OR char_length("failureMessage") <= 500));
ALTER TABLE "RefundLine"
  ADD CONSTRAINT "RefundLine_amounts" CHECK (quantity >= 0 AND amount >= 0);
ALTER TABLE "Fulfilment"
  ADD CONSTRAINT "Fulfilment_tracking_lengths" CHECK (("trackingCompany" IS NULL OR char_length("trackingCompany") <= 100)
    AND ("trackingNumber" IS NULL OR char_length("trackingNumber") <= 100)
    AND ("trackingUrl" IS NULL OR (char_length("trackingUrl") <= 2048 AND "trackingUrl" ~ '^https?://')));
ALTER TABLE "FulfilmentLine"
  ADD CONSTRAINT "FulfilmentLine_quantity_positive" CHECK (quantity > 0);
ALTER TABLE "OrderNotification"
  ADD CONSTRAINT "OrderNotification_attempts" CHECK (attempts >= 0),
  ADD CONSTRAINT "OrderNotification_recipient" CHECK (char_length(recipient) BETWEEN 3 AND 254),
  ADD CONSTRAINT "OrderNotification_sent_pair" CHECK ((status = 'SENT') = ("sentAt" IS NOT NULL));

-- ---------------------------------------------------------------------------
-- 2. References stay in their store. Single-column references (the ERD's
--    SET NULL links) are checked by trigger; composite FKs cover the rest.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app_reference_in_store() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    i int := 0;
    col text;
    target text;
    ref uuid;
    ref_store uuid;
  BEGIN
    WHILE i < array_length(TG_ARGV, 1) LOOP
      col := TG_ARGV[i];
      target := TG_ARGV[i + 1];
      ref := (to_jsonb(NEW) ->> col)::uuid;
      IF ref IS NOT NULL AND (TG_OP = 'INSERT' OR ref IS DISTINCT FROM (to_jsonb(OLD) ->> col)::uuid) THEN
        EXECUTE format('SELECT "storeId" FROM %I WHERE id = $1', target) INTO ref_store USING ref;
        IF ref_store IS DISTINCT FROM NEW."storeId" THEN
          RAISE EXCEPTION '%.% must reference a % of the same store', TG_TABLE_NAME, col, target
            USING ERRCODE = 'foreign_key_violation';
        END IF;
      END IF;
      i := i + 2;
    END LOOP;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER "Checkout_references_in_store" BEFORE INSERT OR UPDATE ON "Checkout"
  FOR EACH ROW EXECUTE FUNCTION app_reference_in_store('customerId', 'Customer',
    'shippingRateId', 'ShippingRate', 'completedOrderId', 'Order');
CREATE TRIGGER "Order_references_in_store" BEFORE INSERT OR UPDATE ON "Order"
  FOR EACH ROW EXECUTE FUNCTION app_reference_in_store('customerId', 'Customer', 'checkoutId', 'Checkout');
CREATE TRIGGER "OrderLine_references_in_store" BEFORE INSERT OR UPDATE ON "OrderLine"
  FOR EACH ROW EXECUTE FUNCTION app_reference_in_store('productId', 'Product', 'variantId', 'ProductVariant');
CREATE TRIGGER "OrderTaxLine_references_in_store" BEFORE INSERT OR UPDATE ON "OrderTaxLine"
  FOR EACH ROW EXECUTE FUNCTION app_reference_in_store('orderLineId', 'OrderLine');
CREATE TRIGGER "OrderDiscount_references_in_store" BEFORE INSERT ON "OrderDiscount"
  FOR EACH ROW EXECUTE FUNCTION app_reference_in_store('discountId', 'Discount');
CREATE TRIGGER "OrderShippingLine_references_in_store" BEFORE INSERT ON "OrderShippingLine"
  FOR EACH ROW EXECUTE FUNCTION app_reference_in_store('shippingRateId', 'ShippingRate');
CREATE TRIGGER "Payment_references_in_store" BEFORE INSERT OR UPDATE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION app_reference_in_store('checkoutId', 'Checkout', 'orderId', 'Order');
CREATE TRIGGER "InventoryReservation_references_in_store" BEFORE INSERT OR UPDATE ON "InventoryReservation"
  FOR EACH ROW EXECUTE FUNCTION app_reference_in_store('checkoutId', 'Checkout', 'orderId', 'Order',
    'orderLineId', 'OrderLine');
CREATE TRIGGER "DiscountRedemption_references_in_store" BEFORE INSERT OR UPDATE ON "DiscountRedemption"
  FOR EACH ROW EXECUTE FUNCTION app_reference_in_store('checkoutId', 'Checkout', 'discountCodeId',
    'DiscountCode', 'customerId', 'Customer');

-- ---------------------------------------------------------------------------
-- 3. One currency per store at the time of the row; children follow their
--    order (whose currency never changes).
-- ---------------------------------------------------------------------------
CREATE FUNCTION app_currency_matches_store() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF NEW.currency IS NOT NULL
      AND NEW.currency IS DISTINCT FROM (SELECT currency FROM "Store" WHERE id = NEW."storeId") THEN
      RAISE EXCEPTION '% currency must be the store currency', TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER "Checkout_store_currency" BEFORE INSERT ON "Checkout"
  FOR EACH ROW EXECUTE FUNCTION app_currency_matches_store();
CREATE TRIGGER "Order_store_currency" BEFORE INSERT ON "Order"
  FOR EACH ROW EXECUTE FUNCTION app_currency_matches_store();
CREATE TRIGGER "Payment_store_currency" BEFORE INSERT ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION app_currency_matches_store();
CREATE TRIGGER "Discount_store_currency" BEFORE INSERT OR UPDATE OF currency ON "Discount"
  FOR EACH ROW EXECUTE FUNCTION app_currency_matches_store();
CREATE TRIGGER "ShippingRate_store_currency" BEFORE INSERT OR UPDATE OF currency ON "ShippingRate"
  FOR EACH ROW EXECUTE FUNCTION app_currency_matches_store();

CREATE FUNCTION app_currency_matches_order() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF NEW.currency IS DISTINCT FROM (SELECT currency FROM "Order" WHERE id = NEW."orderId") THEN
      RAISE EXCEPTION '% currency must be the order currency', TG_TABLE_NAME USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END
  $$;
CREATE TRIGGER "OrderLine_order_currency" BEFORE INSERT ON "OrderLine"
  FOR EACH ROW EXECUTE FUNCTION app_currency_matches_order();
CREATE TRIGGER "OrderDiscount_order_currency" BEFORE INSERT ON "OrderDiscount"
  FOR EACH ROW EXECUTE FUNCTION app_currency_matches_order();
CREATE TRIGGER "OrderShippingLine_order_currency" BEFORE INSERT ON "OrderShippingLine"
  FOR EACH ROW EXECUTE FUNCTION app_currency_matches_order();
CREATE TRIGGER "OrderTaxLine_order_currency" BEFORE INSERT ON "OrderTaxLine"
  FOR EACH ROW EXECUTE FUNCTION app_currency_matches_order();
CREATE TRIGGER "Refund_order_currency" BEFORE INSERT ON "Refund"
  FOR EACH ROW EXECUTE FUNCTION app_currency_matches_order();

-- ---------------------------------------------------------------------------
-- 4. Commercial history is immutable (ADR-0031 §5). Grants already limit
--    what each role may update; these triggers hold for every role.
-- ---------------------------------------------------------------------------
CREATE TRIGGER "Order_snapshot_immutable" BEFORE UPDATE ON "Order"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('orderNumber', 'checkoutId', 'email',
    'phone', 'currency', 'pricesIncludeTax', 'subtotalAmount', 'discountAmount', 'shippingAmount',
    'taxAmount', 'totalAmount', 'placedAt', 'sourceName', 'customerLocale', 'stockShortage');
CREATE TRIGGER "OrderLine_snapshot_immutable" BEFORE UPDATE ON "OrderLine"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('orderId', 'productTitle', 'variantTitle',
    'sku', 'currency', 'unitPriceAmount', 'quantity', 'discountAmount', 'taxAmount', 'totalAmount',
    'requiresShipping', 'taxable', 'weightGrams', 'attributes');
CREATE TRIGGER "Payment_terms_immutable" BEFORE UPDATE ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('connectionId', 'checkoutId', 'provider',
    'currency', 'amount', 'idempotencyKey');
CREATE TRIGGER "Refund_terms_immutable" BEFORE UPDATE ON "Refund"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('orderId', 'paymentId', 'currency', 'amount',
    'idempotencyKey', 'createdById');
CREATE TRIGGER "Fulfilment_terms_immutable" BEFORE UPDATE ON "Fulfilment"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('orderId', 'locationId');
CREATE TRIGGER "InventoryReservation_terms_immutable" BEFORE UPDATE ON "InventoryReservation"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('inventoryItemId', 'locationId', 'checkoutId',
    'quantity');
CREATE TRIGGER "Checkout_terms_immutable" BEFORE UPDATE ON "Checkout"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('cartId', 'currency', 'tokenHash');
CREATE TRIGGER "DiscountRedemption_terms_immutable" BEFORE UPDATE ON "DiscountRedemption"
  FOR EACH ROW EXECUTE FUNCTION app_forbid_parent_change('discountId', 'checkoutId', 'discountCodeId');

-- Snapshot rows are written once and never change or disappear.
CREATE FUNCTION app_append_only() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
  BEGIN
    RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END
  $$;
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['OrderAddress', 'OrderDiscount', 'OrderShippingLine', 'OrderTaxLine',
    'OrderEvent', 'RefundLine', 'FulfilmentLine'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I
      FOR EACH ROW EXECUTE FUNCTION app_append_only()', t || '_append_only', t);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 4b. Integration events (ADR-0031 §11), from the database itself like the
--     M4 cache events: whichever role changes an order or settles a refund,
--     the event is written in the same transaction, and no role needs INSERT
--     on OutboxEvent. Events carry ids and numbers only.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app_order_outbox() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    events text[] := ARRAY[]::text[];
    entity_type text := 'Order';
    payload jsonb;
    e text;
  BEGIN
    IF TG_TABLE_NAME = 'Order' THEN
      payload := jsonb_build_object('orderNumber', NEW."orderNumber");
      IF TG_OP = 'INSERT' THEN
        events := ARRAY['order.created'];
        IF NEW."paymentStatus" = 'PAID' THEN events := array_append(events, 'order.paid'); END IF;
      ELSE
        IF NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED' THEN
          events := array_append(events, 'order.cancelled');
        END IF;
        IF NEW."fulfilmentStatus" IS DISTINCT FROM OLD."fulfilmentStatus" THEN
          events := array_append(events, 'order.fulfilled');
          payload := payload || jsonb_build_object('fulfilmentStatus', NEW."fulfilmentStatus");
        END IF;
      END IF;
    ELSIF TG_TABLE_NAME = 'Refund' THEN
      entity_type := 'Refund';
      payload := jsonb_build_object('orderId', NEW."orderId", 'amount', NEW.amount::text);
      IF NEW.status = 'SUCCEEDED' AND OLD.status <> 'SUCCEEDED' THEN
        events := ARRAY['refund.created'];
      END IF;
    END IF;
    FOREACH e IN ARRAY events LOOP
      INSERT INTO "OutboxEvent" (id, "organisationId", "storeId", type, "entityType", "entityId", payload)
        VALUES (gen_random_uuid(), NEW."organisationId", NEW."storeId", e, entity_type, NEW.id, payload);
    END LOOP;
    RETURN NULL;
  END
  $$;
REVOKE ALL ON FUNCTION app_order_outbox() FROM PUBLIC;
CREATE TRIGGER "Order_outbox_insert" AFTER INSERT ON "Order"
  FOR EACH ROW EXECUTE FUNCTION app_order_outbox();
CREATE TRIGGER "Order_outbox_update" AFTER UPDATE OF status, "fulfilmentStatus" ON "Order"
  FOR EACH ROW EXECUTE FUNCTION app_order_outbox();
CREATE TRIGGER "Refund_outbox" AFTER UPDATE OF status ON "Refund"
  FOR EACH ROW EXECUTE FUNCTION app_order_outbox();

-- ---------------------------------------------------------------------------
-- 5. Row-level security: the tenant policy on every new table, ownership
--    columns immutable.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Customer', 'Checkout', 'InventoryReservation', 'Discount', 'DiscountCode',
    'DiscountRedemption', 'ShippingZone', 'ShippingZoneCountry', 'ShippingRate', 'TaxConfiguration',
    'TaxRate', 'Order', 'OrderLine', 'OrderAddress', 'OrderDiscount', 'OrderShippingLine',
    'OrderTaxLine', 'OrderEvent', 'PaymentProviderConnection', 'Payment', 'PaymentWebhookEvent',
    'Refund', 'RefundLine', 'Fulfilment', 'FulfilmentLine', 'OrderNotification'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING ("organisationId" = app_current_org()
           AND (app_current_store() IS NULL OR "storeId" = app_current_store()))
         WITH CHECK ("organisationId" = app_current_org()
           AND (app_current_store() IS NULL OR "storeId" = app_current_store()))', t);
    IF t NOT IN ('OrderAddress', 'OrderDiscount', 'OrderShippingLine', 'OrderTaxLine', 'OrderEvent',
      'RefundLine', 'FulfilmentLine') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION app_forbid_owner_change()', t || '_immutable_owner', t);
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- 6. The checkout role (ADR-0031 §9): one store and one checkout.
--    app.checkout_id is set only after the checkout's token (or a verified
--    provider reference) identified it; app.checkout_token / app.cart_token
--    carry token hashes for the lookups that come before that.
-- ---------------------------------------------------------------------------
CREATE FUNCTION app_current_checkout() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.checkout_id', true), '')::uuid $$;
CREATE FUNCTION app_current_checkout_token() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.checkout_token', true), '') $$;
CREATE FUNCTION app_current_cart_token() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.cart_token', true), '') $$;

-- Order numbers per store (#1001, #1002, …): the store row lock serialises
-- allocation, so two orders never share a number.
CREATE FUNCTION app_next_order_number() RETURNS int
  LANGUAGE sql SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    UPDATE "Store" SET "nextOrderNumber" = "nextOrderNumber" + 1
    WHERE id = app_current_store() AND app_current_store() IS NOT NULL
    RETURNING "nextOrderNumber" - 1
  $$;

-- The store a payment connection belongs to: the webhook route learns its
-- scope from the connection id in its URL, before it can verify anything.
CREATE FUNCTION app_payment_connection_scope(connection uuid)
  RETURNS TABLE (organisation_id uuid, store_id uuid, provider text, mode "PaymentProviderMode",
    status "PaymentConnectionStatus")
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT "organisationId", "storeId", provider, mode, status
    FROM "PaymentProviderConnection" WHERE id = connection
  $$;

-- The checkout a provider payment reference belongs to, within the current
-- store (after a webhook was verified with that store's secret).
CREATE FUNCTION app_checkout_for_payment(payment_provider text, reference text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT "checkoutId" FROM "Payment"
    WHERE provider = payment_provider AND "providerPaymentId" = reference
      AND "storeId" = app_current_store() AND app_current_store() IS NOT NULL
  $$;

REVOKE ALL ON FUNCTION app_reference_in_store(), app_currency_matches_store(),
  app_currency_matches_order(), app_append_only(), app_current_checkout(),
  app_current_checkout_token(), app_current_cart_token(), app_next_order_number(),
  app_payment_connection_scope(uuid), app_checkout_for_payment(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_current_org(), app_current_store(), app_current_checkout(),
  app_current_checkout_token(), app_current_cart_token(), app_next_order_number(),
  app_payment_connection_scope(uuid), app_checkout_for_payment(text, text),
  app_storefront_availability(uuid[]) TO storevia_checkout;
GRANT EXECUTE ON FUNCTION app_current_checkout(), app_current_checkout_token(),
  app_current_cart_token() TO storevia_app, storevia_worker;

-- Restrictive policies: whatever a query asks, the checkout role sees its
-- store's sellable catalogue and configuration, and one checkout's rows. It
-- has no access to Store itself: the store and its currency come from the
-- host resolver's result (or, for webhooks, the verified connection).
CREATE POLICY checkout_scope ON "Cart" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store() AND ("tokenHash" = app_current_cart_token()
    OR id = (SELECT c."cartId" FROM "Checkout" c WHERE c.id = app_current_checkout())))
  WITH CHECK ("storeId" = app_current_store());
CREATE POLICY checkout_scope ON "CartLine" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store() AND EXISTS (SELECT 1 FROM "Cart" c WHERE c.id = "cartId"));
CREATE POLICY checkout_scope ON "Checkout" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store()
    AND (id = app_current_checkout() OR "tokenHash" = app_current_checkout_token()))
  WITH CHECK ("storeId" = app_current_store());
CREATE POLICY checkout_scope ON "Product" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store() AND status = 'ACTIVE' AND "deletedAt" IS NULL);
CREATE POLICY checkout_scope ON "ProductVariant" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store() AND "deletedAt" IS NULL
    AND EXISTS (SELECT 1 FROM "Product" p WHERE p.id = "productId"));
CREATE POLICY checkout_scope ON "InventoryItem" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store());
CREATE POLICY checkout_scope ON "Location" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store() AND "deletedAt" IS NULL);
CREATE POLICY checkout_scope ON "InventoryLevel" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store()) WITH CHECK ("storeId" = app_current_store());
CREATE POLICY checkout_scope ON "InventoryMovement" AS RESTRICTIVE TO storevia_checkout
  USING (false) WITH CHECK ("storeId" = app_current_store());
CREATE POLICY checkout_scope ON "InventoryReservation" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store() AND "checkoutId" = app_current_checkout())
  WITH CHECK ("storeId" = app_current_store() AND "checkoutId" = app_current_checkout());
CREATE POLICY checkout_scope ON "Discount" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store());
CREATE POLICY checkout_scope ON "DiscountCode" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store());
CREATE POLICY checkout_scope ON "DiscountRedemption" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store() AND "checkoutId" = app_current_checkout())
  WITH CHECK ("storeId" = app_current_store() AND "checkoutId" = app_current_checkout());
CREATE POLICY checkout_scope ON "ShippingZone" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store());
CREATE POLICY checkout_scope ON "ShippingZoneCountry" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store());
CREATE POLICY checkout_scope ON "ShippingRate" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store() AND active);
CREATE POLICY checkout_scope ON "TaxConfiguration" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store());
CREATE POLICY checkout_scope ON "TaxRate" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store());
-- The customer with this checkout's email, and no other.
CREATE POLICY checkout_scope ON "Customer" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store() AND "deletedAt" IS NULL
    AND email = (SELECT c.email::citext FROM "Checkout" c WHERE c.id = app_current_checkout()))
  WITH CHECK ("storeId" = app_current_store()
    AND email = (SELECT c.email::citext FROM "Checkout" c WHERE c.id = app_current_checkout()));
CREATE POLICY checkout_scope ON "Order" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store() AND "checkoutId" = app_current_checkout())
  WITH CHECK ("storeId" = app_current_store() AND "checkoutId" = app_current_checkout());
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['OrderLine', 'OrderAddress', 'OrderDiscount', 'OrderShippingLine',
    'OrderTaxLine', 'OrderEvent', 'OrderNotification'] LOOP
    EXECUTE format('CREATE POLICY checkout_scope ON %I AS RESTRICTIVE TO storevia_checkout
      USING ("storeId" = app_current_store() AND EXISTS (SELECT 1 FROM "Order" o WHERE o.id = "orderId"))
      WITH CHECK ("storeId" = app_current_store() AND EXISTS (SELECT 1 FROM "Order" o WHERE o.id = "orderId"))', t);
  END LOOP;
END
$$;
CREATE POLICY checkout_scope ON "Payment" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store() AND "checkoutId" = app_current_checkout())
  WITH CHECK ("storeId" = app_current_store() AND "checkoutId" = app_current_checkout());
CREATE POLICY checkout_scope ON "PaymentProviderConnection" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store());
CREATE POLICY checkout_scope ON "PaymentWebhookEvent" AS RESTRICTIVE TO storevia_checkout
  USING ("storeId" = app_current_store()) WITH CHECK ("storeId" = app_current_store());
CREATE POLICY checkout_own_buckets ON "RateLimit" TO storevia_checkout
  USING (key LIKE 'checkout:%') WITH CHECK (key LIKE 'checkout:%');

GRANT SELECT, UPDATE (status, "updatedAt") ON "Cart" TO storevia_checkout;
GRANT SELECT ON "CartLine" TO storevia_checkout;
GRANT SELECT, INSERT ON "Checkout" TO storevia_checkout;
GRANT UPDATE (email, status, "shippingAddress", "billingAddress", "shippingRateId", "discountCode",
  "subtotalAmount", "discountAmount", "shippingAmount", "taxAmount", "totalAmount", "pricingHash",
  quote, "pricedAt", "expiresAt", "completedOrderId", "customerId", "updatedAt")
  ON "Checkout" TO storevia_checkout;
GRANT SELECT (id, "organisationId", "storeId", title, handle, status, "deletedAt")
  ON "Product" TO storevia_checkout;
GRANT SELECT (id, "organisationId", "storeId", "productId", title, sku, currency, "priceAmount",
  "weightGrams", "requiresShipping", taxable, "inventoryPolicy", "deletedAt")
  ON "ProductVariant" TO storevia_checkout;
GRANT SELECT (id, "organisationId", "storeId", "variantId", tracked) ON "InventoryItem" TO storevia_checkout;
GRANT SELECT (id, "organisationId", "storeId", name, "isActive", "fulfilsOnlineOrders", priority,
  "deletedAt") ON "Location" TO storevia_checkout;
GRANT SELECT, INSERT ON "InventoryLevel" TO storevia_checkout;
GRANT UPDATE (available, reserved, "updatedAt") ON "InventoryLevel" TO storevia_checkout;
GRANT INSERT ON "InventoryMovement" TO storevia_checkout;
GRANT SELECT, INSERT ON "InventoryReservation" TO storevia_checkout;
GRANT UPDATE (status, "orderId", "orderLineId", "updatedAt") ON "InventoryReservation" TO storevia_checkout;
GRANT SELECT ON "Discount", "DiscountCode", "ShippingZone", "ShippingZoneCountry", "ShippingRate",
  "TaxConfiguration", "TaxRate", "PaymentProviderConnection" TO storevia_checkout;
GRANT UPDATE ("usageCount", "updatedAt") ON "Discount" TO storevia_checkout;
GRANT SELECT, INSERT ON "DiscountRedemption" TO storevia_checkout;
GRANT UPDATE (status, "orderId", "customerId", "updatedAt") ON "DiscountRedemption" TO storevia_checkout;
GRANT SELECT, INSERT ON "Customer" TO storevia_checkout;
GRANT UPDATE ("firstName", "lastName", phone, "updatedAt") ON "Customer" TO storevia_checkout;
GRANT SELECT, INSERT ON "Order", "OrderLine", "OrderAddress", "OrderDiscount", "OrderShippingLine",
  "OrderTaxLine", "OrderEvent", "OrderNotification" TO storevia_checkout;
GRANT SELECT, INSERT ON "Payment" TO storevia_checkout;
GRANT UPDATE (status, "providerPaymentId", "providerChargeId", "redirectUrl", "capturedAmount",
  "capturedAt", "failureCode", "failureMessage", "orderId", "updatedAt") ON "Payment" TO storevia_checkout;
GRANT SELECT, INSERT ON "PaymentWebhookEvent" TO storevia_checkout;
GRANT UPDATE (status, attempts, "lastError", "processedAt") ON "PaymentWebhookEvent" TO storevia_checkout;
GRANT SELECT, INSERT, UPDATE ON "RateLimit" TO storevia_checkout;

-- ---------------------------------------------------------------------------
-- 7. The merchant role: tenant-scoped reads; writes only through services,
--    and never to commercial snapshots.
-- ---------------------------------------------------------------------------
GRANT SELECT ON "Customer", "Order", "OrderLine", "OrderAddress", "OrderDiscount",
  "OrderShippingLine", "OrderTaxLine", "OrderEvent", "OrderNotification", "Payment",
  "PaymentProviderConnection", "Refund", "RefundLine", "Fulfilment", "FulfilmentLine",
  "InventoryReservation", "Discount", "DiscountCode", "DiscountRedemption", "ShippingZone",
  "ShippingZoneCountry", "ShippingRate", "TaxConfiguration", "TaxRate" TO storevia_app;
GRANT UPDATE (note, tags, "updatedAt") ON "Customer" TO storevia_app;
GRANT UPDATE (status, "paymentStatus", "fulfilmentStatus", "refundedAmount", "cancelledAt",
  "cancelReason", note, tags, "updatedAt") ON "Order" TO storevia_app;
GRANT UPDATE ("fulfilledQuantity", "refundedQuantity") ON "OrderLine" TO storevia_app;
GRANT INSERT ON "OrderEvent", "OrderNotification", "Refund", "RefundLine", "Fulfilment",
  "FulfilmentLine" TO storevia_app;
GRANT UPDATE ("refundedAmount", "updatedAt") ON "Payment" TO storevia_app;
GRANT UPDATE (status, "providerRefundId", "failureMessage", "updatedAt") ON "Refund" TO storevia_app;
GRANT UPDATE (status, "updatedAt") ON "InventoryReservation" TO storevia_app;
GRANT INSERT ON "PaymentProviderConnection" TO storevia_app;
GRANT UPDATE (status, "externalAccountId", "credentialsCiphertext", "keyVersion", "credentialHint",
  "updatedAt") ON "PaymentProviderConnection" TO storevia_app;
GRANT INSERT, DELETE ON "Discount", "DiscountCode" TO storevia_app;
GRANT UPDATE (title, status, "percentageBps", amount, currency, "minSubtotalAmount", "startsAt",
  "endsAt", "usageLimit", "updatedAt") ON "Discount" TO storevia_app;
GRANT INSERT, DELETE ON "ShippingZone", "ShippingZoneCountry", "ShippingRate", "TaxRate" TO storevia_app;
GRANT UPDATE (name, "updatedAt") ON "ShippingZone" TO storevia_app;
GRANT UPDATE ("regionCodes") ON "ShippingZoneCountry" TO storevia_app;
GRANT UPDATE (name, type, amount, "minSubtotalAmount", "maxSubtotalAmount", active, "updatedAt")
  ON "ShippingRate" TO storevia_app;
GRANT INSERT ON "TaxConfiguration" TO storevia_app;
GRANT UPDATE ("pricesIncludeTax", "chargeTaxOnShipping", "taxRegistrationId", "updatedAt")
  ON "TaxConfiguration" TO storevia_app;
GRANT UPDATE (name, "countryCode", "regionCode", "ratePpm", "updatedAt") ON "TaxRate" TO storevia_app;

-- ---------------------------------------------------------------------------
-- 8. The worker: sweeps find expired checkouts and pending payments (the
--    checkout service then acts under the checkout role), purges expired
--    checkouts' contact details, and sends notifications.
-- ---------------------------------------------------------------------------
GRANT SELECT (id, "organisationId", "storeId", status, "expiresAt", "updatedAt") ON "Checkout" TO storevia_worker;
GRANT UPDATE (email, "shippingAddress", "billingAddress", quote, "updatedAt") ON "Checkout" TO storevia_worker;
GRANT SELECT (id, "organisationId", "storeId", "checkoutId", status, "expiresAt") ON "Payment" TO storevia_worker;
GRANT SELECT, UPDATE (status, attempts, "nextAttemptAt", "lastError", "sentAt", "updatedAt")
  ON "OrderNotification" TO storevia_worker;
GRANT SELECT ON "Order", "OrderLine", "OrderAddress", "OrderShippingLine", "Refund", "Fulfilment",
  "FulfilmentLine" TO storevia_worker;
GRANT SELECT (name, currency, locale) ON "Store" TO storevia_worker;
