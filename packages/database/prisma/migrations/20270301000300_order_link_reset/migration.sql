-- Order links can be reset (M8 security review S4). A shopper's order link
-- is a bearer link; one that leaked (forwarded email, shared screen) stayed
-- valid for 180 days, and the only kill switch was rotating the secret for
-- every order. Staff with order.manage can now revoke an order's links and
-- issue a new one (sent in a fresh confirmation email): the app role may
-- insert access rows as well as revoke them, within its tenant policy.
GRANT INSERT ON "OrderCustomerAccess" TO storevia_app;
