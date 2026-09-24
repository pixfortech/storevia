-- Milestone 2 security review: billing writes move from storevia_system to a
-- dedicated storevia_billing role (created by infrastructure / `pnpm db:setup`
-- before this migration, like the other roles; 03-tenancy.md §5.3).
-- storevia_system is shared with the merchant dashboard's auth path, so it
-- must not be able to change any organisation's subscription.

-- Remove billing privileges from the system role.
REVOKE SELECT ON "Plan", "PlanPrice", "Feature", "PlanFeature" FROM storevia_system;
REVOKE SELECT, INSERT, UPDATE ON "Subscription" FROM storevia_system;
REVOKE INSERT ON "SubscriptionEvent" FROM storevia_system;
REVOKE SELECT ON "BillingCustomer" FROM storevia_system;
REVOKE SELECT, INSERT, UPDATE ON "BillingWebhookEvent" FROM storevia_system;

-- Billing role (BYPASSRLS, narrow): webhook pipeline, mock provider reads,
-- expiry sweep. Nothing on identity, membership or store tables.
GRANT USAGE ON SCHEMA public TO storevia_billing;
GRANT SELECT ON "Plan", "Feature", "PlanFeature" TO storevia_billing;
GRANT SELECT, INSERT ON "Subscription" TO storevia_billing;
GRANT UPDATE ("planId", status, "billingInterval", "startedAt", "trialStartsAt", "trialEndsAt",
  "currentPeriodStart", "currentPeriodEnd", "expiresAt", "cancelledAt", "pastDueSince",
  "graceEndsAt", "endedAt", "providerSyncedAt", "updatedAt") ON "Subscription" TO storevia_billing;
GRANT INSERT ON "SubscriptionEvent" TO storevia_billing;
GRANT SELECT ON "BillingCustomer" TO storevia_billing;
GRANT SELECT, INSERT ON "BillingWebhookEvent" TO storevia_billing;
GRANT UPDATE (status, "organisationId", attempts, outcome, "lastError", "processedAt")
  ON "BillingWebhookEvent" TO storevia_billing;
GRANT INSERT ON "AuditLog" TO storevia_billing;
