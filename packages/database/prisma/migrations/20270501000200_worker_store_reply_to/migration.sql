-- Final pass, CO-3: the worker sets Reply-To on a store's emails to its
-- shoppers from the store's support or contact email.
GRANT SELECT ("supportEmail", "contactEmail") ON "Store" TO storevia_worker;
