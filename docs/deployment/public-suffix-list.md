# Public Suffix List submission for `storevia.site`

> Milestone 4 (M4-10), ADR-0028 §12, ADR-0029 §5. Status: **not yet
> submitted**. An operational step for whoever owns the `storevia.site`
> registration.

## Position

- Submission is a **production prerequisite before a broad multi-tenant
  launch** on `{merchant}.storevia.site`. It does not block development or
  internal testing, and nothing in the product depends on it being done.
- Nothing here is marked done until the pull request is merged into the
  list; this page records the date when it is.
- Whatever the PSL state, these hold and are tested:
  - **Cookies are host-only.** Cart and preview cookies are `__Host-`
    cookies over HTTPS (`sv_cart`/`sv_preview` without `Secure` on plain
    HTTP in development). The storefront never sets
    `Domain=.storevia.site`; a unit test (`packages/site-engine/src/boundary.test.ts`)
    fails if any public code sets a cookie domain, and the storefront E2E
    checks the cart cookie has none.
  - **Host validation** is mandatory: every request's `Host` is normalised
    and resolved to an ACTIVE domain before anything else, and redirects
    come only from database rows.
  - **Origin validation** is mandatory on state changes: cart changes are
    server actions, which Next.js refuses when `Origin` doesn't match the
    host. The storefront E2E posts the add-to-cart action with a foreign
    `Origin` and checks it is refused and the cart unchanged, then checks
    the same request from the store's own origin works.
  - **Tenant isolation** (store-scoped transactions, RLS and the storefront
    role's policies) is mandatory; the PSL is defence in depth for
    browsers, not an isolation mechanism.

## Why

Every store is served from `{slug}.storevia.site`. Until `storevia.site` is
on the [Public Suffix List](https://publicsuffix.org/) (PSL), browsers
treat all store hosts as one "site": a page on one store could set a cookie
for `.storevia.site` that every other store receives, and same-site
protections (`SameSite` cookies, some storage partitioning) don't separate
stores. Listing it makes each `{slug}.storevia.site` its own registrable
domain, as `github.io` and similar platforms do.

## What protects stores until then

- The storefront sets only **host-only** cookies (`__Host-sv_cart`,
  `__Host-sv_preview` over HTTPS: no `Domain` attribute, `Path=/`,
  `Secure`). The `__Host-` prefix means a browser refuses any cookie of
  that name that another store tried to set for the parent domain.
- Merchants can't run their own scripts on store pages (no custom code
  until the sandboxed `CustomHTML` component, M5+), and the CSP is
  nonce-based.
- Nothing on `storevia.site` authenticates merchants or staff: dashboard
  and staff sessions live on `storevia.com` hosts.

So listing is defence in depth, not a precondition for launch. It must be
done before any feature lets merchants run script on their store.

## Submission checklist

1. [ ] Confirm the registration of `storevia.site` runs for **at least two
       more years** (the PSL maintainers require it) and turn on
       auto-renew.
2. [ ] Add the DNS record the PSL requires:
       `_psl.storevia.site. TXT "https://github.com/publicsuffix/list/pull/<PR number>"`.
3. [ ] Open a pull request against
       [publicsuffix/list](https://github.com/publicsuffix/list) adding to
       the **PRIVATE DOMAINS** section, in alphabetical order by
       organisation:

       ```text
       // Storevia : https://storevia.com
       // Submitted by <name> <security contact email>
       storevia.site
       ```

4. [ ] Fill in the PR template: the organisation, the reason (per-merchant
       subdomains with cookie isolation between stores), and confirm that
       the domain isn't being listed to work around rate limits (e.g. Let's
       Encrypt), which the maintainers refuse.
5. [ ] Keep the `_psl` TXT record in place for as long as the entry exists.
6. [ ] After the PR is merged, record the date here and check that current
       browsers pick up the list (it ships with browser releases, which
       takes weeks to months).
7. [ ] Never serve anything on the bare `storevia.site` apex that relies on
       cookies being shared with store hosts: after listing, that stops
       working by design.

## Related

- Slug changes never free an address: an old slug stays in
  `StoreSlugHistory`, keeps redirecting to the store's new address, and
  can't be claimed by another store, so a listed hostname never changes
  owner.
- Custom domains (M7) are the merchant's own registrable domains and need
  no listing.
