# Toolchain and dependency update policy

Storevia stays current with supported runtimes and dependencies through
continuous, automated compatibility testing and controlled upgrades
([ADR-0026](../adr/0026-evergreen-toolchain-and-controlled-updates.md)).
"Latest compatible" is a process, not a setting:

```text
a new version is released
  → Storevia tests it (update PR or canary CI)
  → CI proves compatibility
  → the upgrade is accepted (merged)
  → the production baseline advances
```

Builds never resolve "whatever is newest" at build or deploy time. Every
install comes from the committed `pnpm-lock.yaml` with `--frozen-lockfile`,
and every change to it arrives through a reviewed, fully tested pull request.
No manifest uses `latest` or `*`.

## 1. Where the policy lives

| What                                         | Source of truth                                                   |
| -------------------------------------------- | ----------------------------------------------------------------- |
| Minimum supported Node                       | `package.json` → `engines.node` (a floor, never capped: `>=24`)   |
| Required (production) Node LTS line          | `.nvmrc` (a major only: `24`)                                     |
| CI runtime matrix (LTS + canary, PostgreSQL) | `.github/runtime-matrix.json`                                     |
| pnpm version for reproducible installs       | `package.json` → `packageManager` (exact)                         |
| Dependency versions                          | `pnpm-lock.yaml` (+ exact versions in manifests, `save-exact`)    |
| Automatic-merge rules                        | `.github/dependency-policy.json`                                  |
| Update automation                            | `.github/dependabot.yml`, `.github/workflows/toolchain-watch.yml` |

Check where things stand at any time:

```sh
pnpm toolchain:check
```

It prints the minimum, the required LTS line and its latest patch, the
current canary release, the pnpm pin, how **your** Node compares, and any
updates waiting.

## 2. Node.js

| Role                      | Today                     | Meaning                                                                                                                    |
| ------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Minimum supported**     | Node 24                   | `engines.node: ">=24"`. Older runtimes are refused at install (`engine-strict`). Raised deliberately, never by accident.   |
| **Required / production** | Node 24 LTS               | `.nvmrc`. CI tests the latest 24.x patch on every push, and this is what production runs. Recommended for development.     |
| **Canary**                | Node Current (26.x today) | CI tests the newest Current release on every push and weekly. It reports incompatibilities early and never blocks a merge. |

- **Why a floor without a ceiling.** A `<25`-style cap would refuse newer
  runtimes because of stale metadata, not real incompatibility. It would also
  force developers to downgrade. The floor still refuses runtimes that are
  genuinely too old. `engines` states what may be installed. **Support is
  what CI proves**: the required LTS line always, and the canary line
  continuously. A newer major that CI doesn't yet test may work but isn't
  claimed as supported. `pnpm toolchain:check` says which case a machine is
  in.
- **Why not a range such as `^24 || ^26`.** It would need editing for every
  release and still wouldn't prove anything. The canary gives earlier and
  more honest evidence.
- **Promotion.** When a newer major becomes the latest LTS, the weekly
  toolchain watch opens a pull request that changes `.nvmrc`. The full CI
  runs on the new line, and a person merges after reviewing the release notes
  and the canary history. Production adopts it with the next deploy after
  merge.
- **Raising the minimum.** This is a separate, deliberate change: when the
  old LTS line leaves maintenance, or when a feature needs a newer API. Raise
  `engines.node`, `@types/node` (which follows the minimum, so code can't use
  APIs the minimum lacks) and the docs together.
- **Corepack.** Node 24 bundles corepack. Node 25 and later don't: run
  `npm install -g corepack` once, then `corepack enable`.

## 3. pnpm

- `packageManager` pins an exact pnpm version. Corepack and
  `pnpm/action-setup` use it, and pnpm 10+ switches to it automatically
  (`manage-package-manager-versions`), so every machine and CI job produces
  the same lockfile.
- `engines.pnpm: ">=10"` is a floor, for the same reasons as Node.
- Dependabot doesn't update `packageManager`. The **toolchain watch** does:
  every Monday it opens a pull request for newer pnpm releases in the same
  major, and dispatches the full CI on it. New pnpm majors are reported in the
  "Toolchain updates need review" issue, because majors can change lockfile
  or install behaviour.

## 4. Automated updates

| Source                                                    | What                                                                                                       | When                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Dependabot (npm)                                          | Every direct dependency in the pnpm workspace (Next.js, React, Prisma, TypeScript, testing, lint, auth, …) | Weekly (Monday), 3-day cooldown; majors 7 days |
| Dependabot (GitHub Actions)                               | Actions pinned by commit SHA                                                                               | Weekly, 3-day cooldown                         |
| Dependabot security updates                               | Vulnerable dependencies                                                                                    | Immediately (no cooldown)                      |
| Toolchain watch (`.github/workflows/toolchain-watch.yml`) | pnpm (same major: PR; new major: issue), Node LTS promotion (PR), gitleaks (issue)                         | Weekly (Monday)                                |
| CI schedule                                               | The canary meets new Node and PostgreSQL releases even without pushes                                      | Weekly (Monday)                                |

Minor and patch updates are grouped (Next.js + React, Prisma, auth, testing,
TypeScript + lint, styling, everything else), so most weeks bring a few
reviewable PRs. Each major update gets its own PR. The cooldown lets fresh
releases settle before they're proposed, which limits exposure to
compromised or quickly retracted releases.

Dependabot enforces the cooldown with pnpm's `minimumReleaseAge` when it
re-resolves the workspace, and that applies to the versions the repository
already pins as well. If a direct dependency is pinned to a release younger
than the cooldown (for example straight after a manual upgrade or a security
fix), update jobs fail with `ERR_PNPM_NO_MATURE_MATCHING_VERSION` naming that
package, and the Dependabot summary may report the error against a different
dependency. Nothing is wrong with the proposed update: the job succeeds once
the pin is older than the cooldown, on the next scheduled run or a manual
"Check for updates". Outside security fixes, don't pin releases younger than
three days by hand.

## 5. Update classes and automatic merge

Every update PR runs the **complete** CI: format, lint, typecheck, unit,
build, schema checks, integration and tenant-isolation, E2E and the secret
scan on the required LTS line, the same suites on the canary, the Windows job,
and the repository tooling tests. The `Dependency update policy` job runs only
after all required jobs have passed on that commit. It then applies
`.github/dependency-policy.json` (loaded from the base branch, never from the
PR being judged):

| Class               | Rule                                                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Patch**           | Merged automatically after full CI, **unless** the package is high-risk.                                                                                                                                                                          |
| **Minor**           | Merged automatically only for low-risk **development** dependencies. Production dependencies and core frameworks are labelled `dependencies: review required`.                                                                                    |
| **Major**           | Never merged automatically. Needs full CI, release-note and changelog review, a breaking-change analysis, migrations where needed (code, data, config), and explicit approval. `0.x` minors count as majors.                                      |
| **High-risk**       | Next.js, React, Prisma, Better Auth, argon2, `pg`, nodemailer and zod. Every update, including patches, is reviewed: they guard authentication, tenant isolation, data integrity or request handling.                                             |
| **Core frameworks** | TypeScript, typescript-eslint, ESLint, Vitest, Playwright, Tailwind, Turborepo and `@types/node`. Patches merge after CI; minors are reviewed.                                                                                                    |
| **GitHub Actions**  | Always reviewed: actions run with repository credentials.                                                                                                                                                                                         |
| **Security fixes**  | Expedited: they arrive immediately (no cooldown) and follow the same classes. A low-risk patch merges automatically once the full CI is green; a high-risk or major fix is merged by a person as soon as CI is green. Nothing skips verification. |

A grouped PR merges automatically only if **every** dependency in it
qualifies. A PR whose metadata says maintainers changed is always reviewed
(supply-chain signal).

Repository settings this relies on (one-time, by an admin):

- branch protection on `main` requiring the checks listed in
  [CONTRIBUTING.md](../../CONTRIBUTING.md#branch-protection-to-be-configured-on-main);
- "Allow auto-merge" enabled;
- "Allow GitHub Actions to create and approve pull requests" enabled, so the
  toolchain watch can open its PRs (otherwise it opens an issue that points
  at the prepared branch).

## 6. Core framework and runtime updates

Maintained actively: **Node.js, pnpm, Next.js, React, TypeScript, Prisma,
PostgreSQL, Playwright, Vitest.** A major update of any of them is done in its
own branch or PR, touching nothing unrelated:

1. Install the new version and regenerate the lockfile (`pnpm install`).
   Apply the upstream codemods or migration guide.
2. Run `pnpm verify` (format, lint, typecheck, unit tests, production builds
   of dashboard, platform-admin and marketing, Prisma validate, schema
   agreement).
3. Run `pnpm test:tooling`.
4. Migrate a clean PostgreSQL database and seed it: `pnpm db:setup`,
   `pnpm db:test:prepare`, `pnpm db:reset`, `pnpm db:seed:dev`.
5. Run `pnpm test:integration`: integration, tenant-isolation, billing,
   entitlements and worker suites.
6. Run `pnpm test:e2e`, which exercises the dashboard, marketing and
   platform-admin.
7. Start the worker (`pnpm --filter @storevia/worker dev`), check
   `GET /health`, and stop it with Ctrl-C (graceful shutdown).
8. Open the PR with the release-note summary, the breaking changes found,
   and the migrations applied. CI repeats steps 2–6 on both runtimes and on
   Windows.

If an update exposes a problem in another package, fix or report that
separately. Don't widen the PR with unrelated upgrades.

## 7. PostgreSQL

"Latest" never means replacing the production database major automatically.

- **Production baseline:** PostgreSQL 17 (ADR-0004). The required CI jobs run
  on `postgres:17`.
- **Canary:** the canary CI jobs run on the newest PostgreSQL major
  (`postgres:latest`, 18 today), so application incompatibilities surface
  before any upgrade is planned.
- **Local development:** PostgreSQL 16 or newer works (`pnpm db:setup`); 17 is
  recommended.
- **Production major upgrades** are an operations change with their own
  plan: migration rehearsal on a production-sized copy, backup and restore
  validation, an extension compatibility check, and a written rollback plan.
  The baseline in `.github/runtime-matrix.json` moves only after that
  upgrade.

## 8. Intentionally pinned

| Pin                                  | Why                                                                                                           | How it moves                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Exact dependency versions + lockfile | Reproducible development, CI, staging and production                                                          | Dependabot PRs                        |
| `packageManager: pnpm@x.y.z`         | Identical lockfile resolution everywhere                                                                      | Toolchain watch PRs                   |
| `.nvmrc` (major only)                | Names the required LTS line; CI and production take its latest patch                                          | Toolchain watch promotion PR          |
| `@types/node` on the minimum major   | Types must not offer APIs the minimum runtime lacks (Dependabot ignores its majors)                           | Raised with `engines.node`            |
| GitHub Actions by commit SHA         | Supply-chain integrity                                                                                        | Dependabot PRs (always reviewed)      |
| gitleaks version + SHA-256           | The secret scanner itself must be verified                                                                    | Toolchain watch issue → manual update |
| PostgreSQL 17 in required CI         | Mirrors production                                                                                            | After a production major upgrade (§7) |
| TypeScript and other core frameworks | Not frozen: they update through reviewed PRs; ADR-0019's per-version notes are the state at M0, not a ceiling | Dependabot PRs                        |

Nothing here is meant to stay forever. Each pin names the process that
advances it.
