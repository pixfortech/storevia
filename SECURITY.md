# Security policy

Storevia hosts data for many independent businesses and their customers. We
treat security reports as a top priority.

## Reporting a vulnerability

**Do not open a public issue.** Report privately through GitHub's
[private vulnerability reporting](../../security/advisories/new) for this
repository. Once a dedicated security mailbox is set up, it will be listed
here.

Please include:

- a description of the issue and its impact,
- steps to reproduce (proof of concept if possible),
- affected surface (dashboard, storefront, API, platform admin) and version/commit.

We aim to acknowledge reports within 3 business days and to provide a
remediation timeline after triage. Please give us reasonable time to fix
the issue before any disclosure.

## Scope and rules of engagement

- Only test against accounts and stores you own. Never access, modify or
  delete data belonging to other merchants or their customers.
- No denial-of-service testing, spam, social engineering or physical attacks.
- Stop and report immediately if you reach data that is not yours.

**Cross-tenant data access** (one organisation or store reaching another's
data) is always treated as **critical**.

## Handling secrets

- Secrets are never committed. CI scans full history on every push.
- A committed secret is considered compromised: rotate it first, then remove
  it from history.

## Security architecture

See [docs/security/threat-model.md](docs/security/threat-model.md) and
[docs/architecture/03-tenancy.md](docs/architecture/03-tenancy.md).
