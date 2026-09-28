# Milestone 7: local review

How to try custom domains and the second theme on your machine. Everything
runs against the **local domain simulator**: no Vercel account, token or
internet access is needed, and nothing here calls Vercel.

## 1. Update and start

```sh
git pull
pnpm install
pnpm db:migrate          # 20270101000000_theme_packages, 20270101010000_custom_domains
pnpm db:seed             # plans (custom domains need a plan that includes them)
pnpm build && pnpm start # or: pnpm dev
pnpm --filter @storevia/worker dev   # the worker runs domains.verify every minute
```

Leave `DOMAIN_HOSTING_PROVIDER` unset (or `local`). The dashboard, the
worker and `pnpm domains:simulate` share one state file
(`DOMAIN_PROVIDER_LOCAL_STATE`, default `$TMPDIR/storevia-local-domains.json`).

## 2. A plan with custom domains

New organisations have no plan. In platform-admin
(`http://admin.localhost:3003`), open the organisation and **Assign plan →
Business** (any plan with "Custom domains").

## 3. Connect a domain

1. Dashboard → your store → **Settings → Domains**.
2. Add `shop.mybrand.test` (the simulator accepts `.test` names; real
   deployments refuse them). Try `https://…`, a path, a port, an IP
   address or `something.storevia.site` first: each is refused with a
   plain message.
3. The card shows **Waiting for DNS** and the records to add. Copy the TXT
   value (`storevia-verification=…`) with its Copy button.
4. "Publish" the DNS:

   ```sh
   pnpm domains:simulate shop.mybrand.test --txt "storevia-verification=PASTE" --routed
   ```

5. Wait up to about two minutes for the worker, or press **Check again**.
   The status becomes **Active** and **HTTPS on**.
   Other simulations: `--certificate-pending` (HTTPS pending), `--clear`
   (DNS removed; an active domain shows "Active, check DNS"),
   `--provider-removed`, and hostnames starting `provider-error.`,
   `provider-timeout.` or `provider-conflict.` for provider failures.

## 4. Visit it

Browsers don't resolve `.test` names. Either add
`127.0.0.1 shop.mybrand.test` to your hosts file, or start Chrome with
`--host-resolver-rules="MAP *.test 127.0.0.1"`. Then:

- `http://shop.mybrand.test:3002/` redirects to the store's primary
  address until you press **Make primary**;
- after **Make primary**, the store is served there and
  `http://{slug}.store.localhost:3002/any/path?x=1` redirects (301) to
  `http://shop.mybrand.test:3002/any/path?x=1`;
- `…/sitemap.xml`, `…/robots.txt` and the page's canonical link use the
  custom domain;
- add a product to the cart and check out with test payments on the
  custom domain; the cookies belong to that host only.

Caches: the storefront keeps host lookups for up to 30 s; the worker's
invalidation normally makes changes visible within about 15 s.

## 5. Remove it

**Remove** → confirm. The platform address becomes primary again and the
custom domain stops resolving. Adding it again (from any store) needs a
new TXT record.

## 6. Staff view

platform-admin → **Domains** (read-only): counts by status, search,
reasons and last checks. Tokens and provider project ids are never shown.

## 7. Themes

Dashboard → **Themes**: compare the Storevia and Boutique miniatures (the
same demo store drawn by each theme), **View demo** for Boutique and try
Desktop, Tablet and Mobile and the product page. Then **Install** Boutique,
**Customise** it, **Preview on my store** (the public store keeps the
current theme), **Make live**, then **Make live** on Storevia to switch
back. Pages, products, navigation and URLs don't change; each theme keeps
its own settings.

## 8. Tests

```sh
pnpm --filter @storevia/domains test                # policy, Vercel adapter (mocked HTTP), evaluator
pnpm --filter @storevia/tenancy test:integration    # services, isolation, races
pnpm --filter @storevia/worker test:integration     # domains.verify
pnpm --filter @storevia/database test:integration   # constraints, grants, outbox
cd apps/dashboard && npx playwright test e2e/domains.spec.ts e2e/theme-switch.spec.ts e2e/theme-demo.spec.ts
```
