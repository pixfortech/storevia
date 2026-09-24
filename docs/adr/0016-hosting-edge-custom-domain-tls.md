# ADR-0016: Portable containers, managed data services, edge-managed TLS

- Status: Proposed
- Date: 2026-09-24

## Decision

- Every app is built as an OCI container (Next.js `standalone`) and deployed
  to a container platform (recommended: AWS ECS Fargate). Managed
  PostgreSQL (RDS/Aurora, Multi-AZ, PITR), S3, KMS and Secrets Manager.
- Edge: Cloudflare for DNS, WAF, rate limiting, CDN, and **Cloudflare for
  SaaS** custom hostnames with automatic certificate issuance and renewal for
  merchant domains.
- `packages/domains` defines a `DomainProvisioner` interface
  (`provision`, `status`, `deprovision`) so the TLS/custom-hostname provider
  can be swapped (Caddy on-demand TLS, Vercel Domains API, ACM).
- Infrastructure as code; GitHub Actions deploys with OIDC.
- Region: close to the first launch market (e.g. ap-south-1 for India),
  pending data-residency review.

Details: `docs/deployment/deployment-architecture.md`.

## Consequences

- No lock-in at the compute layer; mature managed services for state.
- More infrastructure to own than an all-in-one PaaS. The option to run the
  Next.js apps on Vercel in early stages remains, because the code doesn't
  depend on the platform.
