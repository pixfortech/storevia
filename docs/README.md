# Storevia documentation

## Milestone 0 deliverables

| #   | Deliverable                          | Document                                                                                                                                                   |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Repository assessment                | [architecture/00-repository-assessment.md](architecture/00-repository-assessment.md)                                                                       |
| 2   | Proposed system architecture         | [architecture/01-system-architecture.md](architecture/01-system-architecture.md)                                                                           |
| 3   | Monorepo structure                   | [architecture/02-monorepo.md](architecture/02-monorepo.md)                                                                                                 |
| 4   | Database ERD                         | [database/erd.md](database/erd.md), [database/schema.draft.prisma](database/schema.draft.prisma), [database/data-lifecycle.md](database/data-lifecycle.md) |
| 5   | Tenancy strategy                     | [architecture/03-tenancy.md](architecture/03-tenancy.md)                                                                                                   |
| 6   | Authentication / RBAC strategy       | [architecture/04-auth-rbac.md](architecture/04-auth-rbac.md)                                                                                               |
| 7   | Billing / entitlement strategy       | [architecture/05-billing-entitlements.md](architecture/05-billing-entitlements.md)                                                                         |
| 8   | Storefront architecture              | [architecture/06-storefront.md](architecture/06-storefront.md)                                                                                             |
| 9   | Visual-builder document architecture | [architecture/07-page-builder-document.md](architecture/07-page-builder-document.md)                                                                       |
| 10  | Theme architecture                   | [architecture/08-themes.md](architecture/08-themes.md)                                                                                                     |
| 11  | Security threat model                | [security/threat-model.md](security/threat-model.md)                                                                                                       |
| 12  | Deployment architecture              | [deployment/deployment-architecture.md](deployment/deployment-architecture.md)                                                                             |
| 13  | Phased implementation roadmap        | [roadmap/implementation-roadmap.md](roadmap/implementation-roadmap.md)                                                                                     |
| 14  | GitHub milestones and issues         | [roadmap/github-milestones-and-issues.md](roadmap/github-milestones-and-issues.md)                                                                         |

Supporting documents:

- [Commerce domain rules](architecture/09-commerce.md) (money, inventory, pricing, checkout, orders, payments, discounts)
- [API, webhooks and apps](architecture/10-api-webhooks-apps.md) and [API conventions](api/README.md)
- [Architecture Decision Records](adr/README.md)
- [Testing strategy and security test suites](architecture/11-testing.md) (Milestone 1)
- [Design system](architecture/12-design-system.md) (Milestone 2.5)
- [Toolchain and dependency update policy](engineering/toolchain-policy.md) (ADR-0026)

## Status

Milestone 0 is complete. The document set and ADRs 0002–0019 are the
**approved architecture baseline** (tag `milestone-0`). Changes to
foundational architecture need a new ADR.
